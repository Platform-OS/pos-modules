// Scenarios 1–4 (tech-spec 10 §3): email to ticket, reply, threaded customer
// reply with live queue update, internal notes never emailed.
import { test, expect } from '@playwright/test';
import { contextFor, desk, inbound, liquid, recipients, contentOf, stubBodies, ticketBySubject, unique, users, waitForStub, waitForTicket } from './helpers';

test.describe.serial('email flow', () => {
  const customer = `${unique('customer')}@e2e.example`;
  const subject = unique('E2E permit question');
  let ticket: any;
  let replyTo: string;

  test('1. webhook email becomes a ticket in the queue, auto-assigned to the least-loaded agent', async ({ browser }) => {
    const { context, page } = await contextFor(browser, users.agent);
    await page.goto(desk('/support-desk?view=mine'));
    await inbound({ from: customer, to: 'e2e@support-dev.platformos.com', subject, body: 'Hello, where is my permit?' });
    ticket = await waitForTicket(subject, 60000);
    const agent = liquid(`{% liquid
  function u = 'modules/user/queries/user/find', email: '${users.agent.email}', id: null, with_token: false, expires_in: null
  function p = 'modules/user/queries/profiles/find', user_id: u.id, id: null, uuid: null, first_name: null, last_name: null
  assign out = { "id": null }
  assign out.id = p.id
  echo out | json | html_safe
%}`);
    await expect.poll(() => ticketBySubject(subject).ticket.assignee_id, { timeout: 60000, intervals: [3000] }).toBe(agent.id);
    await expect(page.locator('.pos-support-row', { hasText: subject })).toBeVisible({ timeout: 60000 });
    await context.close();
  });

  test('2. a reply from the ticket is sent through the provider', async ({ browser }) => {
    const { context, page } = await contextFor(browser, users.agent);
    await page.goto(desk(`/support-desk/tickets/${ticket.id}`));
    await page.fill('#pos-support-body', `Your permit is on its way (${subject}).`);
    await page.click('[data-support-composer] button[type=submit]');
    const body = await waitForStub((b) => recipients(b).includes(customer) && contentOf(b).includes('Your permit is on its way'));
    expect(body.subject).toContain(subject);
    replyTo = body.reply_to.email;
    expect(replyTo).toMatch(/^e2e\+t\.\d+\.[a-f0-9]{16}@/);
    await expect.poll(() => liquid(`{% liquid
  graphql r = 'modules/support/messages/search', ticket_id: '${ticket.id}', limit: 20
  assign out = { "states": null }
  assign out.states = r.records.results | map: 'delivery_state'
  echo out | json | html_safe
%}`).states, { timeout: 60000 }).toContain('sent');
    await context.close();
  });

  test('3. a customer reply with our token joins the ticket and the queue row updates live', async ({ browser }) => {
    const { context, page } = await contextFor(browser, users.agent);
    // filtered to this ticket: earlier runs leave enough tickets to push it past the first page
    await page.goto(desk(`/support-desk?view=mine&q=${encodeURIComponent(subject)}`));
    const row = page.locator('.pos-support-row', { hasText: subject });
    await expect(row).toBeVisible();
    await expect(row.locator('.pos-support-needs-reply')).toHaveCount(0);
    await page.waitForTimeout(2000);
    await inbound({ from: customer, to: replyTo, subject: `Re: ${subject}`, body: 'Thanks, one more question.' });
    await expect(row.locator('.pos-support-needs-reply')).toBeVisible({ timeout: 60000 });
    const after = await waitForTicket(subject);
    expect(after.id).toBe(ticket.id);
    expect(after.needs_reply).toBe(true);
    await context.close();
  });

  test('4. an internal note never appears in the customer email', async ({ browser }) => {
    const { context, page } = await contextFor(browser, users.agent);
    const secret = unique('INTERNAL-NOTE');
    await page.goto(desk(`/support-desk/tickets/${ticket.id}`));
    await page.check('input[name=mode][value=note]');
    await page.fill('#pos-support-body', `Do not tell the customer: ${secret}`);
    await page.click('[data-support-composer] button[type=submit]');
    await expect(page.locator('.pos-support-thread')).toContainText(secret);
    await page.check('input[name=mode][value=reply]');
    const marker = unique('second-reply');
    await page.fill('#pos-support-body', `Here is the answer ${marker}.`);
    await page.click('[data-support-composer] button[type=submit]');
    const body = await waitForStub((b) => contentOf(b).includes(marker));
    expect(contentOf(body)).not.toContain(secret);
    expect(stubBodies().some((b) => contentOf(b).includes(secret))).toBe(false);
    await context.close();
  });

  test('1b. the activity log names the assignment reason', async ({ browser }) => {
    const { context, page } = await contextFor(browser, users.agent);
    await page.goto(desk(`/support-desk/tickets/${ticket.id}`));
    await expect(page.locator('.pos-support-activity')).toContainText('least-loaded in E2E');
    await context.close();
  });
});
