"""Verification code service for email-based authentication.

All Redis operations use atomic commands or Lua scripts to ensure
correctness under multi-instance concurrent access.
"""

import json
import logging
import random
import time

from app.db.redis_cache import get_redis_cache

logger = logging.getLogger(__name__)

# Configuration constants
CODE_LENGTH = 6
CODE_EXPIRY = 300  # 5 minutes in seconds
MAX_ATTEMPTS = 3
EMAIL_RATE_LIMIT = 60  # 1 minute between sends
IP_RATE_LIMIT_COUNT = 10
IP_RATE_LIMIT_WINDOW = 3600  # 1 hour

# Lua script for atomic verification code check.
# Guarantees that GET + check attempts + increment/delete executes as a single
# atomic operation in Redis, preventing concurrent requests from bypassing
# the MAX_ATTEMPTS limit.
#
# KEYS[1] = chatfold:verification:code:{email}
# ARGV[1] = user_input_code
# ARGV[2] = max_attempts
#
# Returns JSON:
#   {"ok":true}
#   {"error":"expired"}
#   {"error":"max_attempts"}
#   {"error":"wrong_code","remaining":N}
VERIFY_CODE_SCRIPT = """
local data = redis.call('GET', KEYS[1])
if not data then
    return '{"error":"expired"}'
end

local obj = cjson.decode(data)
local attempts = tonumber(obj.attempts) or 0

if attempts >= tonumber(ARGV[2]) then
    redis.call('DEL', KEYS[1])
    return '{"error":"max_attempts"}'
end

if obj.code == ARGV[1] then
    redis.call('DEL', KEYS[1])
    return '{"ok":true}'
end

obj.attempts = attempts + 1
local ttl = redis.call('TTL', KEYS[1])
if ttl > 0 then
    redis.call('SETEX', KEYS[1], ttl, cjson.encode(obj))
end

local remaining = tonumber(ARGV[2]) - obj.attempts
return '{"error":"wrong_code","remaining":' .. remaining .. '}'
"""


class VerificationCodeService:
    """Redis-based verification code service."""

    def __init__(self):
        """Initialize verification code service."""
        self.redis = get_redis_cache().client

    def _get_code_key(self, email: str) -> str:
        """Get Redis key for verification code."""
        return f"chatfold:verification:code:{email}"

    def _get_rate_limit_key(self, email: str) -> str:
        """Get Redis key for email rate limiting."""
        return f"chatfold:verification:rate:{email}"

    def _get_ip_rate_limit_key(self, ip: str) -> str:
        """Get Redis key for IP rate limiting."""
        return f"chatfold:verification:ip:{ip}"

    def generate_code(self) -> str:
        """Generate a random 6-digit verification code."""
        return "".join([str(random.randint(0, 9)) for _ in range(CODE_LENGTH)])

    def send_code(self, email: str, ip: str) -> tuple[bool, str]:
        """Generate and store verification code.

        Uses atomic Redis commands for all rate limiting checks:
        - Email: SET NX EX (atomic set-if-not-exists with expiry)
        - IP: INCR + EXPIRE (atomic counter)

        Args:
            email: User email address
            ip: Client IP address for rate limiting

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            # Check IP rate limit (atomic counter)
            ip_key = self._get_ip_rate_limit_key(ip)
            ip_count = self.redis.incr(ip_key)
            if ip_count == 1:
                # First request in window — set expiry
                self.redis.expire(ip_key, IP_RATE_LIMIT_WINDOW)
            if ip_count > IP_RATE_LIMIT_COUNT:
                return False, "Too many requests from this IP. Please try again later"

            # Check email rate limit (atomic SET NX EX)
            rate_key = self._get_rate_limit_key(email)
            acquired = self.redis.set(rate_key, "1", nx=True, ex=EMAIL_RATE_LIMIT)
            if not acquired:
                ttl = self.redis.ttl(rate_key)
                return False, f"Please wait {ttl} seconds before requesting another code"

            # Generate and store code
            code = self.generate_code()
            code_key = self._get_code_key(email)

            code_data = {
                "code": code,
                "attempts": 0,
                "created_at": int(time.time()),
                "ip": ip,
            }

            self.redis.setex(code_key, CODE_EXPIRY, json.dumps(code_data))

            logger.info(f"Verification code sent to {email}")
            return True, code

        except Exception as e:
            logger.error(f"Error sending verification code: {e}")
            return False, "Failed to send verification code. Please try again later"

    def verify_code(self, email: str, code: str) -> tuple[bool, str]:
        """Verify a verification code atomically via Lua script.

        The entire check-and-update operation runs as a single atomic Redis
        command, preventing concurrent requests from bypassing MAX_ATTEMPTS.

        Falls back to non-atomic verification if Lua scripts are not supported
        (e.g., when using FakeRedis for development/testing).

        Args:
            email: User email address
            code: Verification code to verify

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            code_key = self._get_code_key(email)

            # Try Lua script first (atomic, for production Redis)
            try:
                result_str = self.redis.eval(
                    VERIFY_CODE_SCRIPT, 1, code_key, code, str(MAX_ATTEMPTS)
                )
                result = json.loads(result_str)
            except Exception as lua_error:
                # Fallback for FakeRedis or Redis without Lua support
                logger.debug(f"Lua script not supported, using fallback: {lua_error}")
                return self._verify_code_fallback(email, code, code_key)

            if result.get("ok"):
                logger.info(f"Verification code verified for {email}")
                return True, "Verification successful"

            error = result.get("error")
            if error == "expired":
                return False, "Verification code has expired"
            if error == "max_attempts":
                return False, "Maximum verification attempts exceeded"
            if error == "wrong_code":
                remaining = result.get("remaining", 0)
                return False, f"Invalid verification code. {remaining} attempts remaining"

            return False, "Verification failed. Please try again"

        except Exception as e:
            logger.error(f"Error verifying code: {e}")
            return False, "Verification failed. Please try again"

    def _verify_code_fallback(self, email: str, code: str, code_key: str) -> tuple[bool, str]:
        """Non-atomic fallback for verification when Lua scripts are not supported.

        This is used for FakeRedis in development/testing. Not suitable for
        production with multiple instances due to race conditions.

        Args:
            email: User email address
            code: Verification code to verify
            code_key: Redis key for the verification code

        Returns:
            Tuple of (success: bool, message: str)
        """
        data = self.redis.get(code_key)
        if not data:
            return False, "Verification code has expired"

        try:
            obj = json.loads(data)
        except json.JSONDecodeError:
            return False, "Verification failed. Please try again"

        attempts = obj.get("attempts", 0)

        if attempts >= MAX_ATTEMPTS:
            self.redis.delete(code_key)
            return False, "Maximum verification attempts exceeded"

        if obj.get("code") == code:
            self.redis.delete(code_key)
            logger.info(f"Verification code verified for {email} (fallback)")
            return True, "Verification successful"

        # Wrong code - increment attempts
        obj["attempts"] = attempts + 1
        ttl = self.redis.ttl(code_key)
        if ttl > 0:
            self.redis.setex(code_key, ttl, json.dumps(obj))

        remaining = MAX_ATTEMPTS - obj["attempts"]
        return False, f"Invalid verification code. {remaining} attempts remaining"


# Global instance
verification_service = VerificationCodeService()
