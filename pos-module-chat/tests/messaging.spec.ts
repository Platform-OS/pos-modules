import { BrowserContext, expect, Page, test } from '@playwright/test';
import { PeoplePage, InboxPage } from './pages/inbox';
import { ChannelClient } from './pages/channel';
import { switchContext } from './helper';
import { messages } from './data/messages';
import { users } from './data/users';


test.describe('Testing messaging', () => {
  test('creating a conversation card after first message', async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    const sender = users.test2;
    const senderMessage = messages.test2.message1;
    const receiver = users.test4;

    await test.step(`${sender.fullName} sends message to ${receiver.fullName} via profile`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test2.email}.json`));
      const peoplePage = new PeoplePage(page);
      const inboxPage = new InboxPage(page);

      await peoplePage.goto();

      const isMessageSent = await inboxPage.sendMessage(receiver.fullName, senderMessage);
      expect(isMessageSent).toBe(true);
    });

    await test.step(`verify chatCard was created and is visible after page refresh`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test2.email}.json`));
      const inboxPage = new InboxPage(page);

      await inboxPage.goto();

      const isChatCardVisible = await inboxPage.chatList.isChatCardVisible(receiver.fullName);
      expect(isChatCardVisible).toBe(true);
    });

    await test.step(`${receiver.fullName} received the message`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test4.email}.json`));
      const peoplePage = new PeoplePage(page);
      const inboxPage = new InboxPage(page);

      await peoplePage.goto();

      const isChatOpened = await inboxPage.isChatOpened(sender.fullName);
      expect(isChatOpened).toBe(true);

      const isChatCardVisible = await inboxPage.chatList.isChatCardVisible(sender.fullName);
      expect(isChatCardVisible).toBe(true);

      const isMessageVisible = await inboxPage.message.isMessageReceived(senderMessage);
      expect(isMessageVisible).toBe(true);
    });
  });

  test('sending multiple messages and order verification', async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    const sender = users.test4;
    const receiver = users.test5;

    const senderMessages = [messages.test4.message1, messages.test4.message2, messages.test4.message3]
    const lastMessageText = senderMessages[2];

    await test.step(`${sender.fullName} sends multiple messages to ${receiver.fullName}`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test4.email}.json`));
      const peoplePage = new PeoplePage(page);
      const inboxPage = new InboxPage(page);

      await peoplePage.goto();

      const areMessagesSent = await inboxPage.sendMessages(receiver.fullName, senderMessages);
      expect(areMessagesSent).toBe(true);

      const isOrderCorrect = await inboxPage.chat.verifyMessageOrder(senderMessages);
      expect(isOrderCorrect).toBe(true);
    });

    await test.step(`user ${receiver.fullName} received messages in correct order`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test5.email}.json`));
      const peoplePage = new PeoplePage(page);
      const inboxPage = new InboxPage(page);

      await peoplePage.goto();

      const isChatOpened = await inboxPage.isChatOpened(sender.fullName);
      expect(isChatOpened).toBe(true);

      const lastMessage = await inboxPage.chatList.getCardLastMessage(sender.fullName);
      expect(lastMessage).toHaveText(lastMessageText);

      const isOrderCorrect = await inboxPage.chat.verifyMessageOrder(senderMessages);
      expect(isOrderCorrect).toBe(true);
    });
  });

  test('conversation card not created without sending a message', async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    const sender = users.test4;
    const receiver = users.test7;

    await test.step(`${sender.fullName} opens empty conversation with ${receiver.fullName}`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test4.email}.json`));
      const peoplePage = new PeoplePage(page);
      const inboxPage = new InboxPage(page);

      await peoplePage.goto();

      const isChatOpened = await inboxPage.isChatOpened(receiver.fullName);
      expect(isChatOpened).toBe(true);
    });

    await test.step(`${receiver.fullName} verifies that his inbox is empty`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test7.email}.json`));
      const inboxPage = new InboxPage(page);

      await inboxPage.goto();

      const countCards = await inboxPage.chatList.countCards();
      expect(countCards).toBe(0);
    });
  });

  test(`user can't see his own profile card on people list`, async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test7.email}.json`));

    const peoplePage = new PeoplePage(page);

    await peoplePage.goto();

    const isPeopleCardVisible = await peoplePage.isPeopleCardVisible(users.test7.email);
    expect(isPeopleCardVisible).toBe(false);
  });

  test(`user can't send message to himself`, async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test7.email}.json`));

    await page.goto(`/inbox/?to_uuid=${users.test7.uuid}`);


    await expect(page.locator('header').getByText(users.test7.fullName)).not.toBeVisible();
  });

  test(`regression: old conversation opens correct chat from people list`, async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    const receiverFullName = "Dummy10 User";

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test6.email}.json`));

    const peoplePage = new PeoplePage(page);
    const inboxPage = new InboxPage(page);

    await peoplePage.goto();

    const isChatOpened = await inboxPage.isChatOpened(receiverFullName);
    expect(isChatOpened).toBe(true);
  })

  test(`user can't subscribe to another user's notifications channel (IDOR)`, async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    const attacker = users.test1;
    const victim = users.test3;
    // Unique per run so repeated local runs don't pile up identical messages.
    const probeMessage = `notification channel authorization probe ${Date.now()}`;

    let attackerRoomId = '';
    let victimRoomId = '';

    await test.step(`${attacker.fullName} starts a conversation with ${victim.fullName} and we read their notifications room`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${attacker.email}.json`));
      const peoplePage = new PeoplePage(page);
      const inboxPage = new InboxPage(page);

      await peoplePage.goto();

      const isMessageSent = await inboxPage.sendMessage(victim.fullName, probeMessage);
      expect(isMessageSent).toBe(true);

      attackerRoomId = await new ChannelClient(page).ownNotificationsRoomId();
    });

    await test.step(`read ${victim.fullName}'s notifications room`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${victim.email}.json`));

      victimRoomId = await new ChannelClient(page).ownNotificationsRoomId();
      expect(victimRoomId).not.toBe(attackerRoomId);
    });

    await test.step(`${attacker.fullName} can subscribe to their own room but not ${victim.fullName}'s`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${attacker.email}.json`));
      const channel = new ChannelClient(page);

      const ownVerdict = await channel.subscribe(attackerRoomId);
      expect(ownVerdict).toBe('confirm_subscription');

      const crossVerdict = await channel.subscribe(victimRoomId);
      expect(crossVerdict).not.toBe('confirm_subscription');
    });

    await context?.close();
  })

  test(`recipient receives a real-time notification when they are sent a message`, async ({ browser }) => {
    // Notifications are delivered by a background-job consumer, so allow for queue latency.
    test.setTimeout(120_000);
    const sender = users.test2;
    const recipient = users.test6;
    // Unique per run so repeated local runs don't pile up identical messages.
    const firstMessage = `notification delivery setup ${Date.now()}`;
    const notifiedMessage = `notification delivery probe ${Date.now()}`;

    // Two concurrent sessions: the recipient must be listening while the sender sends.
    const senderContext = await browser.newContext({ storageState: `tests/.auth/${sender.email}.json` });
    const recipientContext = await browser.newContext({ storageState: `tests/.auth/${recipient.email}.json` });
    const senderPage = await senderContext.newPage();
    const recipientPage = await recipientContext.newPage();
    const recipientChannel = new ChannelClient(recipientPage);

    await test.step(`${sender.fullName} opens a conversation with ${recipient.fullName}`, async () => {
      await new PeoplePage(senderPage).goto();
      const isMessageSent = await new InboxPage(senderPage).sendMessage(recipient.fullName, firstMessage);
      expect(isMessageSent).toBe(true);
    });

    await test.step(`${recipient.fullName} starts listening on their own notifications room`, async () => {
      const recipientRoomId = await recipientChannel.ownNotificationsRoomId();
      await recipientChannel.startListening(recipientRoomId);
    });

    await test.step(`${sender.fullName} sends another message and ${recipient.fullName} is notified`, async () => {
      await new PeoplePage(senderPage).goto();
      const isMessageSent = await new InboxPage(senderPage).sendMessage(recipient.fullName, notifiedMessage);
      expect(isMessageSent).toBe(true);

      const notification = await recipientChannel.collectNotification(60_000);
      expect(notification).not.toBeNull();
      expect(notification.sender_name).toBe(sender.fullName);
      expect(String(notification.conversation_id).length).toBeGreaterThan(0);
    });

    await senderContext.close();
    await recipientContext.close();
  })

  test(`user can't subscribe to a conversation they are not part of (conversate IDOR)`, async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    // Dedicated pair so this test's messages don't pollute the order-verification test's conversation.
    const participantA = users.test1;
    const participantB = users.test2;
    const outsider = users.test3;
    // Unique per run so repeated local runs don't pile up identical messages.
    const probeMessage = `conversate authorization probe ${Date.now()}`;

    let conversationId = '';

    await test.step(`${participantA.fullName} opens a conversation with ${participantB.fullName}`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${participantA.email}.json`));
      const inboxPage = new InboxPage(page);

      await new PeoplePage(page).goto();

      const isMessageSent = await inboxPage.sendMessage(participantB.fullName, probeMessage);
      expect(isMessageSent).toBe(true);

      conversationId = await inboxPage.currentConversationId();
      expect(conversationId.length).toBeGreaterThan(0);
    });

    await test.step(`${participantA.fullName} (a participant) can subscribe to the conversation`, async () => {
      const verdict = await new ChannelClient(page, 'conversate').subscribe(conversationId);
      expect(verdict).toBe('confirm_subscription');
    });

    await test.step(`${outsider.fullName} (not a participant) cannot subscribe to the conversation`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${outsider.email}.json`));

      const verdict = await new ChannelClient(page, 'conversate').subscribe(conversationId);
      expect(verdict).not.toBe('confirm_subscription');
    });

    await context?.close();
  })

  test(`chat renders messages in chronological order even if they arrive out of order`, async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    // Dedicated pair: avoid test4/test5 (order-verification) and test7 (must stay empty for
    // the "conversation card not created" test) so this test's setup message pollutes nothing.
    const user = users.test5;
    const peer = users.test6;

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${user.email}.json`));

    // Open a conversation so the chat client (window.pos.modules.chat) is initialised.
    await new PeoplePage(page).goto();
    const inboxPage = new InboxPage(page);
    const isMessageSent = await inboxPage.sendMessage(peer.fullName, `ordering setup ${Date.now()}`);
    expect(isMessageSent).toBe(true);

    // Deliver three messages to the client out of chronological order and read back the
    // rendered order. created_at, not arrival order, must determine the displayed order.
    const renderedOrder = await page.evaluate(() => {
      const chat = (window as any).pos.modules.active.chat;
      const base = Date.parse('2020-01-01T00:00:00Z');
      const make = (text: string, offsetSeconds: number) => ({
        message: text,
        autor_id: 'someone-else',
        sender_name: 'Peer',
        created_at: new Date(base + offsetSeconds * 1000).toISOString(),
        status: 'received',
      });

      // arrival order: third, first, second
      chat.showMessage(make('ordering-third', 3));
      chat.showMessage(make('ordering-first', 1));
      chat.showMessage(make('ordering-second', 2));

      return Array.from(document.querySelectorAll('#chat-messagesList > li .pos-chat-message-content'))
        .map((el) => (el.textContent || '').trim())
        .filter((t) => t.startsWith('ordering-'));
    });

    expect(renderedOrder).toEqual(['ordering-first', 'ordering-second', 'ordering-third']);

    await context?.close();
  })
});
