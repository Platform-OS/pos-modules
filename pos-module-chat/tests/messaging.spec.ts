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
    // the time of the message as shown live, right after it was sent
    let liveDate: string | null = null;

    await test.step(`${sender.fullName} sends message to ${receiver.fullName} via profile`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test2.email}.json`));
      const peoplePage = new PeoplePage(page);
      const inboxPage = new InboxPage(page);

      await peoplePage.goto();

      const isMessageSent = await inboxPage.sendMessage(receiver.fullName, senderMessage);
      expect(isMessageSent).toBe(true);

      // the first message always shows its time, formatted by common-styling, e.g. "Oct 29, 2026, 3:14 PM"
      const date = inboxPage.message.getMessageDate(senderMessage);
      await expect(date).toHaveText(/\d{4}, \d{1,2}:\d{2}/);
      liveDate = await date.textContent();
    });

    await test.step(`verify chatCard was created and is visible after page refresh`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test2.email}.json`));
      const inboxPage = new InboxPage(page);

      await inboxPage.goto();

      const isChatCardVisible = await inboxPage.chatList.isChatCardVisible(receiver.fullName);
      expect(isChatCardVisible).toBe(true);

      // when the last message was sent, relative to now and formatted by common-styling
      const lastMessageDate = inboxPage.chatList.getCardLastMessageDate(receiver.fullName);
      await expect(lastMessageDate).toHaveText(/^(now|\d+ minutes? ago)$/);
      await expect(lastMessageDate).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);
      // the exact date on hover
      await expect(lastMessageDate).toHaveAttribute('title', /\d{4}/);
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

      // rendered by the server this time, but shown the same way as live
      await expect(inboxPage.message.getMessageDate(senderMessage)).toHaveText(liveDate ?? '');
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

      // opening the chat didn't even create the conversation, so the inbox shows its empty
      // state - which renders a placeholder card of its own, so the cards aren't counted
      const isChatCardVisible = await inboxPage.chatList.isChatCardVisible(sender.fullName);
      expect(isChatCardVisible).toBe(false);
      // (attached, not visible - which of the desktop/mobile empty states shows depends on the viewport)
      await expect(page.locator('.pos-chat-conversations-blank-desktop')).toBeAttached();
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

  test(`opening a chat changes nothing and a conversation can't be started without the CSRF token`, async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    // no test sends anything to test7, so its conversations only change if this test changes them
    const user = users.test7;
    const other = users.test1;

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${user.email}.json`));

    // the chat with them renders the conversation's id when there is one, empty conversations too
    const conversationId = async () => (await (await page.request.get(`/inbox?to_uuid=${toUuid}`)).text()).match(/data-conversation-id="([^"]*)"/)?.[1];

    await new PeoplePage(page).goto();
    const chatUrl = await page.getByRole('link', { name: other.fullName, exact: true }).getAttribute('href');
    const toUuid = new URL(chatUrl ?? '', page.url()).searchParams.get('to_uuid');
    expect(toUuid, 'the people list links to the chat by to_uuid').toBeTruthy();
    expect(await conversationId(), 'there is no conversation with them yet').toBe('');

    await test.step('a plain GET of the chat link, as a link or redirect from another site or a prefetch makes it, creates nothing', async () => {
      const response = await page.request.get(`/inbox?to_uuid=${toUuid}`);
      expect(response.ok()).toBe(true);
      expect(await conversationId()).toBe('');
    });

    await test.step('starting the conversation without the CSRF token is refused', async () => {
      const response = await page.request.post('/api/chat/conversations', { form: { to_uuid: toUuid! } });
      expect(response.status()).toBe(403);
      expect(await conversationId()).toBe('');
    });

    await context?.close();
  });

  test(`the conversations list shows every conversation once, unread first, newest first`, async ({ browser }) => {
    test.setTimeout(120_000);
    let context: BrowserContext | null = null;
    let page: Page;

    // test6 has the 40 seeded conversations, and other tests send them messages meanwhile - so
    // only what holds while the list changes is checked: conversations that change move to the
    // top, above the page being loaded, and aren't shown again
    const user = users.test6;

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${user.email}.json`));
    const inboxPage = new InboxPage(page);
    await inboxPage.goto();
    const profileId = await page.evaluate(() => String((window as any).pos.profile.id));

    await test.step('the API pages through them by cursor, unread ones first, each group newest first', async () => {
      const listed: { id: string, unread: boolean, at: string }[] = [];
      let cursor = '';
      for (let i = 0; i < 20; i++) {
        const json = await (await page.request.get(`/api/chat/conversations?per_page=7${cursor}`)).json();
        listed.push(...json.results.map((c: any) => ({ id: c.id, unread: !c.participant_read_ids.includes(profileId), at: c.last_message_at })));
        if (!json.has_next_page) break;
        cursor = `&read=${json.next_read}&before=${encodeURIComponent(json.next_before)}`;
      }

      expect(listed.length).toBeGreaterThanOrEqual(40);
      expect(new Set(listed.map(c => c.id)).size, 'no conversation is listed twice').toBe(listed.length);
      const firstRead = listed.findIndex(c => !c.unread);
      expect(listed.slice(firstRead).every(c => !c.unread), 'unread ones come first').toBe(true);
      for (const group of [listed.slice(0, firstRead), listed.slice(firstRead)]) {
        const times = group.map(c => Date.parse(c.at));
        expect(times, 'newest first').toEqual([...times].sort((a, b) => b - a));
      }
    });

    await test.step('the inbox shows 30, scrolling down and the "Load more" button load the rest - each once', async () => {
      const cards = page.locator('#pos-chat-conversations .pos-chat-conversationCard');
      const loadMore = page.locator('.pos-chat-conversations-more button');
      await expect(cards).toHaveCount(30);
      await expect(loadMore).toBeVisible();

      // near the bottom is enough, not exactly at it
      await page.locator('#pos-chat-conversations').evaluate(list => list.scrollTop = list.scrollHeight - list.clientHeight - 20);
      await expect.poll(() => cards.count()).toBeGreaterThan(30);

      while (await loadMore.isVisible()) {
        const shown = await cards.count();
        await loadMore.click();
        await expect.poll(() => cards.count()).toBeGreaterThan(shown);
      }

      const ids = await page.locator('#pos-chat-conversations a[href*="conversation_id="]').evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href).searchParams.get('conversation_id')));
      expect(ids.length).toBeGreaterThanOrEqual(40);
      expect(new Set(ids).size, 'no conversation is shown twice').toBe(ids.length);

      const unread = await cards.evaluateAll(cards => cards.map(card => card.classList.contains('pos-chat-conversationCard-unread')));
      expect(unread.slice(unread.indexOf(false)).every(u => !u), 'unread ones come first').toBe(true);
    });

    await context?.close();
  });

  test(`starting the same conversation twice at once creates it only once`, async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    // no other test starts a conversation between these two, so on a freshly seeded instance
    // both requests below really race to create it
    const user = users.test3;
    const otherName = 'Dummy40 User';

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${user.email}.json`));
    const inboxPage = new InboxPage(page);
    await inboxPage.goto();

    await inboxPage.search.searchFor('dummy40');
    await inboxPage.search.isResultVisible(otherName);
    const chatUrl = await inboxPage.search.getResultByFullName(otherName).locator('xpath=ancestor::a').getAttribute('href');
    const toUuid = new URL(chatUrl ?? '', page.url()).searchParams.get('to_uuid');
    expect(toUuid, 'the search result links to the chat by to_uuid').toBeTruthy();

    // what two tabs (or a double click) sending the first message at the same time do
    const ids = await page.evaluate(async (toUuid) => {
      const start = () => fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': (window as any).pos.csrfToken },
        body: JSON.stringify({ to_uuid: toUuid })
      }).then(response => response.json()).then(json => json.id);

      const ids = await Promise.all([start(), start(), start()]);
      // and later on - a duplicate left behind would usually be found instead
      ids.push(await start());
      return ids;
    }, toUuid);

    expect(ids[0]).toBeTruthy();
    expect(new Set(ids).size, `all requests get the same conversation, got ${ids}`).toBe(1);

    await context?.close();
  });

  test(`loading older messages doesn't repeat the ones already shown after new ones arrived`, async ({ browser }) => {
    test.setTimeout(120_000);
    let context: BrowserContext | null = null;
    let page: Page;

    // no other test talks to Dummy39; texts are unique per run, as the instance may not be reseeded
    const user = users.test5;
    const otherName = 'Dummy39 User';
    const run = Date.now();
    const history = Array.from({ length: 33 }, (_, i) => `history ${run} ${i}`);
    const live = Array.from({ length: 3 }, (_, i) => `live ${run} ${i}`);

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${user.email}.json`));
    const inboxPage = new InboxPage(page);
    const sendQuickly = async (text: string) => {
      await inboxPage.chat.messageInputField.fill(text);
      await inboxPage.chat.buttonWithText('Send').click();
      await inboxPage.chat.messageBox.getMessageByText(text, 'sent').waitFor();
    };
    const countOnPage = (text: string) => page.locator('#chat-messagesList .pos-chat-message-text').getByText(text, { exact: true }).count();

    await test.step(`${history.length} messages are sent to ${otherName}`, async () => {
      await inboxPage.goto();
      await inboxPage.isChatOpenedFromSearch('dummy39', otherName);
      await inboxPage.chat.messageInputFieldEnabled.waitFor();
      for (const text of history) {
        await sendQuickly(text);
      }
    });

    await test.step(`after a reload, ${live.length} more are sent - the page shows the newest 30 and those`, async () => {
      await page.reload();
      await inboxPage.chat.messageInputFieldEnabled.waitFor();
      expect(await countOnPage(history[history.length - 30])).toBe(1);
      expect(await countOnPage(history[history.length - 31])).toBe(0);
      for (const text of live) {
        await sendQuickly(text);
      }
    });

    await test.step(`scrolling to the top loads the older ones, each shown once`, async () => {
      const response = page.waitForResponse(response => response.url().includes('/api/chat/messages.json'));
      await page.locator('#chat-messagesList-container').evaluate(container => container.scrollTop = 0);
      await response;

      await expect(page.locator('#chat-messagesList .pos-chat-message-text').getByText(history[0], { exact: true })).toHaveCount(1);
      for (const text of [...history, ...live]) {
        expect(await countOnPage(text), text).toBe(1);
      }
    });

    await context?.close();
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

  test(`user can start a conversation by searching for a person in the inbox`, async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    // Dedicated pair: avoid test7 (must stay empty for the "conversation card not created" test).
    const sender = users.test3;
    const receiver = users.test5;
    const searchQuery = receiver.firstName.slice(0, 5).toLowerCase();
    // Unique per run so repeated local runs don't pile up identical messages.
    const senderMessage = `search conversation probe ${Date.now()}`;

    await test.step(`${sender.fullName} searches for "${searchQuery}" and opens a chat with ${receiver.fullName}`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${sender.email}.json`));
      const inboxPage = new InboxPage(page);

      await inboxPage.goto();

      const isChatOpened = await inboxPage.isChatOpenedFromSearch(searchQuery, receiver.fullName);
      expect(isChatOpened).toBe(true);

      const isMessageSent = await inboxPage.chat.sendMessage(senderMessage);
      expect(isMessageSent).toBe(true);
    });

    await test.step(`verify chatCard with ${receiver.fullName} is visible after page refresh`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${sender.email}.json`));
      const inboxPage = new InboxPage(page);

      await inboxPage.goto();

      const isChatCardVisible = await inboxPage.chatList.isChatCardVisible(receiver.fullName);
      expect(isChatCardVisible).toBe(true);
    });

    await context?.close();
  })

  test(`people are found by their name, not by their email`, async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    const user = users.test6;
    const searched = users.test1;

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${user.email}.json`));
    const inboxPage = new InboxPage(page);

    await inboxPage.goto();

    // no results show nothing on the page, so the search's own response is waited for
    const search = async (query: string) => {
      const response = page.waitForResponse(response => response.url().includes('/search.frame') && new URL(response.url()).searchParams.get('q') === query);
      await inboxPage.search.searchFor(query);
      return await (await response).text();
    };

    await test.step(`a part of ${searched.fullName}'s email finds nobody`, async () => {
      // "test1@example" - also tells whether that address is registered, if it matched
      const html = await search(searched.email.split('.')[0]);
      expect(html).not.toContain(searched.fullName);
      await expect(inboxPage.search.getResultByFullName(searched.fullName)).toHaveCount(0);
    });

    await test.step(`a part of their name finds them`, async () => {
      await search(searched.lastName.slice(0, 4).toLowerCase());
      expect(await inboxPage.search.isResultVisible(searched.fullName)).toBe(true);
    });

    await context?.close();
  });

  test(`a search typed before the chat started is run once it starts`, async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    const user = users.test6;
    const searched = users.test1;
    const query = searched.lastName.slice(0, 4).toLowerCase();

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${user.email}.json`));
    const inboxPage = new InboxPage(page);

    // pos-chat.js is held back until the query is typed, so its input listener isn't there yet
    let release = () => {};
    const released = new Promise<void>(resolve => release = resolve);
    await page.route(/\/pos-chat\.js(\?|$)/, async route => {
      await released;
      await route.continue();
    });

    // the load event would wait for the held back script
    await page.goto(inboxPage.path, { waitUntil: 'domcontentloaded' });
    await inboxPage.search.searchFor(query);
    expect(await page.evaluate(() => !!(window as any).pos?.modules?.active?.chat)).toBe(false);

    release();

    expect(await inboxPage.search.isResultVisible(searched.fullName)).toBe(true);

    await context?.close();
  });

  test(`clearing the search brings back the conversations list`, async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    // test6 has seeded conversations, so the conversations list is never empty.
    const user = users.test6;
    const searchedPerson = users.test1;
    const searchQuery = searchedPerson.lastName.slice(0, 4).toLowerCase();
    const conversationsList = '#pos-chat-conversations';

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${user.email}.json`));
    const inboxPage = new InboxPage(page);

    await inboxPage.goto();

    await test.step(`search results for "${searchQuery}" replace the conversations list`, async () => {
      await expect(page.locator(conversationsList)).toBeVisible();

      await inboxPage.search.searchFor(searchQuery);

      const isResultVisible = await inboxPage.search.isResultVisible(searchedPerson.fullName);
      expect(isResultVisible).toBe(true);
      await expect(page.locator(conversationsList)).toBeHidden();
    });

    await test.step(`clicking the clear button brings back the conversations list`, async () => {
      await inboxPage.search.clear();

      await expect(inboxPage.search.input).toHaveValue('');
      await expect(inboxPage.search.results).toBeEmpty();
      await expect(inboxPage.search.results).toBeHidden();
      await expect(page.locator(conversationsList)).toBeVisible();
      expect(await inboxPage.chatList.countCards()).toBeGreaterThan(0);
    });

    await context?.close();
  })

  test('messages that are not text, too long or with malformed attachments are not stored', async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    // a pair no other test uses, so nothing here shows up in their conversations
    const sender = users.test2;
    const receiver = users.test3;

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${sender.email}.json`));
    const peoplePage = new PeoplePage(page);
    const inboxPage = new InboxPage(page);

    await peoplePage.goto();
    await peoplePage.openChat(receiver.fullName);
    // the messages below go straight over the channel, which a new conversation only has once started
    const conversationId = await inboxPage.startConversation();

    const marker = `message validation ${Date.now()}`;

    await test.step('the message input is limited to the length the server accepts', async () => {
      await expect(inboxPage.chat.messageInputField).toHaveAttribute('maxlength', '10000');
    });

    await test.step('malformed messages sent straight over the channel are dropped', async () => {
      // bypasses the input, the same way a modified client could
      await page.evaluate((marker) => {
        const channel = (window as any).pos.modules.active.chat.channel;
        channel.send({ message: `${marker} too long ` + 'x'.repeat(10000) });
        channel.send({ message: { text: `${marker} not text` } });
        channel.send({ message: `${marker} media not a list`, media: 'not-a-list' });
      }, marker);

      // sent after the malformed ones, so they've been handled by the time it shows up
      const validMessage = `${marker} valid`;
      expect(await inboxPage.chat.sendMessage(validMessage)).toBe(true);

      const stored = await page.evaluate(async (conversationId) => {
        const response = await fetch(`/api/chat/messages.json?conversation_id=${conversationId}&page=1&per_page=20`);
        return (await response.json()).results.map((message: any) => String(message.message));
      }, conversationId);

      const fromThisTest = stored.filter((text: string) => text.includes(marker));
      expect(fromThisTest).toEqual([validMessage]);
    });

    await context?.close();
  });
});
