import { test, expect, type Page } from '@playwright/test';
import { StyleGuidePage } from './pages/styleGuide';

test('Articles test', async ({ page }) => {
  const styleGuidePage = new StyleGuidePage(page);
  await styleGuidePage.goto();

  const articlesId = ['initialization', 'colors', 'icons', 'fonts', 'headings',
    'buttons', 'forms', 'boxes', 'tables', 'toasts']

  for(const articleId of articlesId) {
    expect(styleGuidePage.articleById(articleId)).toBeVisible();
  }
});

test('Form test', async({ page }) => {
  const styleGuidePage = new StyleGuidePage(page);
  const anAgreementCheckBox = await styleGuidePage.checkboxWithText('An agreement *');
  await styleGuidePage.goto();

  await test.step('fill inputs', async () => {
    await styleGuidePage.textInputField('Email').fill('test@example.com')
    await styleGuidePage.textInputField('Password').fill('testPassword')
  });

  await test.step('check inputs', async () => {
    const emailInputValue = await styleGuidePage.textInputField('Email').inputValue();
    const passwordInputValue = await styleGuidePage.textInputField('Password').inputValue();
  
    await expect(emailInputValue).toBe('test@example.com');
    await expect(passwordInputValue).toBe('testPassword');
  });

  await test.step('check the checkbox', async () => {
    await anAgreementCheckBox.click();
    const isChecked = await anAgreementCheckBox.isChecked();
    expect(isChecked).toBe(true);
  });

  await test.step('uncheck the checkbox', async () => {
    await anAgreementCheckBox.click();
    const isChecked = await anAgreementCheckBox.isChecked();
    expect(isChecked).toBe(false);
  });
})

test('Radio tests', async({ page }) => {
  const styleGuidePage = new StyleGuidePage(page);
  await styleGuidePage.goto();

  const radioButtons = ['Default', 'Hover', 'Focused'];

  await test.step('check the radio buttons', async () => {
    for(const radioButton of radioButtons) {
      await styleGuidePage.radioButtonWithText(radioButton).click();
      const isChecked = await styleGuidePage.radioButtonWithText(radioButton).isChecked();
      expect(isChecked).toBe(true);
    };
  });

  await test.step('ensure disabled and checked radio meets requirements', async () => {
    const radioButtonText = 'Disabled & checked';

    //ensure disable and checked radio button is checked and disabled by default
    let isChecked = await styleGuidePage.checkboxWithText(radioButtonText).isChecked();
    expect(isChecked).toBe(true);

    let isDisabled = await styleGuidePage.checkboxWithText(radioButtonText).isDisabled();
    expect(isDisabled).toBe(true);
  });
})

test('Checkbox tests', async({ page }) => {
  const styleGuidePage = new StyleGuidePage(page);
  await styleGuidePage.goto();

  const checkboxesToCheck = ['Default', 'Hover', 'Focused'];
  const checkboxesToUncheck = ['Default', 'Hover', 'Focused', 'Checked'];

  await test.step('check the checkboxes', async () => {
    for(const checkbox of checkboxesToCheck) {
      await styleGuidePage.checkboxWithText(checkbox).click();
      const isChecked = await styleGuidePage.checkboxWithText(checkbox).isChecked();
      expect(isChecked).toBe(true);
    };
  });

  await test.step('uncheck the checked checkbox', async () => {
    for(const checkbox of checkboxesToUncheck) {
      await styleGuidePage.checkboxWithText(checkbox).click();
      const isChecked = await styleGuidePage.checkboxWithText(checkbox).isChecked();
      expect(isChecked).toBe(false);
    };
  });

  await test.step('ensure disabled and checked checkbox meets requirements', async () => {
    const checkboxText = 'Disabled & checked';

    //ensure checkbox is checked and disabled by default
    let isChecked = await styleGuidePage.checkboxWithText(checkboxText).isChecked();
    expect(isChecked).toBe(true);

    let isDisabled = await styleGuidePage.checkboxWithText(checkboxText).isDisabled();
    expect(isDisabled).toBe(true);
  });
});

test('Select tests', async({ page }) => {
  const styleGuidePage = new StyleGuidePage(page);
  await styleGuidePage.goto();

  await test.step('single-select test', async () => {
    const firstSelect = page.locator('div .pos-form-select').first();
    await firstSelect.selectOption('Default 2');
    expect(firstSelect).toHaveValue('Default 2');
  });

  await test.step('First multi-select test', async () => {
    const firstMultiSelect = page.locator('#styleguide-form-multiselect-test-1');
    await firstMultiSelect.click();

    // Page initializes with 3 selected: value0, value5, value6
    // Uncheck value0, check value1 → result: value1, value5, value6 (3 selected)
    await firstMultiSelect.locator('label').getByText('Label for value 0', { exact: true }).click();
    await firstMultiSelect.locator('label').getByText('Label for value 1', { exact: true }).click();

    //close the multi-select
    await firstMultiSelect.locator('svg[data-icon="dashDown"]').click();

    expect(firstMultiSelect).toContainText('3 selected');

    //pick more options
    await firstMultiSelect.click();
    await firstMultiSelect.locator('label').getByText('Label for value 2', { exact: true }).click();
    await firstMultiSelect.locator('svg[data-icon="dashDown"]').click();
    expect(firstMultiSelect).toContainText('4 selected');
  });

  await test.step('Second multi-select test', async () => {
    const secondMultiSelect = page.locator('#styleguide-form-multiselect-test-2');
    const trigger = secondMultiSelect.locator('.pos-form-multiselect-input');

    // Open dropdown with keyboard (Enter works better than click for this multiselect)
    await trigger.focus();
    await page.keyboard.press('Enter');

    // Wait for dropdown to fully open
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(secondMultiSelect.locator('.pos-form-multiselect-list-container')).toBeVisible();

    // Multiselect starts with value0, value5, value6 selected
    // Click value3 and value4 to CHECK them
    // Click value5 and value6 to UNCHECK them (they're pre-selected)
    await secondMultiSelect.locator('label').getByText('Label for value 3', { exact: true }).click();
    await secondMultiSelect.locator('label').getByText('Label for value 4', { exact: true }).click();
    await secondMultiSelect.locator('label').getByText('Label for value 5', { exact: true }).click();
    await secondMultiSelect.locator('label').getByText('Label for value 6', { exact: true }).click();

    // Close the multi-select
    await secondMultiSelect.locator('svg[data-icon="dashDown"]').click();

    // Final selected items: value0 (unchanged), value3 (checked), value4 (checked)
    // value5 and value6 were unchecked
    let selectedOption = secondMultiSelect.locator('.pos-form-multiselect-selected-item-label')

    await expect(selectedOption.getByText('Label for value 0')).toBeVisible();
    await expect(selectedOption.getByText('Label for value 3')).toBeVisible();
    await expect(selectedOption.getByText('Label for value 4')).toBeVisible();
  });

  await test.step('Third multi-select test', async () => {
    const thirdMultiSelect = page.locator('#styleguide-form-multiselect-test-3');
    await thirdMultiSelect.click();

    await thirdMultiSelect.locator('label').getByText('Label for value 7', { exact: true }).click();
    await thirdMultiSelect.locator('label').getByText('Label for value 8', { exact: true }).click();

    //close the multi-select
    await thirdMultiSelect.locator('svg[data-icon="dashDown"]').click();

    let selectedOption = thirdMultiSelect.locator('.pos-form-multiselect-selected-item-label')

    expect(selectedOption.getByText('Label for value 7')).toBeVisible();
    expect(selectedOption.getByText('Label for value 8')).toBeVisible();
  });

  await test.step('Fourth multi-select test', async () => {
    const fourthMultiSelect = page.locator('#styleguide-form-multiselect-test-4');
    expect(fourthMultiSelect).toContainText('3 selected');
    await fourthMultiSelect.click();

    await fourthMultiSelect.locator('label').getByText('Label for value 7', { exact: true }).click();
    await fourthMultiSelect.locator('label').getByText('Label for value 8', { exact: true }).click();
    await fourthMultiSelect.locator('label').getByText('Label for value 9', { exact: true }).click();
    await fourthMultiSelect.locator('label').getByText('Label for value 10', { exact: true }).click();


    //close the multi-select
    await fourthMultiSelect.locator('svg[data-icon="dashDown"]').click();

    expect(fourthMultiSelect).toContainText('7 selected');
  });
})

test('Toast tests', async({ page }) => {
  const styleGuidePage = new StyleGuidePage(page);
  await styleGuidePage.goto();

  const infoToast = styleGuidePage.toastNotification('pos-toast-info');
  const successToast = styleGuidePage.toastNotification('pos-toast-success');
  const errorToast = styleGuidePage.toastNotification('pos-toast-error');


  await test.step('trigger toasts', async () => {
    await page.evaluate(() => {
      console.log('Wywołanie toastów z Playwright');
      new (window as any).pos.modules.toast('info', 'Test info toast');
      new (window as any).pos.modules.toast('success', 'Test success toast');
      new (window as any).pos.modules.toast('error', 'Test error toast');
    });
  });

  await test.step('ensure toasts are visible', async () => {
    expect(infoToast.getByText('Test info toast')).toBeVisible();
    expect(successToast.getByText('Test success toast')).toBeVisible();
    expect(errorToast.getByText('Test error toast')).toBeVisible();
  });

  await test.step('close the toasts', async () => {
    await infoToast.locator('button[title="Dismiss notification"]').nth(1).click();
    await successToast.locator('button[title="Dismiss notification"]').nth(1).click();
    await errorToast.locator('button[title="Dismiss notification"]').nth(1).click();
  });

  await test.step('ensure toasts are not visible', async () => {
    expect(infoToast.getByText('Test info toast')).not.toBeVisible();
    expect(successToast.getByText('Test success toast')).not.toBeVisible();
    expect(errorToast.getByText('Test error toast')).not.toBeVisible();
  });
})
test.describe('Dates and times', () => {
  // a timezone far from the server's UTC, so a date formatted by the server would show
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('dates are formatted in the browser', async ({ page }) => {
    const styleGuidePage = new StyleGuidePage(page);
    await styleGuidePage.goto();

    await test.step('relative dates', async () => {
      for(const label of ['now', '5 minutes ago', '3 hours ago', '1 day ago', '2 days ago']){
        await expect(styleGuidePage.timeExample(label, 'relative')).toHaveText(label);
      }
    });

    await test.step('a relative date older than 2 days is a full date, shown on hover too', async () => {
      const relative = styleGuidePage.timeExample('10 days ago', 'relative');
      await expect(relative).toHaveText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s[AP]M$/);
      await expect(relative).toHaveAttribute('title', (await relative.textContent()) ?? '');
    });

    await test.step('full dates are in the visitor\'s timezone', async () => {
      const full = styleGuidePage.timeExample('3 hours ago', 'full');
      const datetime = await full.getAttribute('datetime');
      // formatted by the browser's own Intl, the timezone given explicitly
      const expected = await page.evaluate(datetime => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(datetime)), datetime ?? '');
      await expect(full).toHaveText(expected);
    });

    await test.step('a date added to the page later is formatted too', async () => {
      await page.evaluate(() => {
        const time = document.createElement('time');
        time.className = 'pos-time';
        time.id = 'styleguide-time-added';
        time.dataset.format = 'relative';
        time.setAttribute('datetime', new Date(Date.now() - 2 * 60 * 1000).toISOString());
        document.querySelector('#time')?.append(time);
      });
      await expect(page.locator('#styleguide-time-added')).toHaveText('2 minutes ago');
    });
  });
});

test.describe('Dates and times in a chosen timezone', () => {
  // the visitor's own timezone, which a chosen one overrides
  test.use({ timezoneId: 'Asia/Tokyo' });

  // the test page's date, 2026-01-15 12:00 UTC, formatted by the browser in the given timezone
  const expected = (page: Page, timeZone: string) => page.evaluate(timeZone => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date('2026-01-15T12:00:00Z')), timeZone);

  test('a platformOS timezone name is shown in its IANA timezone', async ({ page }) => {
    await page.goto('/test/time?timezone=Warsaw');
    await expect(page.locator('#date time')).toHaveText(await expected(page, 'Europe/Warsaw'));
  });

  test('a platformOS timezone name of a three-part IANA one', async ({ page }) => {
    await page.goto('/test/time?timezone=' + encodeURIComponent('Indiana (East)'));
    await expect(page.locator('#date time')).toHaveText(await expected(page, 'America/Indiana/Indianapolis'));
  });

  test('an IANA timezone name', async ({ page }) => {
    await page.goto('/test/time?timezone=America/New_York');
    await expect(page.locator('#date time')).toHaveText(await expected(page, 'America/New_York'));
  });

  test('an unknown timezone falls back to the visitor\'s own', async ({ page }) => {
    await page.goto('/test/time?timezone=Mars/Olympus_Mons');
    await expect(page.locator('#date time')).toHaveText(await expected(page, 'Asia/Tokyo'));
  });

  test('the server formats the date in the timezone too, until the script runs', async ({ page }) => {
    const html = await (await page.request.get('/test/time?server_timezone=Warsaw')).text();
    // 12:00 UTC is 13:00 in Warsaw in January
    expect(html).toMatch(/<time[^>]*>[^<]*13:00<\/time>/);
  });

  test('the dates are watched once, even if init is rendered twice', async ({ page }) => {
    // counts the MutationObservers watching the whole page
    await page.addInitScript(() => {
      (window as any).pageObservers = 0;
      const observe = MutationObserver.prototype.observe;
      MutationObserver.prototype.observe = function(target, options){
        if(target === document.body && options?.subtree){
          (window as any).pageObservers++;
        }
        return observe.call(this, target, options);
      };
    });
    await page.goto('/test/time?timezone=Warsaw');
    await expect(page.locator('#date time')).toHaveText(await expected(page, 'Europe/Warsaw'));

    expect(await page.evaluate(() => (window as any).pageObservers)).toBe(1);
  });
});
