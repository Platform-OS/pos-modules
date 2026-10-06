import { type Locator, type Page } from '@playwright/test';
import path from 'path';

export class UppyUploader {
  readonly page: Page;
  readonly headingWithText: (text: string) => Locator;
  readonly uppyUploaderError: (text: string) => Locator;

  constructor(page: Page) {
    this.page = page;
    this.headingWithText = (text: string) => page.getByRole('heading', { name: text });
    this.uppyUploaderError = (text: string) => page.locator('div.uppy-Informer-animated p[role="alert"]').getByText(text);
  }

  section() {
    const sectionLocator = this.page.locator('#chat-uploader');
    return {
      container: () => sectionLocator,
      // uppy mounts its dashboard on the .pos-upload container itself, not on the (empty) .pos-upload-dashboard div
      dashboard: () => sectionLocator.locator('.uppy-Dashboard'),
      buttonWithText: (text: string) => sectionLocator.getByRole('button', { name: text, exact: true }),
      inputFile: () => sectionLocator.locator('input[type="file"]').first(),
      completedFile: (fileName: string) => sectionLocator.locator('.uppy-Dashboard-Item.is-complete', { hasText: fileName })
    };
  }

  async isVisible() {
    return await this.section().dashboard().isVisible();
  }

  async uploadFile(fileName: string) {
    const section = this.section();

    await section.inputFile().setInputFiles(path.join(__dirname, '..', '..', 'data', 'files', fileName));

    if (await section.buttonWithText('Save').isVisible()) {
      await section.buttonWithText('Save').click();
    }

    // the uploader auto-proceeds; wait for this specific file to finish uploading - the dashboard's
    // 'Upload complete' title isn't reliable here (it depends on uppy's totalProgress, which doesn't
    // reach 100 in the chat uploader), and it would also match the state left over from a previous file
    await section.completedFile(fileName).waitFor({ state: 'visible', timeout: 15000 });
  }
}
