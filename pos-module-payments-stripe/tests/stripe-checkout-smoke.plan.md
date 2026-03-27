# Stripe Checkout E2E Test Plan

## Overview

This test plan covers end-to-end testing of the Stripe Checkout integration for the pos-module-payments-stripe module. The tests focus on verifiable flows within our control, acknowledging that actual Stripe checkout UI and payment processing are external dependencies.

## Test Environment

- **Module**: pos-module-payments-stripe
- **Dependencies**: pos-module-core, pos-module-payments
- **Test Framework**: Playwright
- **Browser**: Desktop Chrome
- **Deployment**: Tests run against staging/development platformOS instances

## Scope

### In Scope ✅
- Payment page rendering and UI
- Transaction creation via payments module
- Checkout session URL generation
- Webhook event handling (simulated)
- Transaction status updates
- Success/failure redirects
- Error handling and edge cases
- URL parameter preservation

### Out of Scope ❌
- Actual Stripe-hosted checkout UI interaction
- Real payment processing with cards
- Stripe webhook signature validation (requires secrets)
- Stripe API key validation (may not be configured in test environments)

## Test Suites

### Suite 1: Core Checkout Flow (Priority 1)

#### Test 1.1: Payment Page Load
**File**: `stripe-payment-page-load.spec.ts`

**Steps**:
1. Navigate to `/test-stripe-payment`
2. Verify page heading "Stripe Payment Test" is visible
3. Verify transaction details section exists
4. Verify amount "$50.00 USD" is displayed
5. Verify "Start Payment with Stripe" button exists and is clickable

**Expected Results**:
- Page loads successfully
- All UI elements are visible and functional
- No console errors

**Status**: ✅ Implemented

---

#### Test 1.2: Checkout Session Creation
**File**: `stripe-checkout-session-create.spec.ts`

**Steps**:
1. Navigate to `/test-stripe-payment`
2. Click "Start Payment with Stripe" button
3. Wait for navigation

**Expected Results**:
- Transaction is created in database
- One of the following occurs:
  - Redirect to `checkout.stripe.com` (if valid API keys)
  - Error handling occurs gracefully (if no API keys)
  - Redirect back to test page with error (if configuration issue)
- No unhandled exceptions

**Status**: ✅ Implemented

---

#### Test 1.3: Webhook - Checkout Completed (Success)
**File**: `stripe-webhook-success.spec.ts`

**Steps**:
1. Create a transaction by submitting payment form
2. Extract transaction ID from response
3. Simulate `checkout.session.completed` webhook with `payment_status: 'paid'`
4. Verify webhook response indicates success
5. Navigate to success URL with transaction ID
6. Verify success message is displayed

**Expected Results**:
- Webhook processes successfully
- Transaction status updated to 'succeeded'
- Success page displays "Payment Successful!" message
- Transaction ID is shown on success page

**Status**: ✅ Implemented

---

#### Test 1.4: Webhook - Checkout Expired
**File**: `stripe-webhook-expired.spec.ts`

**Steps**:
1. Create a transaction
2. Extract transaction ID
3. Simulate `checkout.session.expired` webhook
4. Verify webhook response
5. Navigate to failure URL with transaction ID
6. Verify failure message is displayed

**Expected Results**:
- Webhook processes successfully
- Transaction status updated appropriately
- Failure page displays "Payment Failed" message
- Transaction ID is shown on failure page

**Status**: ✅ Implemented

---

### Suite 2: Error Scenarios (Priority 2)

#### Test 2.1: Invalid Transaction ID
**File**: `stripe-invalid-transaction.spec.ts`

**Steps**:
1. Navigate to payment page with invalid `transaction_id` parameter
2. Verify page handles gracefully
3. POST webhook with non-existent transaction ID
4. Verify 404 response
5. POST webhook without transaction_id parameter
6. Verify 400 response

**Expected Results**:
- Payment page loads even with invalid ID
- Webhook returns 404 for non-existent transaction
- Webhook returns 400 for missing required parameter
- Error messages are clear and appropriate

**Status**: ✅ Implemented

---

#### Test 2.2: Missing Stripe API Key
**File**: `stripe-missing-api-key.spec.ts`

**Steps**:
1. Attempt to create checkout session (in environment without Stripe keys)
2. Observe error handling

**Expected Results**:
- Application handles missing API key gracefully
- No unhandled exceptions
- User sees appropriate error (500, failure redirect, or error message)
- Error is logged for debugging

**Status**: ✅ Implemented

---

### Suite 3: Additional Coverage (Priority 3)

#### Test 3.1: URL Parameter Preservation
**File**: `stripe-url-parameters.spec.ts`

**Steps**:
1. Create checkout session
2. Verify transaction ID is passed in redirect URL
3. Navigate to success page with transaction ID parameter
4. Verify transaction ID is displayed
5. Navigate to failure page with transaction ID parameter
6. Verify transaction ID is displayed

**Expected Results**:
- Transaction ID preserved through redirects
- Success URL contains correct transaction ID
- Cancel/failure URL contains correct transaction ID
- Transaction ID displayed on result pages

**Status**: ✅ Implemented

---

#### Test 3.2: Multiple Payment Attempts
**File**: `stripe-multiple-attempts.spec.ts`

**Steps**:
1. Create first payment attempt
2. Note transaction ID
3. Navigate back to payment page
4. Create second payment attempt
5. Note second transaction ID
6. Verify different transactions created
7. Complete first transaction via webhook
8. Verify can still initiate new payments

**Expected Results**:
- Each attempt creates a new transaction
- Transaction IDs are unique
- Completing one transaction doesn't block new payments
- Old transactions remain accessible

**Status**: ✅ Implemented

---

## Test Data

### Transactions
- **Amount**: $50.00 (5000 cents)
- **Currency**: USD
- **Gateway**: stripe
- **Payer ID**: test_payer

### Webhook Events
- `checkout.session.completed` - Successful payment
- `checkout.session.expired` - Expired session
- `checkout.session.async_payment_succeeded` - Async payment success (future)
- `checkout.session.async_payment_failed` - Async payment failure (future)

## Test Execution

### Prerequisites
1. platformOS instance deployed with test files
2. `MPKIT_URL` environment variable set
3. Node.js and Playwright installed

### Run All Tests
```bash
npm run pw-tests
```

### Run Specific Suite
```bash
npx playwright test tests/stripe-payment-page-load.spec.ts
npx playwright test tests/stripe-webhook-success.spec.ts
```

## Success Criteria

- ✅ All tests pass on clean deployment
- ✅ Tests are deterministic (consistent results)
- ✅ Tests complete in reasonable time (< 5 minutes total)
- ✅ Test failures clearly indicate the problem
- ✅ No false positives or flaky tests
- ✅ Tests work in CI environment

## Known Limitations

1. **Stripe Checkout UI**: Cannot test the actual Stripe-hosted checkout page UI or payment form interactions
2. **Payment Processing**: Cannot test real card processing without live Stripe integration
3. **Webhook Signatures**: Webhook signature validation is not tested (requires Stripe signing secret)
4. **API Keys**: Tests assume API keys may not be configured and handle that gracefully

## Future Enhancements

- [ ] Add tests for async payment success/failure webhooks
- [ ] Add tests for customer creation and tracking
- [ ] Add tests for metadata preservation
- [ ] Add tests for different currencies
- [ ] Add tests for subscription payments
- [ ] Add visual regression testing for payment page
- [ ] Add performance benchmarks for checkout session creation

## Test Maintenance

- **Review**: Monthly review of test coverage
- **Update**: Update tests when Stripe API changes
- **Expand**: Add tests for new features as they're implemented
- **Refactor**: Keep tests DRY and maintainable

## Reporting

- **Local**: HTML report generated in `playwright-report/`
- **CI**: Test results available as GitHub Actions artifacts
- **Failures**: Screenshots and traces captured on failure for debugging

## Sign-off

- [x] Test plan reviewed
- [x] All priority 1 tests implemented
- [x] All priority 2 tests implemented
- [x] All priority 3 tests implemented
- [x] Documentation complete
- [ ] CI integration configured (pending)
