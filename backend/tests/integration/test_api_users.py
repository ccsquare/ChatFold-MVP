"""Integration tests for Users API.

Test cases for:
- Get current user
- Update current user
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestUserAPI:
    """Test User API endpoints."""

    def test_get_current_user(self):
        """Get the current (default) user."""
        response = client.get("/api/v1/users/me")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "user_default"
        assert data["plan"] == "free"
        assert "name" in data
        assert "email" in data

    def test_get_user_by_id(self):
        """Get user by ID."""
        response = client.get("/api/v1/users/user_default")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "user_default"

    def test_get_user_not_found(self):
        """Get non-existent user returns 404."""
        response = client.get("/api/v1/users/user_nonexistent")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_current_user_name(self):
        """Update current user's name."""
        # Get original name
        original = client.get("/api/v1/users/me").json()
        original_name = original.get("name", "")

        # Update name
        response = client.patch(
            "/api/v1/users/me",
            params={"name": "Updated Name"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["id"] == "user_default"  # ID unchanged

        # Restore original name
        client.patch("/api/v1/users/me", params={"name": original_name})

    def test_update_current_user_email(self):
        """Update current user's email."""
        # Get original email
        original = client.get("/api/v1/users/me").json()
        original_email = original.get("email", "")

        # Update email
        response = client.patch(
            "/api/v1/users/me",
            params={"email": "updated@example.com"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "updated@example.com"

        # Restore original email
        client.patch("/api/v1/users/me", params={"email": original_email})

    def test_update_current_user_partial(self):
        """Update only one field leaves others unchanged."""
        # Get original state
        original = client.get("/api/v1/users/me").json()

        # Update only name
        response = client.patch(
            "/api/v1/users/me",
            params={"name": "Partial Update"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Partial Update"
        # Email should be unchanged
        assert data["email"] == original["email"]

        # Restore
        client.patch("/api/v1/users/me", params={"name": original.get("name", "")})

    def test_update_no_params(self):
        """Update with no params returns user unchanged."""
        original = client.get("/api/v1/users/me").json()

        response = client.patch("/api/v1/users/me")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == original["id"]
