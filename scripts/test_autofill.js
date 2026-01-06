#!/usr/bin/env node
/**
 * Quick test script to verify auto-fill verification code functionality
 */

const API_URL = 'http://localhost:8000/api/v1';

async function testAutoFill() {
  const timestamp = Date.now();
  const email = `test-autofill-${timestamp}@example.com`;

  console.log('\n=== Testing Auto-Fill Verification Code ===\n');
  console.log(`Testing with email: ${email}\n`);

  try {
    // Step 1: Send verification code
    console.log('[Step 1] Sending verification code...');
    const sendResponse = await fetch(`${API_URL}/auth/send-verification-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!sendResponse.ok) {
      throw new Error(`Failed to send code: ${sendResponse.statusText}`);
    }

    const sendData = await sendResponse.json();
    console.log('Response:', JSON.stringify(sendData, null, 2));

    // Verify code is present in response
    if (!sendData.code) {
      console.error('❌ FAILED: Code not present in response');
      process.exit(1);
    }

    console.log(`✅ Code received in response: ${sendData.code}`);
    console.log('✅ Auto-fill functionality verified!\n');

    // Step 2: Test registration with the auto-filled code
    console.log('[Step 2] Testing registration with auto-filled code...');
    const registerResponse = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        username: `testuser${timestamp}`,
        password: 'test123',
        verification_code: sendData.code,
      }),
    });

    if (!registerResponse.ok) {
      const error = await registerResponse.json();
      throw new Error(`Registration failed: ${error.detail}`);
    }

    const userData = await registerResponse.json();
    console.log(`✅ Registration successful for user: ${userData.username}`);
    console.log(`   User ID: ${userData.id}`);
    console.log(`   Email: ${userData.email}`);
    console.log(`   Plan: ${userData.plan}\n`);

    console.log('=== All tests passed! ===\n');
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}\n`);
    process.exit(1);
  }
}

testAutoFill();
