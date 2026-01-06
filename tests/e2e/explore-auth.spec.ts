import { test, expect } from '@playwright/test';

/**
 * Exploratory test to understand the authentication UI
 */

test('explore authentication UI', async ({ page }) => {
  console.log('Step 1: Loading the application...');
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(3000);

  console.log('Step 2: Taking screenshot of initial state...');
  await page.screenshot({ path: 'screenshots/01-initial-state.png', fullPage: true });

  console.log('Step 3: Looking for User menu...');
  const userMenu = page.locator('text=User, button:has-text("User"), [data-testid="user-menu"]').first();

  if (await userMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('  Found user menu, clicking...');
    await userMenu.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/02-user-menu-opened.png', fullPage: true });
  }

  console.log('Step 4: Looking for settings/profile icon...');
  const settingsIcon = page.locator('[data-testid="settings"], button[aria-label*="settings" i], button[aria-label*="profile" i]').first();

  if (await settingsIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('  Found settings icon, clicking...');
    await settingsIcon.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/03-settings-opened.png', fullPage: true });
  }

  console.log('Step 5: Checking if there\'s a direct auth URL...');
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/04-login-page.png', fullPage: true });

  await page.goto('http://localhost:3000/register');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/05-register-page.png', fullPage: true });

  console.log('Step 6: Going back to home and looking for auth forms...');
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);

  // Look for any visible forms
  const forms = page.locator('form');
  const formCount = await forms.count();
  console.log(`  Found ${formCount} forms on the page`);

  // Look for email inputs
  const emailInputs = page.locator('input[type="email"]');
  const emailCount = await emailInputs.count();
  console.log(`  Found ${emailCount} email inputs`);

  if (emailCount > 0) {
    console.log('  Email input is visible - auth form might be on main page');
    await page.screenshot({ path: 'screenshots/06-auth-form-visible.png', fullPage: true });
  }

  console.log('\n✅ Exploration complete! Check the screenshots folder for UI analysis.');
});
