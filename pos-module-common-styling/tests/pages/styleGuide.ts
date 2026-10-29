import { type Locator, type Page } from '@playwright/test';

export class StyleGuidePage {
  path: string;
  readonly page: Page;
  readonly articleById: (text: string) => Locator;
  readonly checkboxWithText: (text: string) => Locator;
  readonly form: Locator;
  readonly textInputField: (text: string) => Locator;
  readonly linkWithText: (text: string) => Locator;
  readonly radioButtonWithText: (text: string) => Locator;
  readonly toastNotification: (text: string) => Locator;
  readonly timeExample: (label: string, format: 'relative' | 'full') => Locator;

  constructor(page: Page) {
    this.page = page;
    this.path = '/style-guide';
    this.articleById = (text: string) => page.locator(`#${text}`)
    this.checkboxWithText = (text: string) => page.getByRole('checkbox', { name: text, exact: true });
    this.form = page.locator('form');
    this.textInputField = (text: string = '') => this.form.getByRole('textbox', { name: text });
    this.linkWithText = (text: string) => page.getByRole('link', { name: text, exact: true });
    this.radioButtonWithText = (text: string) => page.locator(`input[type="radio"]`).locator('..').getByText(text, { exact: true });
    this.toastNotification = (text: string) => page.locator(`.pos-toast-container.${text}`)
    // a row of the examples table is the one whose first cell is the label
    this.timeExample = (label: string, format: 'relative' | 'full') => page.locator('#time .pos-table-content ul')
      .filter({ has: page.locator('li:first-child', { hasText: new RegExp(`^${label}$`) }) })
      .locator(`time${format === 'relative' ? '[data-format="relative"]' : ':not([data-format])'}`);
  };

  async goto() {
    await this.page.goto(this.path);
  };
}