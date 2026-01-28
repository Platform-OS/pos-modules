import { type Locator, type Page } from '@playwright/test';

export class LogInPage {
  readonly page: Page;
  readonly url: string;
  readonly emailInputField: Locator;
  readonly loginButton: Locator;
  readonly passwordInputField: Locator;
  readonly resetButton: Locator;
  readonly elementWithText: (text: string) => Locator;

  constructor(page: Page) {
    this.page = page;
    this.url = '/sessions/new';
    this.elementWithText = (text) => page.getByText(text);
    this.emailInputField = page.getByRole('textbox', { name: 'Email' });
    this.loginButton = page.getByRole('button', { name: 'Log in' });
    this.passwordInputField = page.getByRole('textbox', { name: 'Password' });
    this.resetButton = page.getByRole('link', { name: 'Reset' });
  }

  async goto() {
    await this.page.goto(this.url);
  }

  async logIn(email: string, password: string) {
    await this.emailInputField.fill(email);
    await this.passwordInputField.fill(password);
    await this.loginButton.click();
  }
}
