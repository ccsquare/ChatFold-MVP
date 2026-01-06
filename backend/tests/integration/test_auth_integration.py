"""Automated authentication flow test

This test uses FakeRedis to directly retrieve verification codes,
allowing for fully automated testing without manual intervention.
"""

import requests

from app.db.redis_cache import get_redis_cache
from app.db.redis_db import RedisKeyPrefix


def test_auth_flow_automated():
    """Test complete authentication flow with automated code retrieval"""
    base_url = "http://localhost:8000/api/v1"
    email = "automated_test@example.com"
    password = "test123"
    username = "automated_user"

    # Get Redis cache instance
    cache = get_redis_cache()

    print("=" * 60)
    print("Automated Authentication Flow Test")
    print("=" * 60)

    # Step 1: Send verification code
    print("\n1. Sending verification code...")
    response = requests.post(f"{base_url}/auth/send-verification-code", json={"email": email})
    assert response.status_code == 200, f"Failed to send code: {response.json()}"
    print("   ✅ Verification code sent")

    # Step 2: Retrieve verification code from FakeRedis
    print("\n2. Retrieving verification code from cache...")
    code_key = RedisKeyPrefix.verification_code_key(email)
    code_data = cache.get(code_key)
    assert code_data is not None, "Code not found in cache"
    verification_code = code_data.get("code")
    print(f"   ✅ Retrieved code: {verification_code}")

    # Step 3: Register user
    print("\n3. Registering user...")
    response = requests.post(
        f"{base_url}/auth/register",
        json={
            "email": email,
            "password": password,
            "username": username,
            "verification_code": verification_code,
        },
    )
    assert response.status_code == 200, f"Registration failed: {response.json()}"
    user_data = response.json()
    print(f"   ✅ User registered: {user_data['id']}")
    print(f"      Username: {user_data['username']}")
    print(f"      Email: {user_data['email']}")

    # Step 4: Login
    print("\n4. Logging in...")
    response = requests.post(f"{base_url}/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, f"Login failed: {response.json()}"
    token_data = response.json()
    access_token = token_data["access_token"]
    print("   ✅ Login successful")
    print(f"      Token: {access_token[:50]}...")

    # Step 5: Verify token with /me endpoint
    print("\n5. Verifying token...")
    response = requests.get(f"{base_url}/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert response.status_code == 200, f"Token verification failed: {response.json()}"
    me_data = response.json()
    print("   ✅ Token verified")
    print(f"      User ID: {me_data['id']}")
    print(f"      Username: {me_data['username']}")
    print(f"      Email: {me_data['email']}")

    # Step 6: Test duplicate registration
    print("\n6. Testing duplicate registration prevention...")
    response = requests.post(f"{base_url}/auth/send-verification-code", json={"email": email})
    assert response.status_code == 200, "Should still send code"

    code_key = RedisKeyPrefix.verification_code_key(email)
    code_data = cache.get(code_key)
    new_verification_code = code_data.get("code")

    response = requests.post(
        f"{base_url}/auth/register",
        json={
            "email": email,
            "password": "different_password",
            "username": "different_username",
            "verification_code": new_verification_code,
        },
    )
    assert response.status_code == 400, "Should reject duplicate email"
    print("   ✅ Duplicate registration prevented")

    # Step 7: Test invalid credentials
    print("\n7. Testing invalid credentials...")
    response = requests.post(
        f"{base_url}/auth/login",
        json={"email": email, "password": "wrong_password"},
    )
    assert response.status_code == 401, "Should reject invalid password"
    print("   ✅ Invalid credentials rejected")

    print("\n" + "=" * 60)
    print("✅ All tests passed!")
    print("=" * 60)


if __name__ == "__main__":
    try:
        test_auth_flow_automated()
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        exit(1)
    except requests.exceptions.ConnectionError:
        print("\n❌ Error: Could not connect to backend")
        print("Make sure the backend is running on http://localhost:8000")
        exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback

        traceback.print_exc()
        exit(1)
