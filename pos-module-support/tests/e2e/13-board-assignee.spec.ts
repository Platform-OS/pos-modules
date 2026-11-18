// Board assignee picker (Project 28: "Assignee picker on cards replaces the
// hover Move form"): the card's assignee button, the unassigned mark, choosing
// without a confirm step, Undo, keyboard, and the agent's limited choices.
import fs from 'fs';
import path from 'path';
import { test, expect, Page } from '@playwright/test';
import { contextFor, desk, liquid, newTicket, ticketField, users } from './helpers';

const state = () => JSON.parse(fs.readFileSync(path.join(__dirname, '.state.json'), 'utf8'));

const unassign = (id: string) => liquid(`{% liquid
  function t = 'modules/support/queries/tickets/find', id: '${id}', number: null, member: null
  assign actor = { "type": "system", "id": null, "member": null }
  function r = 'modules/support/commands/tickets/assign', ticket: t, assignee_id: null, reason: null, actor: actor
  echo '{}'
%}`);

const boardFor = async (page: Page, subject: string) => {
  await page.goto(desk(`/support-desk/board?q=${encodeURIComponent(subject)}`));
  return page.locator('.pos-support-card', { hasText: subject });
};

test('B1. a manager assigns from the card without confirming, and Undo puts it back', async ({ browser }) => {
  const { ticket, subject } = await newTicket('E2E board assign');
  unassign(ticket.id);
  const agentId = state().agent_profile_id;

  const admin = await contextFor(browser, users.superadmin);
  const card = await boardFor(admin.page, subject);
  const button = card.locator('[data-support-assign]');
  // no Move form; the unassigned mark with its accessible name
  await expect(card.locator('form')).toHaveCount(0);
  await expect(button.locator('.pos-support-unassigned')).toBeVisible();
  await expect(button).toHaveAttribute('aria-label', /Unassigned/);

  await button.click();
  const pop = admin.page.locator('.pos-support-assign-pop');
  await expect(pop).toBeVisible();
  await expect(pop.locator('[role="option"][data-me]')).toBeVisible();
  // Unassign is not offered on an unassigned ticket
  await expect(pop.locator('[role="option"][data-unassign]')).toHaveCount(0);
  await pop.locator(`[role="option"][data-value="${agentId}"]`).click();
  await expect(pop).toHaveCount(0);

  await expect.poll(() => ticketField(ticket.id, 'assignee_id'), { timeout: 20000 }).toBe(agentId);
  await expect(card.locator('[data-support-assign]')).toHaveAttribute('data-assignee-id', agentId, { timeout: 20000 });
  await expect(card.locator('[data-support-assign]')).toHaveAttribute('aria-label', /Assigned to/);

  await admin.page.locator('.pos-support-toast-undo').click();
  await expect.poll(() => ticketField(ticket.id, 'assignee_id') || null, { timeout: 20000 }).toBeNull();
  await expect(card.locator('[data-support-assign] .pos-support-unassigned')).toBeVisible({ timeout: 20000 });
  await admin.context.close();
});

test('B2. the picker works from the keyboard and Escape returns focus to the button', async ({ browser }) => {
  const { ticket, subject } = await newTicket('E2E board assign keys');
  const agentId = state().agent_profile_id;
  const admin = await contextFor(browser, users.superadmin);
  const card = await boardFor(admin.page, subject);
  const button = card.locator('[data-support-assign]');

  await button.focus();
  await admin.page.keyboard.press('Enter');
  const pop = admin.page.locator('.pos-support-assign-pop');
  await expect(pop).toBeVisible();
  // the current assignee is marked
  await expect(pop.locator(`[role="option"][data-value="${ticket.assignee_id}"]`)).toHaveAttribute('aria-selected', 'true');
  await admin.page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(button).toBeFocused();

  // Unassign is last; End is not available with a search box, so go down to it
  await admin.page.keyboard.press('Enter');
  const options = pop.locator('[role="option"]:not([hidden])');
  const count = await options.count();
  for (let i = 0; i < count; i++) await admin.page.keyboard.press('ArrowDown');
  await expect(pop.locator('[role="option"][data-unassign]')).toHaveClass(/pos-support-richselect-active/);
  await admin.page.keyboard.press('Enter');
  await expect.poll(() => ticketField(ticket.id, 'assignee_id') || null, { timeout: 20000 }).toBeNull();
  await expect(card.locator('[data-support-assign]')).toBeFocused({ timeout: 20000 });
  expect(agentId).toBeTruthy();
  await admin.context.close();
});

test('B4. on a phone the picker opens as a bottom sheet, like every dropdown', async ({ browser }) => {
  const { subject } = await newTicket('E2E board assign phone');
  const admin = await contextFor(browser, users.superadmin, { viewport: { width: 390, height: 844 } });
  const card = await boardFor(admin.page, subject);
  await card.locator('[data-support-assign]').click();
  const pop = admin.page.locator('.pos-support-assign-pop');
  await expect(pop).toHaveClass(/pos-support-richselect-sheet/);
  await expect(admin.page.locator('.pos-support-richselect-backdrop')).toBeVisible();
  const box = await pop.boundingBox();
  expect(Math.round((box?.x ?? -1))).toBe(0);
  expect(Math.round((box?.width ?? 0))).toBe(390);
  // tapping the backdrop closes it and gives focus back to the button
  await admin.page.mouse.click(195, 50);
  await expect(pop).toHaveCount(0);
  await expect(card.locator('[data-support-assign]')).toBeFocused();
  await admin.context.close();
});

test('B3. an agent can only take a ticket or give up their own', async ({ browser }) => {
  const { ticket, subject } = await newTicket('E2E board assign agent');
  unassign(ticket.id);
  const agentId = state().agent_profile_id;
  const agent = await contextFor(browser, users.agent);
  const card = await boardFor(agent.page, subject);

  await card.locator('[data-support-assign]').click();
  const pop = agent.page.locator('.pos-support-assign-pop');
  await expect(pop.locator('[role="option"]')).toHaveCount(1);
  await pop.locator('[role="option"][data-me]').click();
  await expect.poll(() => ticketField(ticket.id, 'assignee_id'), { timeout: 20000 }).toBe(agentId);

  await expect(card.locator('[data-support-assign]')).toHaveAttribute('data-assignee-id', agentId, { timeout: 20000 });
  await card.locator('[data-support-assign]').click();
  await expect(pop.locator('[role="option"]')).toHaveCount(1);
  await expect(pop.locator('[role="option"][data-unassign]')).toContainText('Unassign me');
  await agent.page.keyboard.press('Escape');
  await agent.context.close();
});

test('B5. design review C: the availability dot is spoken next to the assignee on the card, the row and in the picker', async ({ browser }) => {
  const { ticket, subject } = await newTicket('E2E availability spoken');
  const spoken = /\((Available|Away|Off)\)/;

  const admin = await contextFor(browser, users.superadmin);
  // queue row: the avatar is hidden, the text after the name carries the state
  await admin.page.goto(desk(`/support-desk?view=all_open&layout=list&q=${encodeURIComponent(subject)}`));
  const cell = admin.page.locator('tr', { hasText: subject }).locator('.pos-support-cell-assignee');
  await expect(cell.locator('.pos-support-avatar')).toHaveAttribute('aria-hidden', 'true');
  await expect(cell.locator('.pos-support-sr-only')).toHaveText(spoken);

  // board card: the assignee button's name includes it
  const card = await boardFor(admin.page, subject);
  const button = card.locator('[data-support-assign]');
  await expect(button).toHaveAttribute('aria-label', new RegExp(`Assigned to .+ ${spoken.source}`));

  // picker options, and the button's name after choosing someone
  await button.click();
  const pop = admin.page.locator('.pos-support-assign-pop');
  const other = pop.locator(`[role="option"][data-person]:not([data-value="${ticket.assignee_id}"])`).first();
  await expect(other.locator('.pos-support-assign-name .pos-support-sr-only')).toHaveText(spoken);
  await other.click();
  await expect(button).toHaveAttribute('aria-label', new RegExp(`Assigned to .+ ${spoken.source}`));
  await admin.context.close();
});
