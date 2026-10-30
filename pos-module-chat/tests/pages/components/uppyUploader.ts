import { type Page } from '@playwright/test';

export class UppyUploader {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  section() {
    const listLocator = this.page.locator('#chat-uploaderList');
    return {
      completedFile: (fileName: string) => listLocator.locator('.pos-chat-uploader-list-item-uploaded', { hasText: fileName })
    };
  }

  // the chat renders the uploader without uppy's dashboard, files are added through the upload button's
  // file input and the chat's own files list shows when the upload finished
  async waitForUploadComplete(fileName: string) {
    await this.section().completedFile(fileName).waitFor({ timeout: 15000 });
  }
}
