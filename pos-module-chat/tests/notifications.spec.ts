import { test, expect, Browser, Page } from '@playwright/test';
import { LogInPage } from './pages/login';
import { InboxPage } from './pages/inbox';

/*
  Live notifications (modules/chat/public/assets/js/pos-chat-notifications.js), through the
  example app's unread badge on the Inbox link (app/views/partials/header.liquid).

  No other test talks to Dummy35 or Dummy36 (seeded by tests/post_import, password "password").
  The recipient first reads whatever is unread for them (the seeded conversation with test6,
  or what a failed run left behind), so the counter starts at 0 on an instance that isn't
  reseeded too. Texts are unique per run.
*/

const sender = { email: 'dummy35@example.com', name: 'Dummy35 User', query: 'dummy35' };
const recipient = { email: 'dummy36@example.com', name: 'Dummy36 User', query: 'dummy36' };
const run = Date.now();

const logIn = async (browser: Browser, email: string) => {
  const context = await browser.newContext();
  // every 'pos-chat:message' the pages of this context get, to check what they were given
  await context.addInitScript(() => {
    (window as any).chatMessages = [];
    document.addEventListener('pos-chat:message', event => (window as any).chatMessages.push((event as CustomEvent).detail));
  });
  const page = await context.newPage();
  const logInPage = new LogInPage(page);
  await logInPage.goto();
  await logInPage.logIn(email, 'password');
  await page.waitForURL('/');
  return { context, page };
};

const notifiedMessages = (page: Page) => page.evaluate(() => (window as any).chatMessages);

// the notifications client asks for the counters each time it connects
const waitForCounters = (page: Page) => page.waitForResponse(response => response.url().includes('/api/chat/notifications.json'));

const unreadCount = async (page: Page): Promise<number> => {
  const counters = await page.evaluate(() => fetch('/api/chat/notifications.json').then(response => response.json()));
  return counters.unread_conversations;
};

// opens each conversation the user hasn't read - the inbox marks it read once it connects
const readEverything = async (page: Page) => {
  const profileId = String(await page.evaluate(() => (window as any).pos.profile.id));
  const unreadIds = async (): Promise<string[]> => {
    const conversations = await page.evaluate(() => fetch('/api/chat/conversations.json?per_page=50').then(response => response.json()));
    return conversations.results
      .filter((conversation: any) => !conversation.participant_read_ids.map(String).includes(profileId))
      .map((conversation: any) => String(conversation.id));
  };

  for (const id of await unreadIds()) {
    await page.goto(`/inbox?conversation_id=${id}`);
    await expect.poll(async () => (await unreadIds()).includes(id), { timeout: 30_000 }).toBe(false);
  }
  expect(await unreadCount(page)).toBe(0);
};

test.describe('Live notifications', () => {
  test('the unread badge and pos-chat:message follow the messages, the reading and a lost connection', async ({ browser }) => {
    // notifications are sent by a background job, allow for the queue
    test.setTimeout(180_000);

    const { context: senderContext, page: senderPage } = await logIn(browser, sender.email);
    const { context: recipientContext, page: recipientPage } = await logIn(browser, recipient.email);
    const badge = recipientPage.getByTestId('unread-badge');

    const senderInbox = new InboxPage(senderPage);
    const send = async (text: string) => {
      await senderInbox.chat.messageInputFieldEnabled.waitFor();
      await senderInbox.chat.messageInputField.fill(text);
      await senderInbox.chat.buttonWithText('Send').click();
      await senderInbox.chat.messageBox.getMessageByText(text, 'sent').waitFor();
    };
    const messages = [`first ${run} <b>not bold</b>`, `second ${run}`, `third ${run}`];

    await test.step(`${recipient.name} has no unread conversations`, async () => {
      await readEverything(recipientPage);

      const counters = waitForCounters(recipientPage);
      await recipientPage.goto('/');
      expect(await (await counters).json()).toMatchObject({ unread_conversations: 0 });
      await expect(badge).toBeHidden();
    });

    await test.step(`${sender.name} sends a message - the badge shows 1 and the message is notified`, async () => {
      await senderInbox.goto();
      await senderInbox.isChatOpenedFromSearch(recipient.query, recipient.name);
      await send(messages[0]);

      await expect(badge).toHaveText('1', { timeout: 60_000 });
      await expect(badge).toBeVisible();
      await expect.poll(() => notifiedMessages(recipientPage), { timeout: 60_000 }).toHaveLength(1);

      const [notified] = await notifiedMessages(recipientPage);
      expect(notified).toMatchObject({ message: messages[0], sender_name: sender.name, active: false });
      expect(notified.url).toBe(`/inbox?conversation_id=${notified.conversation_id}`);
      // the text as typed, it's the page's job to escape it
      await expect(recipientPage.locator('b', { hasText: 'not bold' })).toHaveCount(0);
    });

    await test.step('a second message in the same conversation is notified, the badge stays at 1', async () => {
      await send(messages[1]);

      await expect.poll(() => notifiedMessages(recipientPage), { timeout: 60_000 }).toHaveLength(2);
      expect((await notifiedMessages(recipientPage))[1].message).toBe(messages[1]);
      await expect(badge).toHaveText('1');
    });

    await test.step(`${recipient.name} reads it in another tab - the badge on the first one goes away`, async () => {
      const inboxTab = await recipientContext.newPage();
      const recipientInbox = new InboxPage(inboxTab);
      await recipientInbox.goto();
      await recipientInbox.isChatOpenedFromSearch(sender.query, sender.name);

      await expect(badge).toBeHidden({ timeout: 30_000 });
      await expect(inboxTab.getByTestId('unread-badge')).toBeHidden({ timeout: 30_000 });
      await inboxTab.close();
    });

    await test.step('a message sent while disconnected is counted once the connection is back', async () => {
      await recipientPage.evaluate(() => (window as any).pos.modules.chat.notifications.consumer.disconnect());

      await send(messages[2]);
      // the server counts it right away, the notification sent meanwhile is lost
      await expect.poll(() => unreadCount(recipientPage), { timeout: 30_000 }).toBe(1);

      const counters = waitForCounters(recipientPage);
      await recipientPage.evaluate(() => (window as any).pos.modules.chat.notifications.consumer.connect());
      expect(await (await counters).json()).toMatchObject({ unread_conversations: 1 });
      await expect(badge).toHaveText('1');
      await expect(badge).toBeVisible();
    });

    await test.step(`${recipient.name} reads it, so the next run starts from 0`, async () => {
      await readEverything(recipientPage);
    });

    await senderContext.close();
    await recipientContext.close();
  });
});
