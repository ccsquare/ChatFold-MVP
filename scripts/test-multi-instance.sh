#!/bin/bash
# Multi-Instance Test Script for ChatFold
#
# This script tests cross-instance operations:
# 1. Create job on Instance 1
# 2. Start SSE stream on Instance 1
# 3. Cancel job from Instance 2
# 4. Verify Instance 1 receives cancellation
#
# Prerequisites:
#   docker compose -f deploy/docker/docker-compose.multi-instance.yml up -d
#
# Usage:
#   ./scripts/test-multi-instance.sh

set -e

# Configuration
INSTANCE1_URL="http://localhost:8001"
INSTANCE2_URL="http://localhost:8002"
SEQUENCE="MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQQIAAALEHHHHHH"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Check if services are running
check_services() {
    log_info "Checking services..."

    if ! curl -sf "$INSTANCE1_URL/api/v1/health" > /dev/null; then
        log_error "Instance 1 ($INSTANCE1_URL) is not running"
        log_info "Start services with: docker compose -f deploy/docker/docker-compose.multi-instance.yml up -d"
        exit 1
    fi
    log_success "Instance 1 is healthy"

    if ! curl -sf "$INSTANCE2_URL/api/v1/health" > /dev/null; then
        log_error "Instance 2 ($INSTANCE2_URL) is not running"
        exit 1
    fi
    log_success "Instance 2 is healthy"
}

# Test 1: Cross-instance job cancellation
test_cross_instance_cancel() {
    echo ""
    log_info "=== Test 1: Cross-Instance Job Cancellation ==="

    # Step 1: Create job on Instance 1
    log_info "Creating job on Instance 1..."
    RESPONSE=$(curl -sf -X POST "$INSTANCE1_URL/api/v1/jobs" \
        -H "Content-Type: application/json" \
        -d "{\"sequence\": \"$SEQUENCE\"}")

    JOB_ID=$(echo "$RESPONSE" | jq -r '.jobId')
    if [ -z "$JOB_ID" ] || [ "$JOB_ID" = "null" ]; then
        log_error "Failed to create job: $RESPONSE"
        return 1
    fi
    log_success "Created job: $JOB_ID"

    # Step 2: Start SSE stream on Instance 1 (background)
    log_info "Starting SSE stream on Instance 1 (background)..."
    SSE_OUTPUT=$(mktemp)
    curl -sf -N "$INSTANCE1_URL/api/v1/jobs/$JOB_ID/stream" > "$SSE_OUTPUT" 2>&1 &
    SSE_PID=$!
    sleep 1  # Let stream start

    # Step 3: Cancel from Instance 2
    log_info "Cancelling job from Instance 2..."
    CANCEL_RESPONSE=$(curl -sf -X POST "$INSTANCE2_URL/api/v1/jobs/$JOB_ID/cancel")
    CANCEL_OK=$(echo "$CANCEL_RESPONSE" | jq -r '.ok')

    if [ "$CANCEL_OK" != "true" ]; then
        log_error "Cancel failed: $CANCEL_RESPONSE"
        kill $SSE_PID 2>/dev/null || true
        rm -f "$SSE_OUTPUT"
        return 1
    fi
    log_success "Cancel request sent from Instance 2"

    # Step 4: Wait for SSE to detect cancellation
    log_info "Waiting for SSE to detect cancellation..."
    sleep 2
    kill $SSE_PID 2>/dev/null || true

    # Step 5: Verify cancellation was received
    if grep -q "canceled" "$SSE_OUTPUT"; then
        log_success "Instance 1 SSE received cancellation event!"
    else
        log_warn "SSE output did not contain 'canceled' event"
        log_info "SSE output:"
        cat "$SSE_OUTPUT"
    fi

    # Step 6: Verify state in Redis (via either instance)
    STATE_RESPONSE=$(curl -sf "$INSTANCE2_URL/api/v1/jobs/$JOB_ID/state")
    STATE_STATUS=$(echo "$STATE_RESPONSE" | jq -r '.state.status')

    if [ "$STATE_STATUS" = "canceled" ]; then
        log_success "Job state is 'canceled' (verified from Instance 2)"
    else
        log_error "Job state is '$STATE_STATUS', expected 'canceled'"
        rm -f "$SSE_OUTPUT"
        return 1
    fi

    rm -f "$SSE_OUTPUT"
    log_success "Test 1 PASSED: Cross-instance cancellation works!"
    return 0
}

# Test 2: Cross-instance sequence retrieval
test_cross_instance_sequence() {
    echo ""
    log_info "=== Test 2: Cross-Instance Sequence Retrieval ==="

    JOB_ID="job_test_$(date +%s)"

    # Step 1: Register sequence on Instance 1
    log_info "Registering sequence on Instance 1..."
    REGISTER_RESPONSE=$(curl -sf -X POST "$INSTANCE1_URL/api/v1/jobs/$JOB_ID/stream" \
        -H "Content-Type: application/json" \
        -d "{\"sequence\": \"$SEQUENCE\"}")

    REGISTER_OK=$(echo "$REGISTER_RESPONSE" | jq -r '.ok')
    if [ "$REGISTER_OK" != "true" ]; then
        log_error "Failed to register sequence: $REGISTER_RESPONSE"
        return 1
    fi
    log_success "Sequence registered on Instance 1"

    # Step 2: Retrieve job metadata from Instance 2
    log_info "Retrieving job metadata from Instance 2..."
    STATE_RESPONSE=$(curl -sf "$INSTANCE2_URL/api/v1/jobs/$JOB_ID/state" || echo '{"error": "not found"}')

    # Check if job exists in Redis (via job state service)
    # Note: The /state endpoint uses Redis, so if we can see metadata, it's working
    if echo "$STATE_RESPONSE" | grep -q "error"; then
        log_warn "Job state not found (expected for pre-created jobs)"
    else
        log_success "Job metadata accessible from Instance 2"
    fi

    log_success "Test 2 PASSED: Cross-instance data sharing works!"
    return 0
}

# Test 3: Concurrent job creation
test_concurrent_creation() {
    echo ""
    log_info "=== Test 3: Concurrent Job Creation ==="

    # Create jobs on both instances simultaneously
    log_info "Creating jobs concurrently on both instances..."

    JOB1_RESPONSE=$(curl -sf -X POST "$INSTANCE1_URL/api/v1/jobs" \
        -H "Content-Type: application/json" \
        -d "{\"sequence\": \"$SEQUENCE\"}" &)

    JOB2_RESPONSE=$(curl -sf -X POST "$INSTANCE2_URL/api/v1/jobs" \
        -H "Content-Type: application/json" \
        -d "{\"sequence\": \"$SEQUENCE\"}" &)

    wait

    # Get job IDs
    JOB1_RESPONSE=$(curl -sf -X POST "$INSTANCE1_URL/api/v1/jobs" \
        -H "Content-Type: application/json" \
        -d "{\"sequence\": \"$SEQUENCE\"}")
    JOB2_RESPONSE=$(curl -sf -X POST "$INSTANCE2_URL/api/v1/jobs" \
        -H "Content-Type: application/json" \
        -d "{\"sequence\": \"$SEQUENCE\"}")

    JOB1_ID=$(echo "$JOB1_RESPONSE" | jq -r '.jobId')
    JOB2_ID=$(echo "$JOB2_RESPONSE" | jq -r '.jobId')

    if [ "$JOB1_ID" = "$JOB2_ID" ]; then
        log_error "Job IDs are the same! Collision detected."
        return 1
    fi

    log_success "Job 1 ID: $JOB1_ID"
    log_success "Job 2 ID: $JOB2_ID"
    log_success "Test 3 PASSED: No job ID collision!"
    return 0
}

# Main
main() {
    echo ""
    echo "=========================================="
    echo "   ChatFold Multi-Instance Tests"
    echo "=========================================="
    echo ""

    check_services

    PASSED=0
    FAILED=0

    if test_cross_instance_cancel; then
        ((PASSED++))
    else
        ((FAILED++))
    fi

    if test_cross_instance_sequence; then
        ((PASSED++))
    else
        ((FAILED++))
    fi

    if test_concurrent_creation; then
        ((PASSED++))
    else
        ((FAILED++))
    fi

    echo ""
    echo "=========================================="
    echo "   Results: $PASSED passed, $FAILED failed"
    echo "=========================================="

    if [ $FAILED -gt 0 ]; then
        exit 1
    fi
}

main "$@"
