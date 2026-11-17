// QA round 2 (Rafał's and Dora's reports, 10–16 Nov 2026): one check per
// fixed report that a browser can show.
import { test, expect } from '@playwright/test';
import { choose, contentOf, contextFor, createHostUser, desk, newTicket, recipients, unique, users, waitForStub } from './helpers';

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

test('Q3. request to join: from the sign-in page, confirm the address, ask for access, sign out', async ({ page }) => {
  const email = `${unique('joiner')}@e2e.example`;
  await page.goto(desk('/support-desk/sign-in'));
  await page.click('a[href="/support-desk/join"]');
  await page.fill('#pos-support-join-name', 'Joan Joiner');
  await page.fill('#pos-support-join-email', email);
  await page.fill('#pos-support-join-password', 'short');
  await page.fill('#pos-support-join-confirm', 'short');
  await page.click('button[type=submit]');
  // the same password rule as an invitation
  await expect(page.locator('#pos-support-join-password-error')).toBeVisible();
  await page.fill('#pos-support-join-password', 'Joiner-password-2026');
  await page.fill('#pos-support-join-confirm', 'Joiner-password-2026');
  await page.click('button[type=submit]');
  await expect(page.locator('.pos-support-callout[role=status]')).toBeVisible();

  const mail = await waitForStub((b) => recipients(b).includes(email));
  const link = contentOf(mail).match(/https:\/\/[^"\s<]+\/support-desk\/join\/verify\?token=[^"\s<]+/)?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!.replace(/&amp;/g, '&'));
  await page.fill('#ra-note', 'QA round 2');
  await page.click('form[action="/support-desk/request-access"] button[type=submit]');
  await expect(page.locator('.pos-support-gate h1')).toContainText(/Request sent/);
  // back on the desk: the request is waiting, and there is a way out
  await page.goto(desk('/support-desk'));
  await expect(page.locator('form[action="/support-desk/request-access"]')).toHaveCount(0);
  await page.click('.pos-support-gate-signout button');
  await expect(page).toHaveURL(/\/support-desk\/sign-in/);
});

test('Q4. a signed-in non-member with an unconfirmed address is asked to confirm it, and can sign out', async ({ browser }) => {
  const email = `${unique('unconfirmed')}@e2e.example`;
  const user = createHostUser(email, []);
  const { context, page } = await contextFor(browser, user);
  await page.goto(desk('/support-desk'));
  await expect(page.locator('form[action="/support-desk/join/resend"]')).toBeVisible();
  await expect(page.locator('form[action="/support-desk/request-access"]')).toHaveCount(0);
  await expect(page.locator('.pos-support-gate-signout button')).toBeVisible();
  await context.close();
});

test('Q5. attachments: choosing files again adds to them, and each can be removed', async ({ browser }) => {
  const { ticket } = await newTicket('E2E QA attachments');
  const admin = await contextFor(browser, users.superadmin);
  const page = admin.page;
  await page.goto(desk(`/support-desk/tickets/${ticket.id}`));
  await page.setInputFiles('#pos-support-files', { name: 'first.txt', mimeType: 'text/plain', buffer: Buffer.from('one') });
  await expect(page.locator('[data-support-files-list] .pos-support-chip')).toHaveCount(1);
  await page.setInputFiles('#pos-support-files', { name: 'second.txt', mimeType: 'text/plain', buffer: Buffer.from('two') });
  await expect(page.locator('[data-support-files-list] .pos-support-chip')).toHaveCount(2);
  await expect(page.locator('[data-support-files-fields] input[name="attachments[][filename]"]')).toHaveCount(2);
  await page.click('[data-support-files-list] .pos-support-chip:has-text("first.txt") .pos-support-chip-remove');
  await expect(page.locator('[data-support-files-list] .pos-support-chip')).toHaveCount(1);
  await expect(page.locator('[data-support-files-fields] input[name="attachments[][filename]"]')).toHaveValue('second.txt');
  await admin.context.close();
});

test('Q6. a note offers colleagues after "@" and writes the chosen full name; status options say what the customer sees', async ({ browser }) => {
  const { ticket } = await newTicket('E2E QA mention');
  const admin = await contextFor(browser, users.superadmin);
  const page = admin.page;
  await page.goto(desk(`/support-desk/tickets/${ticket.id}`));
  await expect(page.locator('#pos-support-then option', { hasText: 'customer sees' }).first()).toBeAttached();
  await page.click('input[name="mode"][value="note"] >> xpath=..');
  const first = page.locator('[data-support-mentions] [role="option"]').first();
  const name = await first.getAttribute('data-name');
  expect(name).toBeTruthy();
  await page.click('#pos-support-body');
  await page.keyboard.type(`Please check @${name!.slice(0, 2)}`);
  await expect(page.locator('[data-support-mentions]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-support-mentions]')).toBeHidden();
  await expect(page.locator('#pos-support-body')).toHaveValue(new RegExp(`@${name!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} $`));
  // the draft is not sent: leave without the unsaved-reply warning
  await page.fill('#pos-support-body', '');
  await admin.context.close();
});

test('Q7. team settings: Edit opens the form in view, and an admin role hides the department list', async ({ browser }) => {
  const admin = await contextFor(browser, users.superadmin);
  const page = admin.page;
  await page.goto(desk('/support-desk/settings/team'));
  await page.locator('a[href*="?edit="]').first().click();
  await expect(page).toHaveURL(/#tm-edit-section$/);
  await expect(page.locator('#tm-edit-section')).toBeFocused();
  await expect(page.locator('#tm-edit-section')).toBeInViewport();
  const departments = page.locator('#tm-new-role').locator('xpath=ancestor::form').locator('[data-support-departments]');
  await choose(page, '#tm-new-role', 'admin');
  await expect(departments).toBeHidden();
  await choose(page, '#tm-new-role', 'manager');
  await expect(departments).toBeVisible();
  await expect(departments.locator('[data-support-role-help="manager"]')).toBeVisible();
  await expect(departments.locator('[data-support-role-help="agent"]')).toBeHidden();
  await admin.context.close();
});

test('Q8. the board of All open shows how its total splits into open and waiting; the reset tooltip is on top', async ({ browser }) => {
  await newTicket('E2E QA board split');
  const admin = await contextFor(browser, users.superadmin);
  const page = admin.page;
  await page.goto(desk('/support-desk/board?view=all_open'));
  await expect(page.locator('[data-support-count-split]')).toContainText(/\d+ open \+ \d+ waiting/);
  await page.goto(desk('/support-desk?view=all_open&layout=list'));
  await expect(page.locator('[data-support-count-split]')).toHaveCount(0);

  await page.goto(desk('/support-desk?view=all_open&layout=list&priority=p2'));
  const reset = page.locator('[data-support-reset-filters]');
  await reset.hover();
  await page.waitForTimeout(600);
  // the tooltip (pointer-events: none, so not hit-testable) is painted in the toolbar's layer, which sits above the sticky table head
  const layers = await page.evaluate(() => {
    const toolbar = document.querySelector('[data-support-reset-filters]')!.closest('.pos-support-toolbar')!;
    const head = document.querySelector('.pos-support-table thead th');
    return [Number(getComputedStyle(toolbar).zIndex), head ? Number(getComputedStyle(head).zIndex) : 0];
  });
  expect(layers[0]).toBeGreaterThan(layers[1]);
  await expect(reset).toHaveCSS('position', 'relative');
  await admin.context.close();
});

test('Q9. a ticket with a long message scrolls, and the reply box keeps its Send row', async ({ browser }) => {
  const long = Array.from({ length: 80 }, (_, i) => `Line ${i + 1} of a long customer message.`).join('\n');
  const { ticket } = await newTicket('E2E QA long');
  const admin = await contextFor(browser, users.superadmin);
  const page = admin.page;
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.goto(desk(`/support-desk/tickets/${ticket.id}`));
  // a long thread: make the first message long in the browser, as a long email renders
  await page.evaluate((text) => {
    const body = document.querySelector('.pos-support-thread');
    const filler = document.createElement('pre');
    filler.textContent = text;
    body?.prepend(filler);
  }, long);
  const composer = page.locator('[data-support-composer]');
  const sendRow = page.locator('[data-support-send]');
  const sizes = await page.locator('.pos-support-composer').evaluate((el) => [el.clientHeight, el.scrollHeight]);
  expect(sizes[0]).toBeGreaterThanOrEqual(sizes[1] - 1);
  await sendRow.scrollIntoViewIfNeeded();
  await expect(sendRow).toBeInViewport();
  await expect(composer).toBeVisible();
  await admin.context.close();
});
