# E2E Tests for pos-module-payments-stripe

This directory contains end-to-end tests for the Stripe payments module using Playwright.

## Current Status

**All tests are currently SKIPPED** because the required test application does not exist.

The test app (tests/post_import/app/) with pages like `/test-stripe-payment` needs to be created before these tests can run. All 6 test files require the test app and will be skipped until it is implemented.

## Overview

The test suite is designed to verify the Stripe Checkout integration, including:
- Payment page rendering
- Checkout session creation
- Webhook handling (success, expiration, failures)
- Error scenarios (invalid transactions, missing API keys)
- URL parameter preservation
- Multiple payment attempts

## Prerequisites

1. **Node.js and npm** installed
2. **Playwright** installed via `npm install`
3. **MPKIT_URL** environment variable set to your platformOS instance
4. **pos-cli** configured with environment access
5. **Test application** deployed (currently missing - see note above)

## Test Setup

### Local Development Setup

```bash
# From the pos-module-payments-stripe directory

# 1. Install dependencies
npm install

# 2. Set environment variable
export MPKIT_URL=https://your-instance.staging.oregon.platform-os.com

# 3. Run tests (currently all tests will be skipped)
npm run pw-tests
```

### What Needs to Be Created

The test application needs to be created in `tests/post_import/app/` with:
- **Test pages**: `/test-stripe-payment` (GET), `/test-stripe-payment-post` (POST), `/test-stripe-webhook` (POST)
- **Test configuration**: `tests/post_import/app/config.yml`
- **Module dependencies**: core, payments, payments_stripe need to be set up for test environment

Until the test app is created, all tests will be skipped.

## Running Tests

### Run all tests
```bash
npm run pw-tests
```

### Run specific test file
```bash
npx playwright test tests/stripe-payment-page-load.spec.ts
```

### Run tests in headed mode (see browser)
```bash
npx playwright test --headed
```

### Run tests with UI mode
```bash
npx playwright test --ui
```

### Debug a test
```bash
npx playwright test --debug tests/stripe-payment-page-load.spec.ts
```

## Test Structure

All tests are currently skipped due to missing test app.

### Existing Test Files (All Skipped)
- **stripe-payment-page-load.spec.ts**: Would verify payment page renders correctly
- **stripe-checkout-session-create.spec.ts**: Would test checkout session creation and Stripe redirect
- **stripe-missing-api-key.spec.ts**: Would test graceful failure without Stripe API key
- **stripe-url-parameters.spec.ts**: Would verify URL parameter preservation (3 test cases)
- **stripe-multiple-attempts.spec.ts**: Would test multiple payment attempts
- **verify-stripe-key.spec.ts**: Would verify Stripe API key is working

## Test Environment Limitations

### What We Can Test
- ✅ Transaction creation
- ✅ Checkout session URL generation
- ✅ Webhook handler logic (via simulation)
- ✅ Transaction status updates
- ✅ Success/failure redirects
- ✅ Error handling

### What We Cannot Test
- ❌ Actual Stripe checkout UI (external, hosted by Stripe)
- ❌ Real payment processing (requires test Stripe account)
- ❌ Webhook signature validation (requires Stripe webhook secret)

## Test Pages

### /test-stripe-payment (GET)
Displays a payment form with:
- Transaction details (amount, currency, gateway)
- "Start Payment" button
- Success/failure messages (based on query params)

### /test-stripe-payment-post (POST)
Handles form submission:
- Creates a transaction via payments module
- Generates Stripe checkout session
- Redirects to Stripe or returns error

### /test-stripe-webhook (POST)
Webhook simulator for testing:
- Accepts: `event_type`, `transaction_id`, `payment_status`
- Simulates Stripe webhook payload
- Calls transaction completion logic
- Returns success/error response

## CI Integration

Tests run automatically on GitHub Actions when:
- Pull requests are opened/updated
- Code is pushed to main branch
- Manual workflow dispatch

The workflow:
1. Deploys test application to staging environment
2. Runs all E2E tests
3. Generates HTML report
4. Uploads test results as artifacts

## Viewing Test Results

### Locally
After running tests, view the HTML report:
```bash
npx playwright show-report playwright-report
```

### CI
Test reports are available as workflow artifacts in GitHub Actions.

## Test Configuration

Configuration is in `playwright.config.ts`:
- **Base URL**: From `MPKIT_URL` environment variable
- **Browser**: Desktop Chrome
- **Retries**: 2 on CI, 0 locally
- **Workers**: 3 parallel workers
- **Screenshots**: Only on failure
- **Traces**: Retained on failure

## Troubleshooting

### Tests fail with "Cannot find module"
```bash
npm install
```

### Tests fail with "baseURL not set"
```bash
export MPKIT_URL=https://your-instance.staging.oregon.platform-os.com
```

### Tests are all skipped
The test application does not exist yet. Create the test app in `tests/post_import/app/` following the pattern from pos-module-payments-example-gateway, then remove `.skip` from the test files.

### Checkout fails with API key error
This is expected in test environments without valid Stripe API keys. The tests are designed to handle this gracefully and verify error handling.

## Writing New Tests

1. Create a new `.spec.ts` file in `tests/`
2. Import Playwright test utilities: `import { test, expect } from '@playwright/test';`
3. Use `test.describe()` for grouping related tests
4. Use `test.step()` for logical test steps
5. Follow existing patterns for consistency

Example:
```typescript
import { test, expect } from '@playwright/test';

test.describe('My Test Suite', () => {
  test('should do something', async ({ page }) => {
    await test.step('First step', async () => {
      await page.goto('/test-stripe-payment');
      // assertions here
    });
  });
});
```

## Clean Up

Once the test application is created and deployed, you can clean up the deployed test files by removing the `tests/post_import/` deployment or by redeploying without test files.

## Support

For issues or questions:
- Check [Playwright documentation](https://playwright.dev)
- Check [platformOS documentation](https://documentation.platformos.com)
- Open an issue in the repository
