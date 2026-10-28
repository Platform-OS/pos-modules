// Scenario 11 (tech-spec 10 §3): on a fresh instance where the example app
// was deployed and the install generator run, the first admin signs in and
// the desk works without host edits beyond what the generator wrote.
// Needs its own instance:
//   E2E_FRESH_URL, E2E_FRESH_ADMIN_EMAIL, E2E_FRESH_ADMIN_PASSWORD
import { test, expect } from '@playwright/test';

const url = process.env.E2E_FRESH_URL;

test('11. fresh install: the first admin signs in and reaches every desk section', async ({ page, request }) => {
  test.skip(!url, 'needs a fresh instance (E2E_FRESH_URL and the first admin credentials)');
  await page.goto(`${url}/support-desk/sign-in`);
  await page.fill('#pos-support-email', process.env.E2E_FRESH_ADMIN_EMAIL!);
  await page.fill('#pos-support-password', process.env.E2E_FRESH_ADMIN_PASSWORD!);
  await Promise.all([page.waitForURL(/\/support-desk(\?|$)/), page.click('button[type=submit]')]);
  for (const path of ['/support-desk', '/support-desk/board', '/support-desk/settings/departments', '/support-desk/settings/statuses', '/support-desk/settings/email', '/support-desk/settings/team']) {
    const response = await page.goto(`${url}${path}`);
    expect(response!.status(), path).toBe(200);
    await expect(page.locator('body')).not.toContainText('translation missing');
  }
  const manifest = await request.get(`${url}/support-desk/manifest.json`);
  expect(manifest.status()).toBe(200);
});
