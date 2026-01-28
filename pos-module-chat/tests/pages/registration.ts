import { type Locator, type Page } from '@playwright/test';
import { BasePage } from './page';
import { Form } from './components/form';

export class RegistrationForm extends Form {
  readonly page: Page;
  readonly nameToLocatorMapping: { [key: string]: { type: string, locator: string; }; };
  readonly textInputField: (text: string) => Locator;
  readonly validationMessage: (text: string) => Promise<string>;

  constructor(page: Page) {
    super(page);
    this.page = page;
    this.nameToLocatorMapping = {
      email: { type: 'input', locator: '#pos-user-email' },
      firstName: { type: 'input', locator: '#pos-user-first-name' },
      lastName: { type: 'input', locator: '#pos-user-last-name' },
      password: { type: 'input', locator: '#pos-user-password' }
    };
    this.textInputField = (text: string) => this.page.getByLabel(text);
    this.validationMessage = (text: string) => this.textInputField(text).evaluate((input) => (input as HTMLInputElement).validationMessage);
  }

  async fillUserData(userData: {
    email?: string;
    firstName?: string;
    lastName?: string;
    password?: string;
  }) {
    for (const [key, value] of Object.entries(userData)) {
      if (this.nameToLocatorMapping[key]) {
        const locator = this.page.locator(this.nameToLocatorMapping[key].locator);
        await locator.click();
        await locator.fill('');
        await locator.fill(value);
      }
    }
  }

  async getValidationMessageForTextInputField(fieldName: string) {
    return await this.validationMessage(fieldName);
  }
}

export class RegistrationPage extends BasePage {
  readonly form: RegistrationForm;

  constructor(page: Page) {
    super(page, '/users/new');
    this.form = new RegistrationForm(page);
  }

  async goto() {
    await this.page.goto(this.path);
  }

  async registerUser(user: { firstName: string, lastName: string, email: string; }, password: string) {
    await this.form.fillUserData({ ...user, password });
    await this.form.submitButton('REGISTER').click();
  }
}

