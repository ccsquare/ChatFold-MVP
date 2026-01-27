"""Tests for verification_service Redis atomicity under concurrent access.

These tests require a real Redis instance (fakeredis does not support Lua EVAL).
They verify that the atomic operations prevent race conditions when multiple
requests hit the service simultaneously.

Run: uv run pytest tests/unit/test_verification_atomicity.py -v
"""

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest
import redis

from app.services.verification_service import (
    CODE_EXPIRY,
    IP_RATE_LIMIT_COUNT,
    IP_RATE_LIMIT_WINDOW,
    MAX_ATTEMPTS,
    VerificationCodeService,
)

# Unique prefix to isolate test keys from production data
TEST_PREFIX = f"chatfold:test:{int(time.time())}:"


def _redis_available() -> bool:
    """Check if a real Redis instance is available."""
    try:
        r = redis.Redis(host="127.0.0.1", port=6379, decode_responses=True)
        r.ping()
        r.close()
        return True
    except Exception:
        return False


requires_redis = pytest.mark.skipif(
    not _redis_available(), reason="Real Redis required (fakeredis lacks Lua EVAL)"
)


@pytest.fixture
def real_redis():
    """Provide a real Redis client, cleaning up test keys after each test."""
    client = redis.Redis(host="127.0.0.1", port=6379, decode_responses=True)
    yield client
    # Cleanup: delete all test keys
    for key in client.scan_iter(f"{TEST_PREFIX}*"):
        client.delete(key)
    client.close()


@pytest.fixture
def service(real_redis):
    """Create a VerificationCodeService with a real Redis client and test prefix."""
    svc = VerificationCodeService.__new__(VerificationCodeService)
    svc.redis = real_redis

    # Override key methods to use test prefix
    svc._get_code_key = lambda email: f"{TEST_PREFIX}code:{email}"
    svc._get_rate_limit_key = lambda email: f"{TEST_PREFIX}rate:{email}"
    svc._get_ip_rate_limit_key = lambda ip: f"{TEST_PREFIX}ip:{ip}"

    return svc


# ---------------------------------------------------------------------------
# Basic functional tests
# ---------------------------------------------------------------------------


@requires_redis
class TestVerifyCodeBasic:
    """Basic functional tests for atomic verify_code."""

    def test_correct_code_succeeds(self, service: VerificationCodeService):
        """Correct code should verify successfully and delete the key."""
        email = "test@example.com"
        ok, code = service.send_code(email, "10.0.0.1")
        assert ok

        ok, msg = service.verify_code(email, code)
        assert ok
        assert msg == "Verification successful"

        # Key should be deleted
        assert service.redis.get(f"{TEST_PREFIX}code:{email}") is None

    def test_wrong_code_decrements_remaining(self, service: VerificationCodeService):
        """Wrong code should decrement remaining attempts."""
        email = "test2@example.com"
        ok, _code = service.send_code(email, "10.0.0.2")
        assert ok

        ok, msg = service.verify_code(email, "000000")
        assert not ok
        assert "2 attempts remaining" in msg

    def test_max_attempts_exhausted(self, service: VerificationCodeService):
        """After MAX_ATTEMPTS wrong guesses, next request triggers invalidation."""
        email = "test3@example.com"
        ok, _code = service.send_code(email, "10.0.0.3")
        assert ok

        for _i in range(MAX_ATTEMPTS):
            ok, msg = service.verify_code(email, "000000")
            assert not ok

        # One more attempt triggers the max_attempts guard and deletes the key
        ok, msg = service.verify_code(email, "000000")
        assert not ok
        assert "Maximum" in msg
        assert service.redis.get(f"{TEST_PREFIX}code:{email}") is None

    def test_expired_code(self, service: VerificationCodeService):
        """Verify against non-existent key returns expired."""
        ok, msg = service.verify_code("nobody@example.com", "123456")
        assert not ok
        assert "expired" in msg


# ---------------------------------------------------------------------------
# Concurrency tests — the core of atomicity verification
# ---------------------------------------------------------------------------


@requires_redis
class TestVerifyCodeConcurrency:
    """Verify that concurrent requests cannot bypass MAX_ATTEMPTS."""

    def test_concurrent_wrong_codes_respect_max_attempts(
        self, service: VerificationCodeService, real_redis: redis.Redis
    ):
        """Fire N concurrent wrong-code requests when attempts=MAX_ATTEMPTS-1.

        Only 1 request should see the increment from (MAX_ATTEMPTS-1) → MAX_ATTEMPTS.
        All others should see 'max_attempts' or 'wrong_code' with 0 remaining.
        No request should be able to attempt beyond MAX_ATTEMPTS.
        """
        email = "concurrent-verify@example.com"
        code_key = f"{TEST_PREFIX}code:{email}"

        # Seed a code with attempts already at MAX_ATTEMPTS - 1
        code_data = {
            "code": "999999",
            "attempts": MAX_ATTEMPTS - 1,
            "created_at": int(time.time()),
            "ip": "10.0.0.99",
        }
        real_redis.setex(code_key, CODE_EXPIRY, json.dumps(code_data))

        num_threads = 20
        results = []

        def attempt_verify():
            return service.verify_code(email, "000000")

        with ThreadPoolExecutor(max_workers=num_threads) as pool:
            futures = [pool.submit(attempt_verify) for _ in range(num_threads)]
            for f in as_completed(futures):
                results.append(f.result())

        # Count outcomes
        wrong_code_count = sum(1 for ok, msg in results if "wrong_code" in msg or "attempts remaining" in msg)

        # At most 1 request should see the "wrong_code" increment
        # The rest should see "max_attempts" or "expired" (key deleted)
        assert wrong_code_count <= 1, (
            f"Expected at most 1 wrong_code response, got {wrong_code_count}. "
            f"This indicates a race condition in attempts tracking."
        )
        # All requests should have failed (none should succeed with wrong code)
        assert all(not ok for ok, _ in results)

    def test_concurrent_correct_codes_only_one_succeeds(
        self, service: VerificationCodeService, real_redis: redis.Redis
    ):
        """Fire N concurrent correct-code requests.

        Exactly 1 should succeed; the rest should see 'expired' (key deleted).
        """
        email = "concurrent-correct@example.com"
        code_key = f"{TEST_PREFIX}code:{email}"
        secret_code = "123456"

        code_data = {
            "code": secret_code,
            "attempts": 0,
            "created_at": int(time.time()),
            "ip": "10.0.0.99",
        }
        real_redis.setex(code_key, CODE_EXPIRY, json.dumps(code_data))

        num_threads = 20
        results = []

        def attempt_verify():
            return service.verify_code(email, secret_code)

        with ThreadPoolExecutor(max_workers=num_threads) as pool:
            futures = [pool.submit(attempt_verify) for _ in range(num_threads)]
            for f in as_completed(futures):
                results.append(f.result())

        success_count = sum(1 for ok, _ in results if ok)
        assert success_count == 1, (
            f"Expected exactly 1 success, got {success_count}. "
            f"This indicates a race condition in code verification."
        )


@requires_redis
class TestIPRateLimitConcurrency:
    """Verify that concurrent requests cannot bypass IP rate limit."""

    def test_concurrent_sends_respect_ip_limit(
        self, service: VerificationCodeService, real_redis: redis.Redis
    ):
        """Fire N concurrent send_code requests from the same IP.

        With IP counter already at IP_RATE_LIMIT_COUNT - 1, at most 1 more
        request should pass through.
        """
        ip = "192.168.1.100"
        ip_key = f"{TEST_PREFIX}ip:{ip}"

        # Pre-set counter to 1 below limit
        real_redis.set(ip_key, str(IP_RATE_LIMIT_COUNT - 1))
        real_redis.expire(ip_key, IP_RATE_LIMIT_WINDOW)

        num_threads = 20
        results = []

        def attempt_send(i: int):
            email = f"ip-test-{i}@example.com"
            return service.send_code(email, ip)

        with ThreadPoolExecutor(max_workers=num_threads) as pool:
            futures = [pool.submit(attempt_send, i) for i in range(num_threads)]
            for f in as_completed(futures):
                results.append(f.result())

        success_count = sum(1 for ok, _ in results if ok)
        assert success_count <= 1, (
            f"Expected at most 1 success past IP limit, got {success_count}. "
            f"This indicates a race condition in IP rate limiting."
        )


@requires_redis
class TestEmailRateLimitConcurrency:
    """Verify that concurrent requests cannot bypass email rate limit."""

    def test_concurrent_sends_same_email(
        self, service: VerificationCodeService,
    ):
        """Fire N concurrent send_code requests for the same email.

        Exactly 1 should succeed (SET NX guarantees); the rest should
        get the rate limit message.
        """
        email = "ratelimit@example.com"

        num_threads = 20
        results = []

        def attempt_send():
            return service.send_code(email, "10.0.0.50")

        with ThreadPoolExecutor(max_workers=num_threads) as pool:
            futures = [pool.submit(attempt_send) for _ in range(num_threads)]
            for f in as_completed(futures):
                results.append(f.result())

        success_count = sum(1 for ok, _ in results if ok)
        assert success_count == 1, (
            f"Expected exactly 1 success, got {success_count}. "
            f"This indicates a race condition in email rate limiting."
        )
