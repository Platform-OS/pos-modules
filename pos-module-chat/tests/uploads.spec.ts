import { BrowserContext, expect, Page, test } from '@playwright/test';
import { PeoplePage, InboxPage } from './pages/inbox';
import { switchContext } from './helper';
import { users } from './data/users';
import fs from 'fs';
import path from 'path';

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
    const conversationId = await inboxPage.startConversation();

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

  test('images with the same name sent from one page view keep their own content', async ({ browser }) => {
    test.setTimeout(120_000);
    let context: BrowserContext | null = null;
    let page: Page;

    // no other test talks to Dummy37. Two different images named the same, like two photos
    // named image.jpg - a key shared by the page's uploads would have the second replace the first
    const user = users.test1;
    const otherName = 'Dummy37 User';

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${user.email}.json`));
    const inboxPage = new InboxPage(page);
    await inboxPage.goto();
    await inboxPage.isChatOpenedFromSearch('dummy37', otherName);
    await inboxPage.chat.messageInputFieldEnabled.waitFor();

    // two images told apart by their size
    const first = await page.screenshot({ clip: { x: 0, y: 0, width: 40, height: 30 } });
    const second = await page.screenshot({ clip: { x: 0, y: 0, width: 60, height: 20 } });

    await test.step(`${user.fullName} sends them one after another, without reloading`, async () => {
      for (const image of [first, second]) {
        await inboxPage.chat.attachFiles([{ name: 'image.png', mimeType: 'image/png', buffer: image }]);
        await inboxPage.chat.sendAttachments();
      }
    });

    await test.step('opened again, each message shows its own image', async () => {
      await page.reload();
      const images = inboxPage.message.getSentMessages().locator('.pos-chat-message-image img');
      await expect(images.last()).toBeVisible();
      const count = await images.count();
      const beforeLast = images.nth(count - 2);
      const last = images.nth(count - 1);
      await expect(beforeLast).toHaveJSProperty('complete', true);
      await expect(last).toHaveJSProperty('complete', true);
      expect(await beforeLast.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]), 'the first image').toEqual([40, 30]);
      expect(await last.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]), 'the second image').toEqual([60, 20]);
    });

    await context?.close();
  });

  test('a conversation with many images opens scrolled to the newest message', async ({ browser }) => {
    test.setTimeout(240_000);
    let context: BrowserContext | null = null;
    let page: Page;

    // no other test talks to Dummy38; file names are unique per run, as files with the same
    // name sent from one page view share their S3 key
    const user = users.test4;
    const otherName = 'Dummy38 User';
    const run = Date.now();
    const image = fs.readFileSync(path.join(__dirname, 'data', 'files', imageFile));
    let conversationId = '';

    ({ context, page } = await switchContext(context, browser, `tests/.auth/${user.email}.json`));
    const inboxPage = new InboxPage(page);

    await test.step(`${user.fullName} sends 4 messages with 3 images each to ${otherName}`, async () => {
      await inboxPage.goto();
      await inboxPage.isChatOpenedFromSearch('dummy38', otherName);
      for (let message = 0; message < 4; message++) {
        await inboxPage.chat.attachFiles([0, 1, 2].map(i => ({ name: `scroll-${run}-${message}-${i}.jpg`, mimeType: 'image/jpeg', buffer: image })));
        await inboxPage.chat.sendAttachments();
      }
      conversationId = await inboxPage.currentConversationId();
      expect(conversationId).not.toBe('');
    });

    await test.step('opened again, with the images coming in one after another, it ends at the newest message', async () => {
      await context?.close();
      ({ context, page } = await switchContext(null, browser, `tests/.auth/${user.email}.json`));
      // each image is delayed a bit more than the one before, like on a slow connection - the
      // list must not end up scrolled to where it was when one of the earlier ones loaded
      let requested = 0;
      await page.route(request => request.pathname.endsWith('.jpg'), async route => {
        await new Promise(resolve => setTimeout(resolve, 200 * ++requested));
        await route.continue();
      });
      await page.goto(`/inbox?conversation_id=${conversationId}`);

      const container = page.locator('#chat-messagesList-container');
      const distanceFromBottom = () => container.evaluate(c => c.scrollHeight - c.scrollTop - c.clientHeight);
      const newest = page.locator('#chat-messagesList img').last();
      // the images are lazy, the newest one only loads once it's scrolled into view
      await expect(newest).toHaveJSProperty('complete', true, { timeout: 30_000 });
      // and the rest loaded meanwhile
      await page.waitForTimeout(200 * 12 + 1000);
      await expect.poll(distanceFromBottom, { message: 'distance from the bottom', timeout: 10_000 }).toBeLessThanOrEqual(2);
      await expect(newest).toBeInViewport();
    });

    await context?.close();
  });
});
