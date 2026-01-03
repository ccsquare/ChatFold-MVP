"""Integration tests for Folders API.

Test cases for:
- Folder CRUD operations
- Folder input file management
- Folder-Conversation linking
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestFolderCRUD:
    """Test Folder CRUD operations."""

    def test_create_folder(self):
        """Create a new folder."""
        response = client.post(
            "/api/v1/folders",
            json={"name": "Test Folder"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Folder"
        assert data["id"].startswith("folder_")
        assert "createdAt" in data
        assert "updatedAt" in data

        # Cleanup
        client.delete(f"/api/v1/folders/{data['id']}")

    def test_create_folder_default_name(self):
        """Create folder with auto-generated name (timestamp format)."""
        response = client.post("/api/v1/folders", json={})

        assert response.status_code == 200
        data = response.json()
        # Default name is timestamp format: YYYY-MM-DD_HHMM
        assert len(data["name"]) > 0
        assert "_" in data["name"]  # timestamp format contains underscore

        # Cleanup
        client.delete(f"/api/v1/folders/{data['id']}")

    def test_list_folders(self):
        """List all folders."""
        # Create test folders
        folder1 = client.post("/api/v1/folders", json={"name": "Folder 1"}).json()
        folder2 = client.post("/api/v1/folders", json={"name": "Folder 2"}).json()

        response = client.get("/api/v1/folders")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2

        # Verify newest first ordering
        folder_ids = [f["id"] for f in data]
        assert folder_ids.index(folder2["id"]) < folder_ids.index(folder1["id"])

        # Cleanup
        client.delete(f"/api/v1/folders/{folder1['id']}")
        client.delete(f"/api/v1/folders/{folder2['id']}")

    def test_get_folder(self):
        """Get a specific folder by ID."""
        # Create test folder
        created = client.post("/api/v1/folders", json={"name": "Get Test"}).json()

        response = client.get(f"/api/v1/folders/{created['id']}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == created["id"]
        assert data["name"] == "Get Test"

        # Cleanup
        client.delete(f"/api/v1/folders/{created['id']}")

    def test_get_folder_not_found(self):
        """Get non-existent folder returns 404."""
        response = client.get("/api/v1/folders/folder_nonexistent")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_folder_name(self):
        """Update folder name."""
        # Create test folder
        created = client.post("/api/v1/folders", json={"name": "Original"}).json()
        original_updated_at = created["updatedAt"]

        response = client.patch(
            f"/api/v1/folders/{created['id']}",
            params={"name": "Updated Name"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["updatedAt"] >= original_updated_at

        # Cleanup
        client.delete(f"/api/v1/folders/{created['id']}")

    def test_update_folder_not_found(self):
        """Update non-existent folder returns 404."""
        response = client.patch(
            "/api/v1/folders/folder_nonexistent",
            params={"name": "New Name"},
        )

        assert response.status_code == 404

    def test_delete_folder(self):
        """Delete a folder."""
        # Create test folder
        created = client.post("/api/v1/folders", json={"name": "To Delete"}).json()

        response = client.delete(f"/api/v1/folders/{created['id']}")

        assert response.status_code == 200
        assert response.json()["message"] == "Folder deleted"

        # Verify deleted
        get_response = client.get(f"/api/v1/folders/{created['id']}")
        assert get_response.status_code == 404

    def test_delete_folder_not_found(self):
        """Delete non-existent folder returns 404."""
        response = client.delete("/api/v1/folders/folder_nonexistent")

        assert response.status_code == 404


class TestFolderInputs:
    """Test Folder input file management."""

    def test_add_input_file(self):
        """Add an input file to a folder."""
        # Create test folder
        folder = client.post("/api/v1/folders", json={"name": "Input Test"}).json()

        response = client.post(
            f"/api/v1/folders/{folder['id']}/inputs",
            json={
                "name": "test.fasta",
                "type": "fasta",
                "content": ">test\nMVLSPADKTNVKAAWG",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "test.fasta"
        assert data["type"] == "fasta"
        assert data["id"].startswith("asset_")
        assert "uploadedAt" in data

        # Cleanup
        client.delete(f"/api/v1/folders/{folder['id']}")

    def test_add_input_pdb_file(self):
        """Add a PDB input file."""
        folder = client.post("/api/v1/folders", json={"name": "PDB Test"}).json()

        pdb_content = """HEADER    TEST STRUCTURE
ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N
END
"""
        response = client.post(
            f"/api/v1/folders/{folder['id']}/inputs",
            json={
                "name": "structure.pdb",
                "type": "pdb",
                "content": pdb_content,
            },
        )

        assert response.status_code == 200
        assert response.json()["type"] == "pdb"

        # Cleanup
        client.delete(f"/api/v1/folders/{folder['id']}")

    def test_add_input_to_nonexistent_folder(self):
        """Add input to non-existent folder returns 404."""
        response = client.post(
            "/api/v1/folders/folder_nonexistent/inputs",
            json={
                "name": "test.fasta",
                "type": "fasta",
                "content": ">test\nMVLS",
            },
        )

        assert response.status_code == 404

    def test_list_folder_inputs(self):
        """List all input files in a folder."""
        # Create folder and add inputs
        folder = client.post("/api/v1/folders", json={"name": "List Inputs"}).json()

        client.post(
            f"/api/v1/folders/{folder['id']}/inputs",
            json={"name": "file1.fasta", "type": "fasta", "content": ">a\nMVLS"},
        )
        client.post(
            f"/api/v1/folders/{folder['id']}/inputs",
            json={"name": "file2.txt", "type": "text", "content": "test content"},
        )

        response = client.get(f"/api/v1/folders/{folder['id']}/inputs")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2

        names = [asset["name"] for asset in data]
        assert "file1.fasta" in names
        assert "file2.txt" in names

        # Cleanup
        client.delete(f"/api/v1/folders/{folder['id']}")

    def test_list_inputs_nonexistent_folder(self):
        """List inputs from non-existent folder returns 404."""
        response = client.get("/api/v1/folders/folder_nonexistent/inputs")

        assert response.status_code == 404


class TestFolderConversationLink:
    """Test Folder-Conversation 1:1 linking."""

    def test_link_conversation_to_folder(self):
        """Link a conversation to a folder."""
        # Create folder
        folder = client.post("/api/v1/folders", json={"name": "Link Test"}).json()

        # Create conversation - API returns {"conversationId": ..., "conversation": {...}}
        conv_response = client.post(
            "/api/v1/conversations",
            json={"title": "Test Conversation"},
        ).json()
        conv_id = conv_response["conversationId"]

        # Link them
        response = client.post(
            f"/api/v1/folders/{folder['id']}/link-conversation",
            params={"conversation_id": conv_id},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["conversationId"] == conv_id

        # Verify the folder now has the conversation linked
        updated_folder = client.get(f"/api/v1/folders/{folder['id']}").json()
        assert updated_folder["conversationId"] == conv_id

        # Cleanup
        client.delete(f"/api/v1/folders/{folder['id']}")
        client.delete(f"/api/v1/conversations/{conv_id}")

    def test_link_to_nonexistent_folder(self):
        """Link conversation to non-existent folder returns 404."""
        response = client.post(
            "/api/v1/folders/folder_nonexistent/link-conversation",
            params={"conversation_id": "conv_test"},
        )

        assert response.status_code == 404

    def test_create_folder_with_conversation_id(self):
        """Create folder with initial conversation ID."""
        # Create conversation first - API returns {"conversationId": ..., "conversation": {...}}
        conv_response = client.post(
            "/api/v1/conversations",
            json={"title": "Pre-linked Conv"},
        ).json()
        conv_id = conv_response["conversationId"]

        # Create folder with conversation ID
        response = client.post(
            "/api/v1/folders",
            json={"name": "Pre-linked Folder", "conversationId": conv_id},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["conversationId"] == conv_id

        # Cleanup
        client.delete(f"/api/v1/folders/{data['id']}")
        client.delete(f"/api/v1/conversations/{conv_id}")
