import { BrowserContext, expect, Page, test } from '@playwright/test';
import { PeoplePage, InboxPage } from './pages/inbox';
import { switchContext } from './helper';
import { users } from './data/users';

const imageFile = 'cat1.jpg';
const textFile = 'test_textfile.txt';

test.describe('Testing uploads', () => {
  test('user can send an image that stays visible after page reload', async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    const sender = users.test1;
    const receiver = users.test4;

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${sender.email}.json`));
    const peoplePage = new PeoplePage(page);
    const inboxPage = new InboxPage(page);

    await test.step(`${sender.fullName} uploads and sends an image to ${receiver.fullName}`, async () => {
      await peoplePage.goto();
      await peoplePage.openChat(receiver.fullName);

      await inboxPage.chat.attachFiles([imageFile]);
      await inboxPage.chat.sendAttachments();

      const isImageLoaded = await inboxPage.message.isImageLoaded(inboxPage.message.getLastSentImage());
      expect(isImageLoaded).toBe(true);
    });

    await test.step(`image is still visible after page reload`, async () => {
      await page.reload();
      await inboxPage.chat.messageInputFieldEnabled.waitFor();

      const isImageLoaded = await inboxPage.message.isImageLoaded(inboxPage.message.getLastSentImage());
      expect(isImageLoaded).toBe(true);
    });

    await context?.close();
  });

  test('user can send a file that is shown as a download link', async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    const sender = users.test2;
    const receiver = users.test5;

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${sender.email}.json`));
    const peoplePage = new PeoplePage(page);
    const inboxPage = new InboxPage(page);

    await test.step(`${sender.fullName} uploads and sends a text file to ${receiver.fullName}`, async () => {
      await peoplePage.goto();
      await peoplePage.openChat(receiver.fullName);

      await inboxPage.chat.attachFiles([textFile]);
      await inboxPage.chat.sendAttachments();
    });

    await test.step(`file is visible in the chat as a download link`, async () => {
      const fileLink = inboxPage.message.getLastSentFileLink(textFile);

      await expect(fileLink).toBeVisible();
      await expect(fileLink).toHaveAttribute('href', /^https?:\/\/.+/);
    });

    await context?.close();
  });

  test('user can send an image and a file together', async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    const sender = users.test3;
    const receiver = users.test6;

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${sender.email}.json`));
    const peoplePage = new PeoplePage(page);
    const inboxPage = new InboxPage(page);

    await test.step(`${sender.fullName} uploads an image and a text file and sends them to ${receiver.fullName}`, async () => {
      await peoplePage.goto();
      await peoplePage.openChat(receiver.fullName);

      await inboxPage.chat.attachFiles([imageFile, textFile]);
      await inboxPage.chat.sendAttachments();
    });

    await test.step(`both the image and the file are visible in the chat`, async () => {
      const isImageLoaded = await inboxPage.message.isImageLoaded(inboxPage.message.getLastSentImage());
      expect(isImageLoaded).toBe(true);

      const fileLink = inboxPage.message.getLastSentFileLink(textFile);
      await expect(fileLink).toBeVisible();
      await expect(fileLink).toHaveAttribute('href', /^https?:\/\/.+/);
    });

    await context?.close();
  });

  test('upload records are only created for files uploaded through the chat', async ({ browser }) => {
    let context: BrowserContext | null = null;
    let page: Page;

    const sender = users.test1;
    const receiver = users.test4;

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${sender.email}.json`));
    const peoplePage = new PeoplePage(page);
    const inboxPage = new InboxPage(page);

    await peoplePage.goto();
    await peoplePage.openChat(receiver.fullName);
    const conversationId = await inboxPage.currentConversationId();

    // posts to the upload record endpoint the same way pos-chat.js does
    const createUpload = (upload: string, metadata: object) => page.evaluate(async ({ conversationId, upload, metadata }) => {
      const response = await fetch('/api/chat/uploads', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': (window as any).pos.csrfToken },
        body: JSON.stringify({ conversation_id: conversationId, upload: upload, metadata: metadata })
      });
      return { status: response.status, body: await response.json() };
    }, { conversationId, upload, metadata });

    const metadata = { type: 'image/png', name: 'cat.png', size: 1024 };

    await test.step('a url that does not come from the chat presign is rejected', async () => {
      const result = await createUpload('https://example.com/cat.png', metadata);
      expect(result.status).toBe(422);
      expect(result.body.errors.upload).toBeTruthy();
    });

    await test.step('a file larger than the limit is rejected', async () => {
      const result = await createUpload('https://example.com/cat.png', { ...metadata, size: 50 * 1024 * 1024 });
      expect(result.status).toBe(422);
      expect(result.body.errors.size).toBeTruthy();
    });

    await context?.close();
  });
});
