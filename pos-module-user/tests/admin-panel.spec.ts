import { expect, test } from '@playwright/test';
import { AdminHomePage } from './pages/admin/home';
import { LogInPage } from './pages/login';
import { SubscriptionPage } from './pages/subscription';
import { HomePage } from './pages/home';
import { users } from './data/users';
import process from 'process';

const PASSWORD = process.env.E2E_TEST_PASSWORD;
if (!PASSWORD) {
  throw new Error('E2E_TEST_PASSWORD environment variable is not set');
}

test.describe('Testing Admin Panel', () => {
  test('admin can access admin panel', async ({ browser }) => {
    const context = await browser.newContext({ storageState: `tests/.auth/${users.superadmin.email}.json` });
    const page = await context.newPage();
    const adminHomePage = new AdminHomePage(page);

    await adminHomePage.goto();
    await expect(adminHomePage.elementWithText('If you are seeing this page, you have been granted permissions admin.read.')).toBeVisible();
  });

  test('admin can access subscription area', async ({ browser }) => {
    const context = await browser.newContext({ storageState: `tests/.auth/${users.superadmin.email}.json` });
    const page = await context.newPage();
    const homePage = new HomePage(page);
    const subscriptionPage = new SubscriptionPage(page);

    await homePage.goto();
    await homePage.linkWithText('Subscription area').click();

    await expect(subscriptionPage.elementWithText('If you are seeing this page, you have been granted permissions subscription.read.')).toBeVisible();
  });

  test('admin can impersonate another user', async ({ browser }) => {
    // Signs in on its own session rather than reusing tests/.auth. Sessions live
    // on the server and are shared by the cookie in that file, so impersonating
    // through it would swap the user out from under whichever admin test is
    // running alongside this one.
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LogInPage(page);
    const adminHomePage = new AdminHomePage(page);

    await loginPage.goto();
    await loginPage.logIn(users.superadmin.email, PASSWORD);

    await adminHomePage.goto();
    await adminHomePage.usersSelect.selectOption('test3@example.com');
    await adminHomePage.buttonWithText('Impersonate').click();

    await expect(adminHomePage.elementWithText('impersonating')).toBeVisible();
    await expect(adminHomePage.elementWithText('email":"test3@example.com')).toBeVisible();

    // Both directions share the /sessions/impersonations slug and are told apart
    // by the request method, so the way back is worth exercising too.
    await adminHomePage.buttonWithText('Log back in as original user').click();
    await expect(adminHomePage.elementWithText('If you are seeing this page, you have been granted permissions admin.read.')).toBeVisible();
  });
});