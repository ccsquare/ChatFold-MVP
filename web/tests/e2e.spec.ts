import { test, expect } from '@playwright/test';

/**
 * ChatFold E2E Tests
 *
 * These tests cover the core user workflows:
 * 1. Page load and layout verification
 * 2. Folder creation
 * 3. Sequence input and job submission
 * 4. SSE streaming and job completion
 * 5. Structure display
 *
 * Prerequisites:
 * - Backend running on port 8000
 * - Frontend running on port 3000
 * - Redis and MySQL running
 *
 * Run: npx playwright test tests/e2e.spec.ts
 */

// Test constants
const SAMPLE_SEQUENCE = 'MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH';
const JOB_TIMEOUT = 120000; // 2 minutes for job completion

test.describe('ChatFold E2E Tests', () => {
  test.describe('Page Load and Layout', () => {
    test('should load the main page with correct layout', async ({ page }) => {
      await page.goto('/');

      // Verify page title
      await expect(page).toHaveTitle(/ChatFold/);

      // Verify sidebar elements
      await expect(page.getByRole('button', { name: 'New chat' })).toBeVisible();

      // Verify chat input area
      await expect(page.getByPlaceholder('上传 FASTA 文件并输入约束需求')).toBeVisible();

      // Verify welcome message
      await expect(page.getByText('How can I help you?')).toBeVisible();
    });

    test('should show empty state when no folder is selected', async ({ page }) => {
      await page.goto('/');

      // Should show "No projects yet" message
      await expect(page.getByText('No projects yet')).toBeVisible();

      // Should show sample sequence buttons
      await expect(page.getByRole('button', { name: /Human Hemoglobin/ })).toBeVisible();
    });
  });

  test.describe('Folder Management', () => {
    test('should create a new folder via New chat', async ({ page }) => {
      await page.goto('/');

      // Click "New chat" button - this creates both folder and conversation
      await page.getByRole('button', { name: 'New chat' }).click();

      // Wait for folder to be created - "No projects yet" should disappear
      await expect(page.getByText('No projects yet')).not.toBeVisible({ timeout: 5000 });
    });

    test('should show chat input after new chat', async ({ page }) => {
      await page.goto('/');

      // Click "New chat" button
      await page.getByRole('button', { name: 'New chat' }).click();

      // The chat view should still be active with input area
      await expect(page.getByPlaceholder('上传 FASTA 文件并输入约束需求')).toBeVisible();
    });
  });

  test.describe('Sequence Input', () => {
    test('should accept FASTA sequence input', async ({ page }) => {
      await page.goto('/');

      // Create folder via New chat first
      await page.getByRole('button', { name: 'New chat' }).click();
      await page.waitForTimeout(1000);

      // Find and fill the sequence input
      const textarea = page.getByPlaceholder('上传 FASTA 文件并输入约束需求');
      await textarea.fill(SAMPLE_SEQUENCE);

      // Verify the input value
      await expect(textarea).toHaveValue(SAMPLE_SEQUENCE);

      // Send button should now be enabled
      await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
    });

    test('should use sample sequence button', async ({ page }) => {
      await page.goto('/');

      // Click on a sample sequence button (Human Hemoglobin)
      await page.getByRole('button', { name: /Human Hemoglobin/ }).click();

      // Wait for folder creation and sequence input
      await page.waitForTimeout(1000);

      // Should start processing (job submitted automatically or textarea filled)
      // Check if job started or if textarea has content
      const hasJobStarted = await page.getByText(/running|processing|folding/i).isVisible().catch(() => false);
      const textareaHasValue = await page.getByPlaceholder('上传 FASTA 文件并输入约束需求').inputValue().then(v => v.length > 0).catch(() => false);

      expect(hasJobStarted || textareaHasValue).toBeTruthy();
    });
  });

  test.describe('Job Submission and Streaming', () => {
    test('should submit a folding job', async ({ page }) => {
      await page.goto('/');

      // Create folder
      await page.getByRole('button', { name: 'New chat' }).click();
      await page.waitForTimeout(1000);

      // Input sequence
      const textarea = page.getByPlaceholder('上传 FASTA 文件并输入约束需求');
      await textarea.fill(SAMPLE_SEQUENCE);

      // Submit the job
      await page.getByRole('button', { name: 'Send message' }).click();

      // Verify job started - should see user message in chat or progress indicator
      await expect(
        page.getByText(SAMPLE_SEQUENCE.substring(0, 20)).or(
          page.getByText(/running|processing|folding|queued/i)
        )
      ).toBeVisible({ timeout: 10000 });
    });

    test('should stream SSE events during job execution', async ({ page }) => {
      test.setTimeout(JOB_TIMEOUT);

      await page.goto('/');

      // Create folder and submit job
      await page.getByRole('button', { name: 'New chat' }).click();
      await page.waitForTimeout(1000);

      const textarea = page.getByPlaceholder('上传 FASTA 文件并输入约束需求');
      await textarea.fill(SAMPLE_SEQUENCE);

      await page.getByRole('button', { name: 'Send message' }).click();

      // Wait for SSE events - look for thinking/progress indicators
      // The AI should show thinking process or structure predictions
      await expect(
        page.getByText(/thinking|分析|预测|folding/i).first()
      ).toBeVisible({ timeout: 30000 });
    });

    test('should complete job and show structures', async ({ page }) => {
      test.setTimeout(JOB_TIMEOUT);

      await page.goto('/');

      // Create folder and submit job
      await page.getByRole('button', { name: 'New chat' }).click();
      await page.waitForTimeout(1000);

      const textarea = page.getByPlaceholder('上传 FASTA 文件并输入约束需求');
      await textarea.fill(SAMPLE_SEQUENCE);

      await page.getByRole('button', { name: 'Send message' }).click();

      // Wait for job completion - look for completion message or structure files
      await expect(
        page.getByText(/completed|done|finished|\.cif|\.pdb/i).first()
      ).toBeVisible({ timeout: JOB_TIMEOUT });
    });
  });

  test.describe('Sample Sequences', () => {
    test('should list all sample sequence options', async ({ page }) => {
      await page.goto('/');

      // Verify all sample sequences are visible
      await expect(page.getByRole('button', { name: /Human Hemoglobin/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Human Insulin/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Green Fluorescent Protein/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Short Test Peptide/ })).toBeVisible();
    });

    test('should submit short test peptide and complete quickly', async ({ page }) => {
      test.setTimeout(JOB_TIMEOUT);

      await page.goto('/');

      // Click on Short Test Peptide (shortest sequence - should complete fastest)
      await page.getByRole('button', { name: /Short Test Peptide/ }).click();

      // Wait for job completion
      await expect(
        page.getByText(/completed|done|finished|\.cif/i).first()
      ).toBeVisible({ timeout: JOB_TIMEOUT });
    });
  });

  test.describe('Structure Viewer', () => {
    test('should display Mol* 3D viewer after job completion', async ({ page }) => {
      test.setTimeout(JOB_TIMEOUT);

      await page.goto('/');

      // Use short peptide for faster test
      await page.getByRole('button', { name: /Short Test Peptide/ }).click();

      // Wait for job completion
      await expect(
        page.getByText(/completed|done|finished|\.cif/i).first()
      ).toBeVisible({ timeout: JOB_TIMEOUT });

      // Look for Mol* viewer canvas or container
      await expect(
        page.locator('canvas').first()
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('UI Components', () => {
    test('should toggle sidebar collapse', async ({ page }) => {
      await page.goto('/');

      // Find and click collapse button
      const collapseButton = page.getByRole('button', { name: 'Collapse sidebar' });
      await expect(collapseButton).toBeVisible();

      await collapseButton.click();

      // Sidebar should be collapsed - "New chat" text might be hidden
      await page.waitForTimeout(500);

      // Click again to expand
      await page.getByRole('button', { name: /sidebar/i }).click();
      await page.waitForTimeout(500);

      // Should see full sidebar again
      await expect(page.getByText('ChatFold')).toBeVisible();
    });

    test('should show disabled send button when input is empty', async ({ page }) => {
      await page.goto('/');

      // Send button should be disabled when no input
      await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
    });

    test('should show disabled structure viewer button initially', async ({ page }) => {
      await page.goto('/');

      // Structure viewer button should be disabled when no structure is loaded
      await expect(page.getByRole('button', { name: 'Show structure viewer' })).toBeDisabled();
    });
  });

  test.describe('API Health Check', () => {
    test('should verify backend health endpoint', async ({ request }) => {
      const response = await request.get('http://localhost:8000/api/v1/health');
      expect(response.ok()).toBeTruthy();

      const body = await response.json();
      expect(body.status).toBe('healthy');
    });

    test('should verify API is accessible from frontend', async ({ page }) => {
      await page.goto('/');

      // Make a request to health endpoint via frontend context
      const response = await page.evaluate(async () => {
        const res = await fetch('http://localhost:8000/api/v1/health');
        return res.json();
      });

      expect(response.status).toBe('healthy');
    });
  });

  test.describe('Error Handling', () => {
    test('should handle empty sequence gracefully', async ({ page }) => {
      await page.goto('/');

      // Send button should remain disabled with empty input
      const sendButton = page.getByRole('button', { name: 'Send message' });
      await expect(sendButton).toBeDisabled();

      // Try to click anyway (should not throw)
      await sendButton.click({ force: true }).catch(() => {});

      // Page should still be functional
      await expect(page.getByPlaceholder('上传 FASTA 文件并输入约束需求')).toBeVisible();
    });
  });
});
