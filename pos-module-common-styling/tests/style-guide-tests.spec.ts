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

test.describe('File upload', () => {
  // two different files with the same name, uploaded one after another from one page view,
  // like two photos named image.jpg - resolves with the urls they were uploaded to
  const uploadTwoWithTheSameName = (page: Page, id: string) => page.evaluate(async (id) => {
    const container = document.getElementById(id)!;
    const uppy = (window as any).pos.modules.active[id].settings.uppy;
    const upload = (content: string) => new Promise<string>((resolve, reject) => {
      const uploaded = (event: any) => { cleanup(); resolve(event.detail.url); };
      const failed = (event: any) => { cleanup(); reject(new Error(`upload failed: ${event.detail.error}`)); };
      const cleanup = () => { container.removeEventListener('pos-upload-file-uploaded', uploaded); container.removeEventListener('pos-upload-error', failed); };
      container.addEventListener('pos-upload-file-uploaded', uploaded);
      container.addEventListener('pos-upload-error', failed);
      // a File, as one the user picks - a Blob would be uploaded as 'blob'
      uppy.addFile({ name: 'same-name.txt', type: 'text/plain', data: new File([content], 'same-name.txt', { type: 'text/plain' }) });
    });
    return [await upload('the first file'), await upload('the second, different file')];
  }, id);

  const waitForUploader = (page: Page, id: string) => page.waitForFunction(id => (window as any).pos?.modules?.active?.[id]?.settings?.uppy, id);

  test('with presign_url, files with the same name get their own key and keep their content', async ({ page }) => {
    await page.goto('/test/upload');
    await waitForUploader(page, 'upload-presign-url');

    const [first, second] = await uploadTwoWithTheSameName(page, 'upload-presign-url');
    expect(first).not.toBe(second);

    // the url S3 answers with isn't the one the file is served from - it's stored the way an
    // app does after an upload, and read from the url platformOS gives for it
    const served = (url: string) => page.evaluate(async url => {
      const response = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')!.content },
        body: JSON.stringify({ upload: url })
      });
      return (await response.json()).url as string;
    }, url);
    expect(await (await page.request.get(await served(first))).text()).toBe('the first file');
    expect(await (await page.request.get(await served(second))).text()).toBe('the second, different file');
  });

  test('with presigned_upload only, uploading works as before', async ({ page }) => {
    await page.goto('/test/upload');
    await waitForUploader(page, 'upload-presigned-upload');

    const urls = await uploadTwoWithTheSameName(page, 'upload-presigned-upload');
    for(const url of urls){
      expect(decodeURIComponent(url)).toMatch(/\/same-name\.txt$/);
    }
  });

  test('a presign that fails marks the file as failed', async ({ page }) => {
    await page.route('**/api/uploads/presign', route => route.fulfill({ status: 500, body: 'error' }));
    await page.goto('/test/upload');
    await waitForUploader(page, 'upload-presign-url');

    await expect(uploadTwoWithTheSameName(page, 'upload-presign-url')).rejects.toThrow(/upload failed/);
  });

  test('the markdown editor with presign_url gives images with the same name their own key', async ({ page }) => {
    await page.goto('/test/upload');
    await page.waitForFunction(() => (window as any).pos?.modules?.active?.['markdown-presign-url']?.uploadImage);

    const urls = await page.evaluate(async () => {
      const editor = (window as any).pos.modules.active['markdown-presign-url'];
      // a 1x1 png - the editor uploads images only
      const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
      const upload = () => new Promise<string>((resolve, reject) => editor.uploadImage(new File([png], 'image.png', { type: 'image/png' }), resolve, reject));
      return [await upload(), await upload()];
    });
    expect(urls[0]).not.toBe(urls[1]);
  });
});
