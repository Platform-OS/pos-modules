import { test, expect, Browser, Page } from '@playwright/test';
import { LogInPage } from './pages/login';
import { InboxPage } from './pages/inbox';

/*
  Live notifications (modules/chat/public/assets/js/pos-chat-notifications.js), through the
  example app's unread badge on the Inbox link (app/views/partials/header.liquid), found by
  its data-pos-chat-unread-conversations attribute.

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

// the badge on the Inbox link - found by the attribute the module fills in, what a host app relies on
const unreadBadge = (page: Page) => page.locator('[data-pos-chat-unread-conversations]');

const notifiedMessages = (page: Page) => page.evaluate(() => (window as any).chatMessages);

// the notifications client asks for the counters each time it connects
const waitForCounters = (page: Page) => page.waitForResponse(response => response.url().includes('/api/chat/notifications.json'));

const unreadCount = async (page: Page): Promise<number> => {
  const counters = await page.evaluate(() => fetch('/api/chat/notifications.json').then(response => response.json()));
  return counters.unread_conversations;
};

// opens each conversation the user hasn't read - the inbox marks it read once it connects
const readEverything = async (page: Page) => {
  // the cards the sidebar shows as unread
  const unreadIds = (): Promise<string[]> => page.evaluate(async () => {
    const doc = new DOMParser().parseFromString(await (await fetch('/conversations.frame?per_page=50')).text(), 'text/html');
    return [...doc.querySelectorAll<HTMLElement>('li[data-conversation-id]')]
      .filter(li => li.querySelector('.pos-chat-conversationCard-unread'))
      .map(li => li.dataset.conversationId!);
  });

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
    const badge = unreadBadge(recipientPage);

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
      // attached first - toBeHidden alone would pass without any badge on the page
      await expect(badge).toBeAttached();
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
      // the seeded profiles have no avatar, so there's no picture to send
      expect(notified).toMatchObject({ message: messages[0], preview: messages[0], attachment_count: 0, sender_avatar_url: null, sender_name: sender.name, active: false });
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

    await test.step('a message with an image only is notified with a preview saying so', async () => {
      await senderInbox.chat.attachFiles(['cat1.jpg']);
      await senderInbox.chat.sendAttachments();

      await expect.poll(() => notifiedMessages(recipientPage), { timeout: 60_000 }).toHaveLength(3);
      expect((await notifiedMessages(recipientPage))[2]).toMatchObject({ preview: 'Sent an image', attachment_count: 1 });
    });

    await test.step(`${recipient.name} reads it in another tab - the badge on the first one goes away`, async () => {
      const inboxTab = await recipientContext.newPage();
      const recipientInbox = new InboxPage(inboxTab);
      await recipientInbox.goto();
      await recipientInbox.isChatOpenedFromSearch(sender.query, sender.name);

      await expect(badge).toBeHidden({ timeout: 30_000 });
      await expect(unreadBadge(inboxTab)).toBeHidden({ timeout: 30_000 });
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

  // no other test talks to Dummy32, Dummy33 or Dummy34
  test('the inbox sidebar follows the messages and the reading without reloading the page', async ({ browser }) => {
    test.setTimeout(180_000);

    const owner = { email: 'dummy34@example.com', name: 'Dummy34 User', query: 'dummy34' };
    const opened = { email: 'dummy33@example.com', name: 'Dummy33 User', query: 'dummy33' };
    const other = { email: 'dummy32@example.com', name: 'Dummy32 User' };
    const texts = { opened: `opened ${run}`, reply: `reply ${run}`, other: `from Dummy32 ${run}`, again: `again ${run}` };

    const { context: ownerContext, page: ownerPage } = await logIn(browser, owner.email);
    const ownerInbox = new InboxPage(ownerPage);
    const cards = ownerPage.locator('#pos-chat-conversations > li[data-conversation-id] .pos-chat-conversationCard');
    const card = (name: string) => ownerInbox.chatList.getCardByAuthor(name);
    // the list's reloads - a message in the open conversation updates its card without one
    let listReloads = 0;
    ownerPage.on('request', request => {
      if(request.url().includes('/conversations.frame')){
        listReloads++;
      }
    });

    await test.step('the owner opens a new chat and sends the first message - its card replaces the draft one', async () => {
      await readEverything(ownerPage);

      await ownerInbox.goto();
      await ownerInbox.isChatOpenedFromSearch(opened.query, opened.name);
      // the page is never reloaded from here on
      await ownerPage.evaluate(() => (window as any).notReloaded = true);

      await ownerInbox.chat.sendMessage(texts.opened);

      await expect(ownerInbox.chatList.getCardLastMessage(opened.name)).toHaveText(texts.opened);
      await expect(card(opened.name)).toHaveClass(/pos-chat-conversationCard-active/);
      await expect(ownerPage.locator('.pos-chat-conversations-draft')).toHaveCount(0);
      await expect(cards.first()).toContainText(opened.name);
    });

    await test.step('a reply in the open conversation is read right away - the unread badge doesn\'t flash, its card is updated without reloading the list', async () => {
      listReloads = 0;
      await ownerPage.evaluate(() => {
        (window as any).unreadCounts = [];
        document.addEventListener('pos-chat:unread', event => (window as any).unreadCounts.push((event as CustomEvent).detail.unread_conversations));
      });

      const { context: openedContext, page: openedPage } = await logIn(browser, opened.email);
      const openedInbox = new InboxPage(openedPage);
      await openedInbox.goto();
      await openedInbox.chatList.openCard(owner.name);
      await openedInbox.chat.sendMessage(texts.reply);
      await openedContext.close();

      await ownerInbox.chat.messageBox.getMessageByText(texts.reply, 'received').waitFor();
      // the notification is sent by a background job, allow for the queue
      await expect.poll(async () => (await notifiedMessages(ownerPage)).map((message: any) => message.message), { timeout: 60_000 }).toContain(texts.reply);
      // the number counted after the inbox marked it read, if it comes later
      await ownerPage.waitForTimeout(2_000);

      expect(await ownerPage.evaluate(() => (window as any).unreadCounts)).not.toContain(1);
      await expect(unreadBadge(ownerPage)).toBeHidden();
      await expect(card(opened.name)).not.toHaveClass(/pos-chat-conversationCard-unread/);
      await expect(ownerInbox.chatList.getCardLastMessage(opened.name)).toHaveText(texts.reply);
      await expect(card(opened.name).locator('time')).toHaveText('now');
      expect(listReloads).toBe(0);
    });

    await test.step('a message in another conversation puts it on top, unread - the list is reloaded for it', async () => {
      listReloads = 0;
      const { context: otherContext, page: otherPage } = await logIn(browser, other.email);
      const otherInbox = new InboxPage(otherPage);
      await otherInbox.goto();
      await otherInbox.isChatOpenedFromSearch(owner.query, owner.name);
      await otherInbox.chat.sendMessage(texts.other);
      await otherContext.close();

      // sent by a background job, allow for the queue
      await expect(cards.first()).toContainText(other.name, { timeout: 60_000 });
      await expect(ownerInbox.chatList.getCardLastMessage(other.name)).toHaveText(texts.other);
      await expect(card(other.name)).toHaveClass(/pos-chat-conversationCard-unread/);
      // the open one is still shown as open
      await expect(card(opened.name)).toHaveClass(/pos-chat-conversationCard-active/);
      expect(listReloads).toBeGreaterThan(0);
    });

    await test.step('the owner\'s own message updates the open conversation\'s card, the unread one stays on top', async () => {
      listReloads = 0;
      await ownerInbox.chat.sendMessage(texts.again);

      await expect(ownerInbox.chatList.getCardLastMessage(opened.name)).toHaveText(texts.again);
      await expect(cards.first()).toContainText(other.name);
      // the first of the read ones
      await expect(cards.nth(1)).toContainText(opened.name);
      // a reload would have come within its 300 ms debounce
      await ownerPage.waitForTimeout(1_000);
      expect(listReloads).toBe(0);
    });

    await test.step('reading it in another tab marks it read, the newest conversation goes on top', async () => {
      const otherTab = await ownerContext.newPage();
      await otherTab.goto(await card(other.name).locator('xpath=ancestor::a').getAttribute('href') ?? '');
      await new InboxPage(otherTab).chat.messageInputFieldEnabled.waitFor();

      await expect(card(other.name)).not.toHaveClass(/pos-chat-conversationCard-unread/, { timeout: 30_000 });
      await expect(cards.first()).toContainText(opened.name);
      await otherTab.close();
    });

    expect(await ownerPage.evaluate(() => (window as any).notReloaded)).toBe(true);

    await ownerContext.close();
  });

  // no other test talks to Dummy30 or Dummy31
  test('with several tabs open, only one fires pos-chat:message - the one with the conversation open', async ({ browser }) => {
    test.setTimeout(180_000);

    const sender = { email: 'dummy30@example.com' };
    const recipient = { email: 'dummy31@example.com', name: 'Dummy31 User', query: 'dummy31' };
    const texts = [`tabs one ${run}`, `tabs two ${run}`];

    const { context: senderContext, page: senderPage } = await logIn(browser, sender.email);
    const senderInbox = new InboxPage(senderPage);
    await senderInbox.goto();
    await senderInbox.isChatOpenedFromSearch(recipient.query, recipient.name);

    const { context: recipientContext, page: firstTab } = await logIn(browser, recipient.email);
    const secondTab = await recipientContext.newPage();
    // both connected, the first count asked for once connected
    const counters = waitForCounters(secondTab);
    await secondTab.goto('/');
    await counters;

    const notified = async (text: string) => {
      const tabs = await Promise.all([firstTab, secondTab].map(async tab => (await notifiedMessages(tab)).filter((message: any) => message.message === text)));
      return tabs.map(messages => messages.length);
    };

    await test.step('a message with two tabs on other pages is notified in one of them', async () => {
      await senderInbox.chat.sendMessage(texts[0]);

      // sent by a background job, allow for the queue
      await expect.poll(async () => (await notified(texts[0])).reduce((sum, count) => sum + count, 0), { timeout: 60_000 }).toBe(1);
      // the other tab had the time to fire it too, if it was going to
      await firstTab.waitForTimeout(2_000);
      expect((await notified(texts[0])).reduce((sum, count) => sum + count, 0)).toBe(1);
    });

    await test.step('the tab with the conversation open gets the next one, marked active', async () => {
      const conversationId = await senderInbox.currentConversationId();
      await secondTab.goto(`/inbox?conversation_id=${conversationId}`);
      await new InboxPage(secondTab).chat.messageInputFieldEnabled.waitFor();
      await secondTab.bringToFront();

      await senderInbox.chat.sendMessage(texts[1]);

      await expect.poll(() => notified(texts[1]), { timeout: 60_000 }).toEqual([0, 1]);
      await firstTab.waitForTimeout(2_000);
      expect(await notified(texts[1])).toEqual([0, 1]);
      const [message] = (await notifiedMessages(secondTab)).filter((message: any) => message.message === texts[1]);
      expect(message.active).toBe(true);
    });

    await senderContext.close();
    await recipientContext.close();
  });
});
