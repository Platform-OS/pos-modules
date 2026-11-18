// Safari with its default settings (Settings → Advanced → "Press Tab to
// highlight each item on a webpage" off) moves Tab only between text fields
// and selects, skipping links, buttons and checkboxes that have no tabindex.
// Playwright's WebKit behaves the same way, so these walk the desk with Tab
// in WebKit and check that every kind of control is reached (QA: [Bug] Safari:
// desk not reachable by keyboard; [UI] Custom dropdowns everywhere).
// Run: npx playwright install webkit && npx playwright test --project=safari
import { test, expect, Page } from '@playwright/test';
import { desk, newTicket, signIn, users } from './helpers';

// what has the focus after each Tab, from the top of the page
async function tabWalk(page: Page, presses: number): Promise<string[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const seen: string[] = [];
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (el.getAttribute('role') === 'combobox') return `combobox#${el.getAttribute('aria-labelledby') || el.id}`;
      if (el.tagName === 'A') return `link:${el.getAttribute('href')}`;
      if (el.tagName === 'INPUT') return `input:${(el as HTMLInputElement).type}:${(el as HTMLInputElement).name}`;
      return `${el.tagName.toLowerCase()}:${(el.textContent || '').trim().slice(0, 30)}`;
    }));
  }
  return seen;
}

test('K1. queue: Tab reaches the sidebar, toggles, attention chips, filter dropdowns, rows and sign out', async ({ page }) => {
  await signIn(page, users.superadmin);
  await page.goto(desk('/support-desk?view=all_open&layout=list'));
  await page.waitForSelector('[role="combobox"]');
  const seen = await tabWalk(page, 60);
  const has = (pattern: RegExp) => seen.some((s) => pattern.test(s));
  expect(has(/^link:\/support-desk\?view=needs_reply/), 'attention chip / sidebar view').toBe(true);
  expect(has(/^link:\/support-desk\/settings/), 'Settings').toBe(true);
  expect(has(/^button:Sign out/), 'Sign out').toBe(true);
  expect(has(/layout=board/), 'List/Board toggle').toBe(true);
  expect(seen.filter((s) => s.startsWith('combobox#')).length, 'filter dropdowns').toBeGreaterThanOrEqual(3);
  expect(has(/^input:checkbox/), 'row checkbox').toBe(true);
  expect(has(/^link:\/support-desk\/tickets\//), 'ticket link').toBe(true);
});

test('K2. ticket page: Tab reaches the property dropdowns, the reply / note choice, attachments and Send', async ({ page }) => {
  const { ticket } = await newTicket('E2E Safari keyboard');
  await signIn(page, users.superadmin);
  await page.goto(desk(`/support-desk/tickets/${ticket.id}`));
  await page.waitForSelector('[role="combobox"]');
  const seen = await tabWalk(page, 80);
  const has = (pattern: RegExp) => seen.some((s) => pattern.test(s));
  expect(seen.filter((s) => s.startsWith('combobox#')).length, 'property and composer dropdowns').toBeGreaterThanOrEqual(3);
  expect(has(/^input:radio:mode/), 'Reply / Internal note').toBe(true);
  expect(has(/^input:file/), 'Attachments').toBe(true);
  expect(has(/^button:Send/), 'Send').toBe(true);
  // a radio group is one stop, as in other browsers: never two stops in a row
  const doubled = seen.some((s, i) => s === 'input:radio:mode' && seen[i + 1] === 'input:radio:mode');
  expect(doubled, 'Reply / Internal note is a single Tab stop').toBe(false);
});

test('K3. a dropdown reached by Tab opens with the arrow key and takes a choice from the keyboard', async ({ page }) => {
  await signIn(page, users.superadmin);
  await page.goto(desk('/support-desk?view=all_open&layout=list'));
  await page.waitForSelector('[role="combobox"]');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let reached = '';
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.getAttribute('aria-labelledby') === 'pos-support-sort-label' ? 'sort' : '');
  }
  expect(reached, 'Tab reaches the Sort dropdown').toBe('sort');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[role="combobox"][aria-labelledby="pos-support-sort-label"]')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="combobox"][aria-labelledby="pos-support-sort-label"]')).toHaveAttribute('aria-expanded', 'false');
});
