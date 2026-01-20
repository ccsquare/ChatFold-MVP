#!/usr/bin/env python3
"""Test NanoCC integration with file upload to TOS.

This script tests the complete flow:
1. Upload input.fasta to TOS
2. Create a job and call stream API with files parameter
3. Stream SSE events from NanoCC

Usage:
    python scripts/test_nanocc_with_file.py

Requires TOS credentials in environment:
    TOS_ACCESS_KEY, TOS_SECRET_KEY
"""

import json
import os
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

import httpx

# Disable proxy to avoid SSL issues
for proxy_var in ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"]:
    os.environ.pop(proxy_var, None)

# TOS Configuration (same as test_session.py)
TOS_BUCKET = "chatfold-test"
TOS_ENDPOINT = "https://tos-s3-cn-shanghai.ivolces.com"

# Test data
FASTA_CONTENT = """>test_sequence
MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR
"""

SEQUENCE = "MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR"


def get_tos_client():
    """Create boto3 S3 client for TOS."""
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        print("[ERROR] boto3 not installed. Run: uv pip install boto3")
        sys.exit(1)

    access_key = os.environ.get("TOS_ACCESS_KEY")
    secret_key = os.environ.get("TOS_SECRET_KEY")

    if not access_key or not secret_key:
        print("[ERROR] TOS credentials not configured.")
        print("       Set TOS_ACCESS_KEY and TOS_SECRET_KEY environment variables.")
        print("       Or source the .env file from cc-workspace.")
        sys.exit(1)

    config = Config(
        signature_version="s3v4",
        s3={"addressing_style": "virtual"},
    )

    return boto3.client(
        "s3",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        endpoint_url=TOS_ENDPOINT,
        region_name="cn-shanghai",
        config=config,
    )


def upload_to_tos(client, session_id: str, filename: str, content: str) -> str:
    """Upload file to TOS.

    Args:
        client: boto3 S3 client
        session_id: Session ID (format: session_xxx)
        filename: Filename to upload
        content: File content

    Returns:
        TOS object key
    """
    key = f"sessions/{session_id}/upload/{filename}"
    print(f"[Upload] Uploading to tos://{TOS_BUCKET}/{key}")

    client.put_object(
        Bucket=TOS_BUCKET,
        Key=key,
        Body=content.encode("utf-8"),
        ContentType="text/plain",
    )

    print(f"[Upload] Done: {filename}")
    return key


def create_job(api_base: str, sequence: str) -> str:
    """Create a folding job.

    Args:
        api_base: API base URL (e.g., http://localhost:8000)
        sequence: Protein sequence

    Returns:
        job_id
    """
    print("[Job] Creating job...")

    with httpx.Client() as client:
        resp = client.post(
            f"{api_base}/api/v1/jobs",
            json={"sequence": sequence},
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()
        job_id = data["jobId"]
        print(f"[Job] Created: {job_id}")
        return job_id


def stream_job(api_base: str, job_id: str, files: list[str]):
    """Stream job progress with files parameter.

    Args:
        api_base: API base URL
        job_id: Job ID
        files: List of filenames in TOS upload directory
    """
    files_param = ",".join(files)
    url = f"{api_base}/api/v1/jobs/{job_id}/stream"
    params = {"files": files_param, "nanocc": "true"}

    print(f"[Stream] GET {url}")
    print(f"[Stream] params: {params}")
    print()
    print("=" * 60)
    print("SSE Events:")
    print("=" * 60)

    event_count = 0

    with httpx.Client() as client:
        with client.stream(
            "GET",
            url,
            params=params,
            timeout=httpx.Timeout(connect=30.0, read=1800.0, write=30.0, pool=30.0),
        ) as response:
            response.raise_for_status()

            event_type = None
            data_lines = []

            for line in response.iter_lines():
                if line.startswith("event:"):
                    event_type = line[6:].strip()
                elif line.startswith("data:"):
                    data_lines.append(line[5:].strip())
                elif line == "" and event_type:
                    # Event complete
                    event_count += 1
                    data_str = "".join(data_lines)

                    try:
                        data = json.loads(data_str)
                        # Pretty print key fields
                        stage = data.get("stage", "?")
                        progress = data.get("progress", 0)
                        message = data.get("message", "")[:80]
                        event_type_inner = data.get("eventType", "?")

                        print(f"[{event_count:3d}] {event_type} | {stage} | {progress}% | {event_type_inner}")
                        if message:
                            print(f"      {message}")

                        # Check for structures
                        artifacts = data.get("artifacts", [])
                        for artifact in artifacts or []:
                            if artifact.get("type") == "structure":
                                struct_id = artifact.get("structureId", "?")
                                label = artifact.get("label", "?")
                                print(f"      [Structure] {struct_id}: {label}")

                    except json.JSONDecodeError:
                        print(f"[{event_count:3d}] {event_type}: {data_str[:100]}...")

                    # Reset
                    event_type = None
                    data_lines = []

    print()
    print("=" * 60)
    print(f"Total events: {event_count}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Test NanoCC with file upload")
    parser.add_argument(
        "--api-base",
        default="http://localhost:8000",
        help="Backend API base URL",
    )
    parser.add_argument(
        "--skip-upload",
        action="store_true",
        help="Skip TOS upload (assume file already exists)",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("NanoCC File Upload Integration Test")
    print("=" * 60)
    print(f"API Base: {args.api_base}")
    print(f"TOS Bucket: {TOS_BUCKET}")
    print(f"Sequence length: {len(SEQUENCE)}")
    print()

    # Step 1: Create job to get job_id
    job_id = create_job(args.api_base, SEQUENCE)

    # Convert job_id to session_id
    session_id = job_id.replace("job_", "session_")
    print(f"[Session] session_id: {session_id}")
    print()

    # Step 2: Upload file to TOS
    if not args.skip_upload:
        tos_client = get_tos_client()
        upload_to_tos(tos_client, session_id, "input.fasta", FASTA_CONTENT)
        print()
    else:
        print("[Upload] Skipped (--skip-upload)")
        print()

    # Step 3: Stream with files parameter
    stream_job(args.api_base, job_id, ["input.fasta"])

    print()
    print("[Done] Test completed!")


if __name__ == "__main__":
    main()
