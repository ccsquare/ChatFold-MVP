import { test, expect } from '@playwright/test';

/**
 * Test auto-fill verification code functionality
 * This test verifies that the verification code is automatically filled
 * when returned in the API response (debug/test mode)
 */

const BASE_URL = 'http://localhost:3000';

test.describe('Auto-fill Verification Code', () => {
  test('should auto-fill verification code in registration form', async ({ page }) => {
    const timestamp = Date.now();
    const email = `test-autofill-${timestamp}@example.com`;
    const password = 'test123';
    const username = `testuser${timestamp}`;

    console.log(`\n=== Testing Auto-Fill Feature ===`);
    console.log(`Email: ${email}`);
    console.log(`Username: ${username}`);

    // Navigate to the app
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Open registration dialog
    console.log('\n[Step 1] Opening registration dialog...');
    await page.getByText('Guest').click();
    await page.waitForTimeout(500);
    await page.getByRole('menuitem', { name: 'Sign up' }).click();
    await page.waitForTimeout(1000);

    // Verify registration dialog is open
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
    console.log('   ✅ Registration dialog opened');

    // Fill email and send code
    console.log('\n[Step 2] Sending verification code...');
    await page.locator('#email').fill(email);
    await page.getByRole('button', { name: 'Send Code' }).click();

    // Wait for the code to be sent and auto-filled
    await page.waitForTimeout(2000);

    // Check that the verification code field is visible
    const codeInput = page.locator('#code');
    await expect(codeInput).toBeVisible();
    console.log('   ✅ Code input field appeared');

    // Get the auto-filled code value
    const codeValue = await codeInput.inputValue();
    console.log(`   ✅ Code auto-filled: ${codeValue}`);

    // Verify code is 6 digits
    expect(codeValue).toMatch(/^\d{6}$/);
    console.log('   ✅ Code format is valid (6 digits)');

    // Check for success toast message
    await expect(page.getByText('Verification code auto-filled (test mode)')).toBeVisible();
    console.log('   ✅ Auto-fill toast message displayed');

    // Complete registration with auto-filled code
    console.log('\n[Step 3] Completing registration...');
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForTimeout(3000);

    // Verify successful registration
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText(username)).toBeVisible();
    console.log('   ✅ Registration completed successfully!');

    console.log('\n=== Auto-fill test passed! ===\n');
  });
});
