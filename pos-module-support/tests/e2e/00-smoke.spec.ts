// Smoke set for CI (tests/ci-smoke.sh): the main pages work on a fresh
// install and an emailed ticket reaches the queue, the ticket page and the
// board. Also runs with the full suite against support-dev.
import { test, expect } from '@playwright/test';
import { contextFor, desk, newTicket, users } from './helpers';

test('S1. an anonymous visitor is sent to sign-in', async ({ page }) => {
  await page.goto(desk('/support-desk'));
  await expect(page).toHaveURL(/\/support-desk\/sign-in/);
});

test('S2. an emailed ticket reaches the queue, the ticket page and the board', async ({ browser }) => {
  const { ticket, subject } = await newTicket('CI smoke');
  const admin = await contextFor(browser, users.superadmin);
  const page = admin.page;

  await page.goto(desk(`/support-desk?view=all_open&q=${encodeURIComponent(subject)}`));
  await expect(page.locator('.pos-support-row', { hasText: subject })).toBeVisible();

  await page.goto(desk(`/support-desk/tickets/${ticket.id}`));
  await expect(page.locator('main')).toContainText(subject);
  await expect(page.locator('[data-support-composer]')).toBeVisible();

  await page.goto(desk(`/support-desk/board?q=${encodeURIComponent(subject)}`));
  await expect(page.locator('.pos-support-card', { hasText: subject })).toBeVisible();
  await admin.context.close();
});

test('S3. settings pages load without missing translations', async ({ browser }) => {
  const admin = await contextFor(browser, users.superadmin);
  for (const path of ['statuses', 'departments', 'sla', 'assignment', 'saved-replies', 'branding', 'email', 'blocklist', 'integrations', 'team']) {
    const response = await admin.page.goto(desk(`/support-desk/settings/${path}`));
    expect(response?.status(), path).toBe(200);
    await expect(admin.page.locator('body'), path).not.toContainText('translation missing');
  }
  await admin.context.close();
});
