import { BrowserContext, expect, test } from '@playwright/test';
import { RegistrationPage } from './pages/registration';
import { TestMailBox } from './pages/testMailBox';
import { executeShellCommand } from './helper';
import process from 'process';
import { users } from './data/users';

const PASSWORD = process.env.E2E_TEST_PASSWORD;
if (!PASSWORD) {
  throw new Error('E2E_TEST_PASSWORD environment variable is not set');
}

test.describe('Register users', () => {
  for (const dataSet of Object.values(users)) {
    // John is newUser and Juliet is test4Edited, both of which specs create or
    // rename themselves; Ida is registered by the email verification spec, which
    // needs an address that has never been confirmed.
    if (!['John', 'Juliet', 'Ida'].includes(dataSet.firstName)) {
      test(`Register test profile for ${dataSet.email}`, async ({ page }) => {
        const signUpPage = new RegistrationPage(page);

        await test.step('Navigate to the registration page', async () => {
          await signUpPage.goto();
        });

        await test.step(`Register user ${dataSet.email}`, async () => {
          await signUpPage.registerUser(
            { email: dataSet.email, firstName: dataSet.firstName, lastName: dataSet.lastName },
            PASSWORD
          );
        });

        await test.step(`Confirm the address for ${dataSet.email}`, async () => {
          // Registration leaves no session while email verification is enabled,
          // so the state saved below would be an anonymous one. Following the
          // link in the mail is what turns it into a usable login.
          const mailBox = new TestMailBox(page);
          await mailBox.confirmEmailAddress(dataSet.email);
          await expect(page.getByText('Log out')).toBeVisible();

          await page.context().storageState({ path: `tests/.auth/${dataSet.email}.json` });
        }); 
      });
    }
  }

  test.describe('Set superadmin role', () => {
    test('Set superadmin role', async () => {
      console.log('Running partial deploy...');
      await executeShellCommand('sh', ['-c', 'cd ./tests/post_import && env CONFIG_FILE_PATH=./../../.pos pos-cli deploy -p staging'], 'Deploy succeeded');
    });
  });
});