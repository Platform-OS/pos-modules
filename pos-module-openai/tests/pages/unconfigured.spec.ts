import { test, expect } from '@playwright/test';

test.describe('Pages - OpenAI not configured', () => {
  const message = 'OpenAI is not configured in this environment.';

  test('openai_search shows unconfigured message', async ({ page }) => {
    await page.goto('/openai_search');
    await expect(page.getByText(message)).toBeVisible();
  });

  test('openai_gpt_usage shows unconfigured message', async ({ page }) => {
    await page.goto('/openai_gpt_usage');
    await expect(page.getByText(message)).toBeVisible();
  });
});
