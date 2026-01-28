import { test, expect } from '@playwright/test';
import { StyleGuidePage } from './pages/styleGuide';

test('Articles test', async ({ page }) => {
  const styleGuidePage = new StyleGuidePage(page);
  await styleGuidePage.goto();

  const articlesId = ['initialization', 'colors', 'icons', 'fonts', 'headings',
    'interactive-elements', 'buttons', 'forms', 'boxes', 'tables', 'toasts']

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

    await firstMultiSelect.locator('label').getByText('Label for value 0', { exact: true }).click();
    await firstMultiSelect.locator('label').getByText('Label for value 1', { exact: true }).click();

    //close the multi-select
    await firstMultiSelect.locator('svg[data-icon="dashDown"]').click();

    expect(firstMultiSelect).toContainText('2 selected');

    //pick more options
    await firstMultiSelect.click();
    await firstMultiSelect.locator('label').getByText('Label for value 2', { exact: true }).click();
    await firstMultiSelect.locator('svg[data-icon="dashDown"]').click();
    expect(firstMultiSelect).toContainText('3 selected');
  });

  await test.step('Second multi-select test', async () => {
    const secondMultiSelect = page.locator('#styleguide-form-multiselect-test-2');
    await secondMultiSelect.click();

    await secondMultiSelect.locator('label').getByText('Label for value 3', { exact: true }).click();
    await secondMultiSelect.locator('label').getByText('Label for value 4', { exact: true }).click();
    await secondMultiSelect.locator('label').getByText('Label for value 5', { exact: true }).click();
    await secondMultiSelect.locator('label').getByText('Label for value 6', { exact: true }).click();

    //close the multi-select
    await secondMultiSelect.locator('svg[data-icon="dashDown"]').click();

    let selectedOption = secondMultiSelect.locator('.pos-form-multiselect-selected-item-label')

    expect(selectedOption.getByText('Label for value 3')).toBeVisible();
    expect(selectedOption.getByText('Label for value 4')).toBeVisible();
    expect(selectedOption.getByText('Label for value 5')).toBeVisible();
    expect(selectedOption.getByText('Label for value 6')).toBeVisible();
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