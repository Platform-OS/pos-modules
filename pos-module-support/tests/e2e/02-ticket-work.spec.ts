// Scenarios 5–8 (tech-spec 10 §3): presence and collision warning, SLA pause
// and resume, Confirmation in both modes, per-person notification switches.
import { test, expect, Page } from '@playwright/test';
import { contextFor, desk, inbound, liquid, newTicket, recipients, contentOf, reply as replyFromTicket, setting, setSetting, stubBodies, ticketField as field, unique, users, waitForStub } from './helpers';

// Replies from the ticket page and returns the token Reply-To address.
const reply = async (page: Page, ticketId: string, text: string, thenStatus?: string) => (await replyFromTicket(page, ticketId, text, thenStatus)).reply_to.email as string;


test('5. two agents on one ticket see each other, and the second sender is warned', async ({ browser }) => {
  const { ticket } = await newTicket('E2E presence');
  const a = await contextFor(browser, users.agent);
  const b = await contextFor(browser, users.superadmin);
  await a.page.goto(desk(`/support-desk/tickets/${ticket.id}`));
  await b.page.goto(desk(`/support-desk/tickets/${ticket.id}`));
  await expect(b.page.locator('[data-support-presence]')).toBeVisible({ timeout: 45000 });
  await a.page.fill('#pos-support-body', 'Drafting an answer…');
  const marker = unique('first-sender');
  await b.page.fill('#pos-support-body', `Answer ${marker}`);
  await b.page.click('[data-support-composer] button[type=submit]');
  await waitForStub((body) => contentOf(body).includes(marker));
  await expect(a.page.locator('[data-support-new-message]')).toBeVisible({ timeout: 45000 });
  await a.context.close();
  await b.context.close();
});

test('6. Waiting on customer pauses the SLA and a customer reply resumes it', async ({ browser }) => {
  const { customer, subject, ticket } = await newTicket('E2E SLA pause');
  const { context, page } = await contextFor(browser, users.agent);
  const replyTo = await reply(page, ticket.id, `Can you send the permit number? ${unique('ask')}`, 'customer');
  await expect.poll(() => field(ticket.id, 'sla_state'), { timeout: 60000, intervals: [3000] }).toBe('paused');
  await inbound({ from: customer, to: replyTo, subject: `Re: ${subject}`, body: 'It is 12345.' });
  await expect.poll(() => field(ticket.id, 'sla_state'), { timeout: 60000, intervals: [3000] }).not.toBe('paused');
  expect(field(ticket.id, 'category')).toBe('open');
  await context.close();
});

test('7. Confirmation: auto_close closes and a later reply opens a follow-up; keep_open notifies the assignee once', async ({ browser }) => {
  const mode = setting('confirmation_mode');
  const { context, page } = await contextFor(browser, users.agent);
  try {
    setSetting('confirmation_mode', '"auto_close"');
    const first = await newTicket('E2E auto close');
    const replyTo = await reply(page, first.ticket.id, `Fixed, please confirm ${unique('fix')}`, 'confirm');
    await expect.poll(() => field(first.ticket.id, 'category'), { timeout: 60000, intervals: [3000] }).toBe('solved');
    const ended = endWaitingPeriod(first.ticket.id, 'auto_close');
    expect(ended).toBe('closed');
    expect(field(first.ticket.id, 'category')).toBe('closed');
    await inbound({ from: first.customer, to: replyTo, subject: `Re: ${first.subject}`, body: 'It broke again.' });
    await expect.poll(() => liquid(`{% liquid
  graphql r = 'modules/support/tickets/search', limit: 5
  assign out = { "ids": null }
  assign out.ids = r.records.results | map: 'follow_up_of_id'
  echo out | json | html_safe
%}`).ids, { timeout: 90000, intervals: [3000] }).toContain(first.ticket.id);

    setSetting('confirmation_mode', '"keep_open"');
    const second = await newTicket('E2E keep open');
    await reply(page, second.ticket.id, `Fixed too ${unique('fix')}`, 'confirm');
    await expect.poll(() => field(second.ticket.id, 'category'), { timeout: 60000, intervals: [3000] }).toBe('solved');
    expect(endWaitingPeriod(second.ticket.id, 'keep_open')).toBe('notified');
    expect(endWaitingPeriod(second.ticket.id, 'keep_open')).not.toBe('notified');
    expect(field(second.ticket.id, 'category')).toBe('solved');
    const number = String(second.ticket.number);
    await waitForStub((b) => recipients(b).includes(users.agent.email.toLowerCase()) && b.subject.includes('Confirmation period ended') && contentOf(b).includes(`#${number}`));
    await new Promise((r) => setTimeout(r, 15000));
    const notices = stubBodies().filter((b) => recipients(b).includes(users.agent.email.toLowerCase()) && b.subject.includes('Confirmation period ended') && contentOf(b).includes(`#${number}`));
    expect(notices.length).toBe(1);
  } finally {
    setSetting('confirmation_mode', JSON.stringify(mode || 'auto_close'));
    await context.close();
  }
});

// Moves solved_at back past the waiting period and runs the sweep's step for it.
function endWaitingPeriod(ticketId: string, mode: string) {
  return liquid(`{% liquid
  assign past = 'now' | to_time | minus: 2592000 | strftime: '%Y-%m-%dT%H:%M:%S.000Z'
  assign values = { "solved_at": null }
  assign values.solved_at = past
  function props = 'modules/support/helpers/props', values: values
  graphql _ = 'modules/support/records/update', id: '${ticketId}', properties: props
  function t = 'modules/support/queries/tickets/find', id: '${ticketId}', number: null, member: null
  function done = 'modules/support/commands/maintenance/confirmation_ended', ticket: t, mode: '${mode}'
  assign out = { "done": null }
  assign out.done = done
  echo out | json | html_safe
%}`).done;
}

test('8. switching off push for "assigned" still sends the email and no push', async ({ browser }) => {
  const { context, page } = await contextFor(browser, users.agent);
  const pushSwitch = () => page.getByRole('switch', { name: 'Ticket assigned to me – push' });
  await page.goto(desk('/support-desk/profile'));
  const saved = () => page.waitForResponse((r) => r.url().endsWith('/support-desk/profile') && r.request().method() === 'POST');
  if ((await pushSwitch().getAttribute('aria-checked')) === 'true') {
    await Promise.all([saved(), pushSwitch().click()]);
    await expect(pushSwitch()).toHaveAttribute('aria-checked', 'false');
  }
  await page.reload();
  await expect(pushSwitch()).toHaveAttribute('aria-checked', 'false');
  try {
    const { ticket } = await newTicket('E2E assigned email');
    await waitForStub((b) => recipients(b).includes(users.agent.email.toLowerCase()) && b.subject.includes('Ticket assigned to you') && contentOf(b).includes(`#${ticket.number}`));
    const other = await newTicket('E2E dispatch check');
    const agentId = other.ticket.assignee_id;
    const result = liquid(`{% liquid
  assign ids = []
  assign ids << '${agentId}'
  function r = 'modules/support/commands/notifications/dispatch', event_key: 'assigned', ticket_id: '${other.ticket.id}', recipient_ids: ids, actor_id: null
  echo r | json | html_safe
%}`);
    expect(result.pushed).toBe(0);
  } finally {
    await page.goto(desk('/support-desk/profile'));
    if ((await pushSwitch().getAttribute('aria-checked')) === 'false') {
      await Promise.all([saved(), pushSwitch().click()]);
      await expect(pushSwitch()).toHaveAttribute('aria-checked', 'true');
    }
    await context.close();
  }
});
