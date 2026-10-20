import { type Page } from '@playwright/test';

export class UppyUploader {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  section() {
    const sectionLocator = this.page.locator('#chat-uploader');
    return {
      completedFile: (fileName: string) => sectionLocator.locator('.uppy-Dashboard-Item.is-complete', { hasText: fileName })
    };
  }

  // the chat keeps the dashboard hidden, files are added through the upload button's file input
  // and the dashboard items are only checked (still rendered while hidden) to know when the upload finished
  async waitForUploadComplete(fileName: string) {
    await this.section().completedFile(fileName).waitFor({ state: 'attached', timeout: 15000 });
  }
}
