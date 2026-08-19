import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './page';

export class TestMailBox extends BasePage {
  readonly mailEntry: (text: string) => Locator;
  readonly verificationLink: Locator;

  constructor(page: Page) {
    super(page, '/_tests/sent_mails');
    this.mailEntry = (text) => this.page.locator('ul').filter({ hasText: text });
    // Matched on the href rather than the button copy, which is a translation
    // and may be reworded.
    this.verificationLink = this.page.locator('a[href*="/users/verify?"]').first();
  };

  /**
   * Waits for a mail addressed to `email` to appear and opens the newest one,
   * optionally narrowed to one subject. Mail shows up in the list a moment after
   * the request that triggered it, so the list is polled rather than read once.
   */
  async openNewestMailTo(email: string, subject?: string) {
    await this.goto();

    let rows = this.page.locator('.table-content ul').filter({ hasText: email });
    if (subject) {
      rows = rows.filter({ hasText: subject });
    }
    const newest = rows.first();

    await expect(async () => {
      await this.page.reload();
      await expect(newest).toBeVisible();
    }).toPass({
      intervals: [1_000, 2_000, 5_000],
      timeout: 30_000
    });

    // Open the row that was matched, not the first Show link on the page: this
    // mailbox holds every notification the instance sent, so the newest mail
    // overall usually belongs to whichever spec is running alongside this one.
    await newest.getByRole('link', { name: 'Show' }).click();
  };

  /**
   * Completes email verification for `email` by following the link from its
   * verification mail, leaving the browser wherever that link lands.
   */
  async confirmEmailAddress(email: string) {
    await this.openNewestMailTo(email, 'Confirm your email address');

    await expect(this.verificationLink, `no verification link was mailed to ${email}`).toBeVisible();

    const href = await this.verificationLink.getAttribute('href');
    expect(href, `verification link mailed to ${email} was for a different address`).toContain(encodeURIComponent(email));

    await this.verificationLink.click();
  };
}
