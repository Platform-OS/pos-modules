import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const CSV_HEADER = 'id,created_at,user_id,uuid,name,first_name,last_name,email';

test('exports profiles as CSV and downloads the file', async ({ page }) => {
  await page.goto('/admin/reports/list?type=profile');
  await expect(page.locator('button:has-text("Export Profiles as CSV")')).toBeVisible();

  // Trigger export — POSTs to /admin/reports/profiles, redirects back to list
  await page.click('button:has-text("Export Profiles as CSV")');
  await page.waitForURL('/admin/reports/list?type=profile');

  // Poll until the first row shows a Download button (report generation is async)
  const downloadButton = page.locator('tbody tr:first-child button:has-text("Download")');
  await expect(async () => {
    await page.reload();
    await expect(downloadButton).toBeVisible();
  }).toPass({ timeout: 30_000, intervals: [2_000] });

  // Click Download — POSTs to /admin/reports/download/:id, redirects to pre-signed file URL
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);

  const filePath = await download.path();
  expect(filePath).toBeTruthy();

  const csvContent = fs.readFileSync(filePath!, 'utf-8');
  const lines = csvContent.trim().split('\n');

  expect(lines[0]).toBe(CSV_HEADER);
  expect(lines.length).toBeGreaterThan(1);
});
