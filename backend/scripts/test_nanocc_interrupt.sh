#!/bin/bash
# Test script for NanoCC interrupt functionality with real NanoCC
#
# Tests:
# 1. NanoCC session saved to Redis after creation
# 2. Interrupt API called when job is canceled
# 3. Session info cleaned up after job completes/cancels
#
# Usage:
#   cd backend
#   ./scripts/test_nanocc_interrupt.sh

set -e

BASE_URL="http://localhost:8000"
SEQUENCE="MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH"

echo "============================================================"
echo "NanoCC Interrupt Test (Real NanoCC)"
echo "============================================================"
echo "Base URL: $BASE_URL"
echo "Sequence length: ${#SEQUENCE} aa"
echo ""

# Check server health
echo "[Check] Server health..."
HEALTH=$(curl -s "$BASE_URL/api/v1/health")
echo "Health: $HEALTH"
echo ""

# ============================================================
# Test 1: Create job and verify NanoCC session is saved to Redis
# ============================================================
echo "============================================================"
echo "Test 1: Create job and start stream"
echo "============================================================"

# Create job
echo "[Step 1.1] Creating job..."
JOB_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/jobs" \
  -H "Content-Type: application/json" \
  -d "{\"sequence\": \"$SEQUENCE\"}")

JOB_ID=$(echo "$JOB_RESPONSE" | jq -r '.jobId')
echo "Job ID: $JOB_ID"
echo ""

# Start stream in background
echo "[Step 1.2] Starting stream (real NanoCC)..."
STREAM_FILE="/tmp/nanocc_stream_${JOB_ID}.txt"
curl -s -N "$BASE_URL/api/v1/jobs/${JOB_ID}/stream?nanocc=true" > "$STREAM_FILE" 2>&1 &
STREAM_PID=$!
echo "Stream PID: $STREAM_PID"
echo ""

# Wait for NanoCC session to be created (instance allocation + session creation)
echo "[Step 1.3] Waiting 8 seconds for NanoCC session to be created..."
sleep 8

# Check events received
echo "[Step 1.4] Events received:"
EVENT_COUNT=$(grep -c "^event:" "$STREAM_FILE" 2>/dev/null || echo "0")
echo "Event count: $EVENT_COUNT"
echo ""
echo "First 5 events:"
grep -A1 "^event:" "$STREAM_FILE" | head -15
echo ""

# Check Redis for NanoCC session info
echo "[Step 1.5] Checking Redis for NanoCC session..."
NANOCC_KEY="chatfold:job:nanocc:${JOB_ID}"
NANOCC_SESSION=$(redis-cli hgetall "$NANOCC_KEY" 2>/dev/null || echo "Redis not available")
if [ -n "$NANOCC_SESSION" ] && [ "$NANOCC_SESSION" != "Redis not available" ]; then
    echo "✅ NanoCC session found in Redis:"
    redis-cli hgetall "$NANOCC_KEY"
else
    echo "❌ NanoCC session NOT found in Redis (key: $NANOCC_KEY)"
    echo "This might be because Mock NanoCC is being used."
fi
echo ""

# ============================================================
# Test 2: Cancel job and verify interrupt is called
# ============================================================
echo "============================================================"
echo "Test 2: Cancel job and verify interrupt"
echo "============================================================"

echo "[Step 2.1] Canceling job..."
CANCEL_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/jobs/${JOB_ID}/cancel")
echo "Cancel response:"
echo "$CANCEL_RESPONSE" | jq .
echo ""

# Check if nanoccInterrupted is true
NANOCC_INTERRUPTED=$(echo "$CANCEL_RESPONSE" | jq -r '.nanoccInterrupted')
if [ "$NANOCC_INTERRUPTED" = "true" ]; then
    echo "✅ NanoCC interrupt was called successfully"
else
    echo "⚠️  NanoCC interrupt was NOT called (nanoccInterrupted=$NANOCC_INTERRUPTED)"
    echo "   This is expected if using Mock NanoCC or session already finished"
fi
echo ""

# Wait for cancel to propagate
sleep 2

# Check stream output for canceled event
echo "[Step 2.2] Checking for canceled event in stream..."
if grep -q "event: canceled" "$STREAM_FILE"; then
    echo "✅ Received canceled event"
    grep -A1 "event: canceled" "$STREAM_FILE"
else
    echo "Stream did not receive explicit canceled event (may have terminated)"
fi
echo ""

# ============================================================
# Test 3: Verify session cleanup
# ============================================================
echo "============================================================"
echo "Test 3: Verify session cleanup from Redis"
echo "============================================================"

# Kill stream process if still running
kill $STREAM_PID 2>/dev/null || true

# Wait a bit for cleanup
sleep 2

# Check Redis - session should be deleted
echo "[Step 3.1] Checking if NanoCC session was cleaned up..."
NANOCC_SESSION_AFTER=$(redis-cli hgetall "$NANOCC_KEY" 2>/dev/null || echo "Redis not available")
if [ -z "$NANOCC_SESSION_AFTER" ] || [ "$NANOCC_SESSION_AFTER" = "" ]; then
    echo "✅ NanoCC session cleaned up from Redis"
else
    echo "⚠️  NanoCC session still exists in Redis:"
    redis-cli hgetall "$NANOCC_KEY"
fi
echo ""

# Check final job state
echo "[Step 3.2] Final job state:"
JOB_STATE=$(curl -s "$BASE_URL/api/v1/jobs/${JOB_ID}/state" 2>/dev/null || echo "{}")
echo "$JOB_STATE" | jq .
echo ""

# ============================================================
# Summary
# ============================================================
echo "============================================================"
echo "Test Summary"
echo "============================================================"
echo "Job ID: $JOB_ID"
echo "Events received: $EVENT_COUNT"
echo "NanoCC Interrupted: $NANOCC_INTERRUPTED"
echo ""
echo "Stream output saved to: $STREAM_FILE"
echo ""

# Show last few lines of stream
echo "Last 10 lines of stream:"
tail -10 "$STREAM_FILE"
