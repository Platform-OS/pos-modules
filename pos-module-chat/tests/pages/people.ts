import { type Locator, type Page } from '@playwright/test';
import { BasePage } from './page';

export class PeoplePage extends BasePage {

  constructor(page: Page) {
    super(page, '/');
  };
}
