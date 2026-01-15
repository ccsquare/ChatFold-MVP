"""Verification code service for email-based authentication."""

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

        Args:
            email: User email address
            ip: Client IP address for rate limiting

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            # Check email rate limit
            rate_key = self._get_rate_limit_key(email)
            if self.redis.exists(rate_key):
                ttl = self.redis.ttl(rate_key)
                return False, f"Please wait {ttl} seconds before requesting another code"

            # Check IP rate limit
            ip_key = self._get_ip_rate_limit_key(ip)
            ip_data = self.redis.get(ip_key)
            if ip_data:
                ip_info = json.loads(ip_data)
                if ip_info.get("count", 0) >= IP_RATE_LIMIT_COUNT:
                    return False, "Too many requests from this IP. Please try again later"

            # Generate code
            code = self.generate_code()
            code_key = self._get_code_key(email)

            # Store code with metadata
            code_data = {
                "code": code,
                "attempts": 0,
                "created_at": int(time.time()),
                "ip": ip,
            }

            self.redis.setex(code_key, CODE_EXPIRY, json.dumps(code_data))

            # Set email rate limit
            self.redis.setex(rate_key, EMAIL_RATE_LIMIT, "1")

            # Update IP rate limit
            if ip_data:
                ip_info["count"] += 1
            else:
                ip_info = {"count": 1, "first_send": int(time.time())}
            self.redis.setex(ip_key, IP_RATE_LIMIT_WINDOW, json.dumps(ip_info))

            logger.info(f"Verification code sent to {email}")
            return True, code

        except Exception as e:
            logger.error(f"Error sending verification code: {e}")
            return False, "Failed to send verification code. Please try again later"

    def verify_code(self, email: str, code: str) -> tuple[bool, str]:
        """Verify a verification code.

        Args:
            email: User email address
            code: Verification code to verify

        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            code_key = self._get_code_key(email)
            code_data_str = self.redis.get(code_key)

            if not code_data_str:
                return False, "Verification code has expired"

            code_data = json.loads(code_data_str)

            # Check attempts
            if code_data.get("attempts", 0) >= MAX_ATTEMPTS:
                self.redis.delete(code_key)
                return False, "Maximum verification attempts exceeded"

            # Verify code
            if code_data.get("code") == code:
                # Delete code after successful verification (one-time use)
                self.redis.delete(code_key)
                logger.info(f"Verification code verified for {email}")
                return True, "Verification successful"
            else:
                # Increment attempts
                code_data["attempts"] = code_data.get("attempts", 0) + 1
                ttl = self.redis.ttl(code_key)
                if ttl > 0:
                    self.redis.setex(code_key, ttl, json.dumps(code_data))
                return False, f"Invalid verification code. {MAX_ATTEMPTS - code_data['attempts']} attempts remaining"

        except Exception as e:
            logger.error(f"Error verifying code: {e}")
            return False, "Verification failed. Please try again"


# Global instance
verification_service = VerificationCodeService()
