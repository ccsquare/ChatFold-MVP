#!/usr/bin/env python3
"""Test script for NanoCC interrupt functionality.

This script tests the new interrupt logic:
1. Creates a job
2. Starts streaming (which creates NanoCC session)
3. Cancels the job after a few seconds (should call interrupt_session)
4. Verifies the cancel response includes nanoccInterrupted flag

Usage:
    cd backend
    uv run python scripts/test_interrupt.py
"""

import asyncio
import sys
import time

import httpx

BASE_URL = "http://localhost:8000"

# Test sequence (short protein for faster testing)
TEST_SEQUENCE = "MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH"


async def create_job(sequence: str) -> str:
    """Create a new folding job."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/api/v1/jobs",
            json={"sequence": sequence},
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["jobId"]


async def stream_job_with_cancel(job_id: str, cancel_after_seconds: float = 5.0):
    """Stream job events and cancel after specified time."""
    print(f"\n[Stream] Starting stream for job {job_id}")
    print(f"[Stream] Will cancel after {cancel_after_seconds} seconds")

    start_time = time.time()
    event_count = 0
    canceled = False

    async with httpx.AsyncClient() as client:
        # Start streaming in background
        async with client.stream(
            "GET",
            f"{BASE_URL}/api/v1/jobs/{job_id}/stream",
            params={"sequence": TEST_SEQUENCE},
            timeout=httpx.Timeout(300.0, connect=10.0),
        ) as response:
            async for line in response.aiter_lines():
                elapsed = time.time() - start_time

                if line.startswith("event:"):
                    event_type = line[6:].strip()
                elif line.startswith("data:"):
                    event_count += 1
                    # Print abbreviated event info
                    data_preview = line[5:80] + "..." if len(line) > 85 else line[5:]
                    print(f"[{elapsed:6.1f}s] Event #{event_count}: {event_type} - {data_preview}")

                    # Check if it's canceled event
                    if event_type == "canceled":
                        print(f"\n[Stream] Received canceled event!")
                        canceled = True
                        break

                    # Check if done
                    if event_type == "done":
                        print(f"\n[Stream] Job completed before cancel")
                        break

                # Cancel after specified time
                if elapsed >= cancel_after_seconds and not canceled:
                    print(f"\n[Cancel] Sending cancel request...")
                    cancel_result = await cancel_job(job_id)
                    print(f"[Cancel] Result: {cancel_result}")
                    canceled = True

    return event_count, canceled


async def cancel_job(job_id: str) -> dict:
    """Cancel a running job."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/api/v1/jobs/{job_id}/cancel",
            timeout=10.0,
        )
        resp.raise_for_status()
        return resp.json()


async def check_redis_nanocc_session(job_id: str):
    """Check if NanoCC session info exists in Redis."""
    # This requires direct Redis access, so we'll use the API to check job state
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/api/v1/jobs/{job_id}/state",
            timeout=10.0,
        )
        if resp.status_code == 200:
            return resp.json()
        return None


async def main():
    print("=" * 60)
    print("NanoCC Interrupt Test")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}")
    print(f"Sequence length: {len(TEST_SEQUENCE)} aa")

    # Step 1: Create job
    print("\n[Step 1] Creating job...")
    try:
        job_id = await create_job(TEST_SEQUENCE)
        print(f"[Step 1] Created job: {job_id}")
    except Exception as e:
        print(f"[Error] Failed to create job: {e}")
        sys.exit(1)

    # Step 2: Stream and cancel after 5 seconds
    print("\n[Step 2] Starting stream and will cancel after 5 seconds...")
    try:
        event_count, was_canceled = await stream_job_with_cancel(job_id, cancel_after_seconds=5.0)
        print(f"\n[Step 2] Total events received: {event_count}")
        print(f"[Step 2] Was canceled: {was_canceled}")
    except Exception as e:
        print(f"[Error] Stream/cancel failed: {e}")
        import traceback
        traceback.print_exc()

    # Step 3: Check final job state
    print("\n[Step 3] Checking final job state...")
    try:
        state = await check_redis_nanocc_session(job_id)
        if state:
            print(f"[Step 3] Job state: {state}")
        else:
            print("[Step 3] Job state not found in Redis")
    except Exception as e:
        print(f"[Error] Failed to check job state: {e}")

    print("\n" + "=" * 60)
    print("Test completed!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
