"""
Manual Authentication Flow Test Script

This is a manual testing script (not a pytest test) for demonstrating
and manually verifying the complete authentication flow.

Usage:
    cd backend
    python scripts/manual_tests/auth_flow_manual.py

Prerequisites:
    - Backend running on http://localhost:8000
    - You'll need to manually enter the verification code from backend logs
"""

import time

import requests


def test_registration_and_login():
    """Test complete authentication flow"""
    base_url = "http://localhost:8000/api/v1"
    email = "test@example.com"
    password = "test123"
    username = "testuser"

    print("=" * 60)
    print("Testing Authentication Flow")
    print("=" * 60)

    # Step 1: Send verification code
    print("\n1. Sending verification code...")
    response = requests.post(f"{base_url}/auth/send-verification-code", json={"email": email})
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✅ Verification code sent")
        # In dev mode, code is logged. We'll wait a bit and then use a test code
        time.sleep(1)
    else:
        print(f"   ❌ Failed: {response.json()}")
        return

    # Note: In development mode, verification codes are logged to console
    # You'll need to check the backend logs for the actual code
    print("\n   📋 Check backend logs for verification code!")
    print("   Look for: [INFO][email_service.py]: Code: XXXXXX")
    verification_code = input("\n   Enter verification code from logs: ")

    # Step 2: Register user
    print("\n2. Registering user...")
    response = requests.post(
        f"{base_url}/auth/register",
        json={
            "email": email,
            "password": password,
            "username": username,
            "verification_code": verification_code,
        },
    )
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        user_data = response.json()
        print(f"   ✅ User registered: {user_data['id']}")
        print(f"   Username: {user_data['username']}")
        print(f"   Email: {user_data['email']}")
    else:
        print(f"   ❌ Failed: {response.json()}")
        return

    # Step 3: Login
    print("\n3. Logging in...")
    response = requests.post(f"{base_url}/auth/login", json={"email": email, "password": password})
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        token_data = response.json()
        access_token = token_data["access_token"]
        print("   ✅ Login successful")
        print(f"   Token: {access_token[:50]}...")
    else:
        print(f"   ❌ Failed: {response.json()}")
        return

    # Step 4: Verify token with /me endpoint
    print("\n4. Verifying token with /me endpoint...")
    response = requests.get(f"{base_url}/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        me_data = response.json()
        print("   ✅ Token verified")
        print(f"   User ID: {me_data['id']}")
        print(f"   Username: {me_data['username']}")
        print(f"   Email: {me_data['email']}")
    else:
        print(f"   ❌ Failed: {response.json()}")
        return

    print("\n" + "=" * 60)
    print("✅ All tests passed!")
    print("=" * 60)


if __name__ == "__main__":
    try:
        test_registration_and_login()
    except requests.exceptions.ConnectionError:
        print("❌ Error: Could not connect to backend")
        print("Make sure the backend is running on http://localhost:8000")
    except Exception as e:
        print(f"❌ Error: {e}")
