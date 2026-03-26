# Payment Example Gateway - Smoke Tests

## Application Overview

The Payment Example Gateway module provides a mock payment gateway for testing platformOS payment flows. It includes a test helper page at /test-payment that creates test transactions and a gateway page that simulates payment processing with success/failure options. The payment flow is: test-payment page → payment gateway page → success/failure redirect. This test plan covers the core smoke tests to verify the payment gateway integration is functioning correctly.

## Test Scenarios

### 1. Payment Gateway Smoke Tests

**Seed:** `tests/seed.spec.ts`

#### 1.1. Test payment page loads successfully

**File:** `tests/payment-page-load.spec.ts`

**Steps:**
  1. Navigate to /test-payment page
    - expect: Page loads with status 200
    - expect: Page displays the heading 'Test Payment - Example Gateway'
    - expect: Page shows test transaction details: Amount: $10.99, Currency: USD, Items: test-item-1, test-item-2
    - expect: Page displays the 'Start Test Payment' button with id='start-payment'
    - expect: Info message is visible explaining this is a test payment gateway
  2. Verify page structure and content
    - expect: Transaction details are visible showing: Amount: $10.99, Currency: USD, Gateway: example_gateway
    - expect: Form element with POST method to /test-payment?create=1 is present
    - expect: Submit button with id 'start-payment' is present and clickable
    - expect: E2E testing instructions are visible at the bottom of the page

#### 1.2. Successful payment flow end-to-end

**File:** `tests/payment-success-flow.spec.ts`

**Steps:**
  1. Navigate to /test-payment page
    - expect: Page loads successfully with the test payment form
  2. Click the 'Start Test Payment' button (id='start-payment')
    - expect: Form submits and creates a new transaction
    - expect: User is redirected to /payments/example_gateway/index page
    - expect: URL includes transaction_id parameter
    - expect: URL includes success_url parameter set to /test-payment?payment_success=1
    - expect: URL includes failed_url parameter set to /test-payment?payment_failed=1
  3. Verify payment gateway page loads
    - expect: Page displays heading 'Example Payment Gateway'
    - expect: Page shows 'Select payment status:' text
    - expect: Three buttons are visible: 'Payment Success', 'Payment Failed', and 'Payment Success delay status change for 15s'
    - expect: Payment Success button shows the transaction amount: $10.99
    - expect: Form action points to /payments/example_gateway/webhook
    - expect: Hidden input fields contain transaction_id, success_url, and failed_url
  4. Click 'Payment Success' button
    - expect: Form submits to webhook endpoint
    - expect: Webhook processes the payment_status=success
    - expect: Transaction status is updated to 'succeeded'
    - expect: User is redirected to the success_url: /test-payment?payment_success=1
  5. Verify success page displays correctly
    - expect: User lands on /test-payment page with payment_success=1 parameter
    - expect: Green success message is displayed: 'Payment Successful!'
    - expect: Success message includes text: 'Your test payment was processed successfully.'
    - expect: Start Test Payment button is still available for additional tests

#### 1.3. Failed payment flow end-to-end

**File:** `tests/payment-failed-flow.spec.ts`

**Steps:**
  1. Navigate to /test-payment page
    - expect: Page loads successfully with the test payment form
  2. Click the 'Start Test Payment' button (id='start-payment')
    - expect: Form submits and creates a new transaction
    - expect: User is redirected to payment gateway page at /payments/example_gateway/index
    - expect: Gateway page loads with transaction details and payment options
  3. Click 'Payment Failed' button
    - expect: Form submits to webhook endpoint with payment_status=failed
    - expect: Webhook processes the failed payment status
    - expect: Transaction status is updated to 'failed'
    - expect: User is redirected to the failed_url: /test-payment?payment_failed=1
  4. Verify failure page displays correctly
    - expect: User lands on /test-payment page with payment_failed=1 parameter
    - expect: Red error message is displayed: 'Payment Failed'
    - expect: Error message includes text: 'Your test payment was not processed.'
    - expect: Start Test Payment button is available to retry

#### 1.4. Delayed payment success flow

**File:** `tests/payment-success-delayed.spec.ts`

**Steps:**
  1. Navigate to /test-payment page
    - expect: Page loads successfully
  2. Click the 'Start Test Payment' button
    - expect: User is redirected to payment gateway page
  3. Verify delayed payment button is present
    - expect: Third button with text 'Payment Success delay status change for 15s' is visible
    - expect: Button shows transaction amount: $10.99
    - expect: Button has name='payment_status' and value='success_delayed'
  4. Click 'Payment Success delay status change for 15s' button
    - expect: Form submits to webhook endpoint with payment_status=success_delayed
    - expect: Webhook queues background job to update transaction status after 15 second delay
    - expect: User is immediately redirected to success_url: /test-payment?payment_success=1
    - expect: Success page displays while transaction processes in background
  5. Verify success page displays
    - expect: Green success message is displayed
    - expect: Transaction will be updated to 'succeeded' status after background job completes (15 seconds)

#### 1.5. Invalid transaction handling

**File:** `tests/invalid-transaction.spec.ts`

**Steps:**
  1. Navigate directly to payment gateway page with invalid transaction_id
    - expect: Navigate to /payments/example_gateway/index?transaction_id=invalid-id-12345
  2. Verify error handling
    - expect: Page returns 404 status code
    - expect: Transaction query returns blank/null
    - expect: Payment gateway page does not render
    - expect: Proper error handling prevents payment processing with invalid transaction

#### 1.6. Payment gateway page without transaction_id

**File:** `tests/missing-transaction-id.spec.ts`

**Steps:**
  1. Navigate to payment gateway page without transaction_id parameter
    - expect: Navigate to /payments/example_gateway/index (no parameters)
  2. Verify error handling
    - expect: Page returns 404 status code or appropriate error
    - expect: Transaction cannot be found without transaction_id
    - expect: Payment form does not render without valid transaction

#### 1.7. Multiple payment attempts on same transaction

**File:** `tests/multiple-payment-attempts.spec.ts`

**Steps:**
  1. Create a test transaction and complete successful payment
    - expect: Transaction is created
    - expect: Payment succeeds
    - expect: Transaction status is 'succeeded'
  2. Attempt to access the same transaction's payment gateway page again
    - expect: Navigate back to the gateway URL with the same transaction_id
  3. Verify transaction state handling
    - expect: Gateway page may load or show appropriate message for already-completed transaction
    - expect: System handles duplicate payment attempts gracefully
    - expect: Transaction status remains 'succeeded' and is not changed

#### 1.8. URL parameters preservation in redirect flow

**File:** `tests/url-parameters-preservation.spec.ts`

**Steps:**
  1. Create transaction and navigate to payment gateway page
    - expect: Gateway page loads with transaction_id, success_url, and failed_url parameters
  2. Verify all required URL parameters are present
    - expect: transaction_id is present in URL
    - expect: success_url parameter equals /test-payment?payment_success=1
    - expect: failed_url parameter equals /test-payment?payment_failed=1 (note: code shows 'failed_url' but test-payment.liquid uses 'cancel_url')
    - expect: Form hidden inputs contain all three parameters for webhook submission
  3. Submit payment and verify redirect URL
    - expect: After clicking Payment Success, user is redirected to exact success_url
    - expect: After clicking Payment Failed, user is redirected to exact failed_url
    - expect: No parameters are lost during redirect chain
