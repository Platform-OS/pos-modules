// QA round 2 (Rafał's and Dora's reports, 10–16 Nov 2026): one check per
// fixed report that a browser can show.
import { test, expect } from '@playwright/test';
import { contentOf, createHostUser, desk, recipients, unique, waitForStub } from './helpers';

test('Q1. forgot password: the desk form confirms, emails a desk link, and the new password signs in', async ({ page }) => {
  const email = `${unique('reset')}@e2e.example`;
  createHostUser(email, []);
  await page.goto(desk('/support-desk/sign-in'));
  await page.click('a[href="/support-desk/password"]');
  await page.fill('#pos-support-password-email', email);
  await page.click('button[type=submit]');
  await expect(page.locator('.pos-support-callout[role=status]')).toBeVisible();

  const mail = await waitForStub((b) => recipients(b).includes(email));
  const link = contentOf(mail).match(/https:\/\/[^"\s<]+\/support-desk\/password\/new\?token=[^"\s<]+/)?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!.replace(/&amp;/g, '&'));
  await page.fill('#pos-support-new-password', 'Brand-new-pass-2026!');
  await page.fill('#pos-support-new-password-confirm', 'Brand-new-pass-2026!');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/sign-in\?reset=1/);
  await page.fill('#pos-support-email', email);
  await page.fill('#pos-support-password', 'Brand-new-pass-2026!');
  await page.click('button[type=submit]');
  // a host user with no membership lands on the no-access page, signed in
  await expect(page).toHaveURL(/\/support-desk/);
  await expect(page.locator('#pos-support-email')).toHaveCount(0);
});

test('Q2. sent emails are not readable without signing in', async ({ request }) => {
  const res = await request.get(desk('/_tests/sent_mails'));
  expect(res.status()).toBe(404);
});
