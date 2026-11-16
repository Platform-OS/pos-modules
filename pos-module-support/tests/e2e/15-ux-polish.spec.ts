// Maciek's UX review (16 Nov 2026), one check per point: card padding and
// hover, drop places while dragging, the overdue mark animates once, a
// requester without a name, and the desk's own form validation.
import { test, expect } from '@playwright/test';
import { contextFor, desk, liquid, newTicket, users } from './helpers';

test('U1. board cards: even padding, a centred hover and a drop place in every other column while dragging', async ({ browser }) => {
  const { subject } = await newTicket('E2E polish board');
  const admin = await contextFor(browser, users.superadmin);
  const page = admin.page;
  await page.goto(desk(`/support-desk/board?q=${encodeURIComponent(subject)}`));
  const column = page.locator('.pos-support-column-cards').first();
  const padding = await column.evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingRight]);
  expect(padding[0]).toBe(padding[1]);

  const card = page.locator('.pos-support-card', { hasText: subject }).first();
  await card.hover();
  const inset = await card.evaluate((el) => {
    const s = getComputedStyle(el, '::before');
    return [s.left, s.right];
  });
  expect(inset[0]).toBe(inset[1]);

  // a drag shows "Drop a ticket here" at the end of every column except the card's own
  const source = await card.evaluate((el) => el.closest('.pos-support-column')?.getAttribute('data-group-key'));
  await card.evaluate((el) => el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() })));
  const places = await page.evaluate((own) => Array.from(document.querySelectorAll('.pos-support-column')).map((col) => {
    const cards = col.querySelector('.pos-support-column-cards');
    const after = getComputedStyle(cards, '::after').content;
    const before = getComputedStyle(cards, '::before').content;
    return { own: col.getAttribute('data-group-key') === own, shown: (after && after !== 'none') || (before && before !== 'none') };
  }), source);
  expect(places.filter((p) => !p.own).every((p) => p.shown)).toBe(true);
  expect(places.find((p) => p.own)?.shown).toBe(false);
  await card.evaluate((el) => el.dispatchEvent(new DragEvent('dragend', { bubbles: true })));
  await expect(page.locator('.pos-support-board-dragging')).toHaveCount(0);
  await admin.context.close();
});

test('U2. the overdue mark pings once, then stays still', async ({ browser }) => {
  const admin = await contextFor(browser, users.superadmin);
  await admin.page.goto(desk('/support-desk/board'));
  const iterations = await admin.page.evaluate(() => {
    const probe = document.createElement('span');
    probe.className = 'pos-support-sla-overdue';
    const card = document.querySelector('.pos-support-card');
    card?.append(probe);
    const count = getComputedStyle(probe).animationIterationCount;
    probe.remove();
    return count;
  });
  expect(iterations).toBe('1');
  await admin.context.close();
});

test('U3. a requester without a name: the address on two lines, never cut in the middle', async ({ browser }) => {
  const { ticket, subject } = await newTicket('E2E polish requester');
  liquid(`{% liquid
  assign values = { "name": "" }
  function props = 'modules/support/helpers/props', values: values
  graphql _ = 'modules/support/records/update', id: '${ticket.requester_id}', properties: props
  echo '{}'
%}`);
  const admin = await contextFor(browser, users.superadmin);
  await admin.page.goto(desk(`/support-desk?view=all_open&layout=list&q=${encodeURIComponent(subject)}`));
  const cell = admin.page.locator('.pos-support-row', { hasText: subject }).locator('.pos-support-cell-requester');
  await expect(cell.locator('.pos-support-email-split > span')).toHaveCount(2);
  await expect(cell.locator('.pos-support-email-split > span').nth(1)).toContainText('@e2e.example');
  await admin.context.close();
});

test('U4. forms show the desk’s own validation message, not the browser’s bubble', async ({ browser }) => {
  const { ticket } = await newTicket('E2E polish validation');
  const admin = await contextFor(browser, users.superadmin);
  const page = admin.page;
  await page.goto(desk(`/support-desk/tickets/${ticket.id}`));
  const form = page.locator('form:has([name="target_number"]), form:has([name="target"])').first();
  await expect(form).toHaveJSProperty('noValidate', true);
  const field = form.locator('input:not([type="hidden"])').first();
  await field.fill('');
  await form.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/support-desk/tickets/${ticket.id}`));
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const errorId = await field.getAttribute('aria-describedby');
  expect(errorId).toBeTruthy();
  await expect(page.locator(`#${errorId?.split(' ').pop()}`)).toHaveClass(/pos-support-field-error/);
  await expect(field).toBeFocused();
  await admin.context.close();
});
