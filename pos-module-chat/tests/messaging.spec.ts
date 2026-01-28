import { BrowserContext, expect, Page, test } from '@playwright/test';
import { PeoplePage, InboxPage } from './pages/inbox';
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
      await expect(isMessageSent).toBe(true);
    });

    await test.step(`verify chatCard was created and is visible after page refresh`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test2.email}.json`));
      const inboxPage = new InboxPage(page);

      await inboxPage.goto();

      const isChatCardVisible = await inboxPage.chatList.isChatCardVisible(receiver.fullName);
      await expect(isChatCardVisible).toBe(true);
    });

    await test.step(`${receiver.fullName} received the message`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test4.email}.json`));
      const peoplePage = new PeoplePage(page);
      const inboxPage = new InboxPage(page);

      await peoplePage.goto();

      const isChatOpened = await inboxPage.isChatOpened(sender.fullName);
      await expect(isChatOpened).toBe(true);

      const isChatCardVisible = await inboxPage.chatList.isChatCardVisible(sender.fullName);
      await expect(isChatCardVisible).toBe(true);

      const isMessageVisible = await inboxPage.message.isMessageReceived(senderMessage);
      await expect(isMessageVisible).toBe(true);
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
      await expect(areMessagesSent).toBe(true);

      const isOrderCorrect = await inboxPage.chat.verifyMessageOrder(senderMessages);
      await expect(isOrderCorrect).toBe(true);
    });

    await test.step(`user ${receiver.fullName} received messages in correct order`, async () => {
      ({ context, page } = await switchContext(context, browser, `tests/.auth/${users.test5.email}.json`));
      const peoplePage = new PeoplePage(page);
      const inboxPage = new InboxPage(page);

      await peoplePage.goto();

      const isChatOpened = await inboxPage.isChatOpened(sender.fullName);
      await expect(isChatOpened).toBe(true);  

      const lastMessage = await inboxPage.chatList.getCardLastMessage(sender.fullName);
      await expect(lastMessage).toHaveText(lastMessageText);
    
      const isOrderCorrect = await inboxPage.chat.verifyMessageOrder(senderMessages);
      await expect(isOrderCorrect).toBe(true);
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
      await expect(countCards).toBe(0);
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
});