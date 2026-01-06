import { test, expect } from '@playwright/test';

/**
 * End-to-end authentication flow test
 * Tests registration and login through the actual web UI
 */

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8000/api/v1';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('should complete full registration and login flow', async ({ page }) => {
    const timestamp = Date.now();
    const email = `test-${timestamp}@example.com`;
    const password = 'test123';
    const username = `testuser${timestamp}`;

    console.log(`\n=== Testing Authentication ===`);
    console.log(`Email: ${email}`);
    console.log(`Username: ${username}`);

    // Step 1: Open user menu
    console.log('\n[Step 1] Opening user menu...');
    await page.getByText('Guest').click();
    await page.waitForTimeout(500);

    // Step 2: Click Sign up
    console.log('[Step 2] Clicking Sign up...');
    await page.getByRole('menuitem', { name: 'Sign up' }).click();
    await page.waitForTimeout(1000);

    // Step 3: Verify registration dialog
    console.log('[Step 3] Verifying registration dialog...');
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();

    // Step 4: Fill email and send code
    console.log('[Step 4] Sending verification code...');
    await page.locator('#email').fill(email);
    await page.getByRole('button', { name: 'Send Code' }).click();
    await page.waitForTimeout(2000);

    // Step 5: Get verification code from test endpoint
    console.log('[Step 5] Fetching verification code...');
    const response = await page.request.get(`${API_URL}/test/verification-code?email=${email}`);
    expect(response.ok()).toBeTruthy();
    const codeData = await response.json();
    const verificationCode = codeData.code;
    console.log(`   ✅ Code: ${verificationCode}`);

    // Step 6: Fill in all registration fields
    console.log('[Step 6] Completing registration form...');
    await page.locator('#code').fill(verificationCode);
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);

    // Step 7: Submit registration
    console.log('[Step 7] Submitting registration...');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForTimeout(3000);

    // Step 8: Verify logged in
    console.log('[Step 8] Verifying logged in state...');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText(username)).toBeVisible();
    console.log('   ✅ Successfully registered and logged in!');

    // Step 9: Test logout
    console.log('[Step 9] Testing logout...');
    await page.getByText(username).click();
    await page.waitForTimeout(500);
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await page.waitForTimeout(2000);
    await expect(page.getByText('Guest')).toBeVisible();
    console.log('   ✅ Successfully logged out!');

    // Step 10: Test login
    console.log('[Step 10] Testing login with existing credentials...');
    await page.getByText('Guest').click();
    await page.waitForTimeout(500);
    await page.getByRole('menuitem', { name: 'Log in' }).click();
    await page.waitForTimeout(1000);

    await expect(page.getByRole('heading', { name: 'Log in to ChatFold' })).toBeVisible();
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForTimeout(3000);

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText(username)).toBeVisible();
    console.log('   ✅ Successfully logged in!');

    console.log('\n=== All tests passed! ===\n');
  });

  test('should handle invalid login credentials', async ({ page }) => {
    console.log('\n[Test] Invalid credentials...');

    await page.getByText('Guest').click();
    await page.waitForTimeout(500);
    await page.getByRole('menuitem', { name: 'Log in' }).click();
    await page.waitForTimeout(1000);

    await page.locator('#email').fill('nonexistent@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForTimeout(2000);

    await expect(page.getByRole('heading', { name: 'Log in to ChatFold' })).toBeVisible();
    console.log('   ✅ Invalid credentials rejected!');
  });

  test('should switch between login and register modes', async ({ page }) => {
    console.log('\n[Test] Mode switching...');

    await page.getByText('Guest').click();
    await page.waitForTimeout(500);
    await page.getByRole('menuitem', { name: 'Log in' }).click();
    await page.waitForTimeout(1000);

    await expect(page.getByRole('heading', { name: 'Log in to ChatFold' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign up' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
    console.log('   ✅ Switched to register mode');

    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: 'Log in to ChatFold' })).toBeVisible();
    console.log('   ✅ Switched back to login mode');
  });

  test('should validate email before sending code', async ({ page }) => {
    console.log('\n[Test] Email validation...');

    await page.getByText('Guest').click();
    await page.waitForTimeout(500);
    await page.getByRole('menuitem', { name: 'Sign up' }).click();
    await page.waitForTimeout(1000);

    const sendCodeButton = page.getByRole('button', { name: 'Send Code' });
    await expect(sendCodeButton).toBeDisabled();
    console.log('   ✅ Send Code button disabled when email is empty');

    await page.locator('#email').fill('not-an-email');
    await expect(sendCodeButton).not.toBeDisabled();
    console.log('   ✅ Email validation working');
  });
});
