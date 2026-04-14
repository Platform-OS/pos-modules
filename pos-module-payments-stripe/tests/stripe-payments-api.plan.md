# Stripe Payments Module - API Test Plan

## Application Overview

This test plan provides comprehensive API test coverage for the pos-module-payments-stripe module. The module integrates Stripe payment processing with platformOS through the generic payments module, providing Stripe Checkout sessions, Connected Accounts for marketplace functionality, webhook handling, payment operations (charges, refunds, payment intents), and customer management.

**Testing Approach:**
Since this is an API-focused module without a user interface, tests use Playwright's request context to make API calls to platformOS pages/endpoints that invoke Liquid commands. The module exposes functionality through:
- Liquid commands (invoked via test pages)
- Webhook endpoints (POST /payments/stripe/webhooks)
- Transaction management (via payments module)

**Test Environment Requirements:**
- Stripe test API keys configured (sk_test_...)
- Module deployed to test environment
- Test pages created to invoke commands
- Stripe webhook endpoints configured

**Key Test Areas:**
1. Transaction Management - Core payment transaction lifecycle
2. Checkout Sessions - Stripe Checkout integration
3. Connected Accounts - Marketplace/platform account management
4. Webhooks - Event handling and signature validation
5. Payment Operations - Charges, refunds, payment intents
6. Customer Management - Stripe customer storage/retrieval
7. Error Handling - Validation, API errors, edge cases
8. Balance & Reporting - Transaction history and balance queries

## Test Scenarios

### 1. Transaction Management

**Seed:** `tests/seed/transaction-seed.spec.ts`

#### 1.1. Create Payment Transaction

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Call transaction create command with valid data (gateway: 'stripe', amount_cents: 10000, currency: 'USD', payable_ids: ['test-1'])
    - expect: Transaction is created successfully
    - expect: Response contains transaction ID
    - expect: Status is 'new'
    - expect: Amount matches input
    - expect: Gateway is set to 'stripe'
  2. Retrieve the created transaction by ID
    - expect: Transaction exists in database
    - expect: All fields are populated correctly
    - expect: Created timestamp is present

#### 1.2. Create Transaction with Invalid Gateway

**File:** `tests/transactions/create-invalid-gateway.spec.ts`

**Steps:**
  1. Attempt to create transaction with invalid gateway name
    - expect: Transaction creation fails
    - expect: Error message indicates invalid gateway
    - expect: No transaction record is created

#### 1.3. Create Transaction with Missing Required Fields

**File:** `tests/transactions/create-missing-fields.spec.ts`

**Steps:**
  1. Attempt to create transaction without amount_cents
    - expect: Validation error is returned
    - expect: Error specifies missing field
  2. Attempt to create transaction without currency
    - expect: Validation error is returned
    - expect: Error specifies missing currency
  3. Attempt to create transaction without gateway
    - expect: Validation error is returned
    - expect: Error specifies missing gateway

#### 1.4. Update Transaction Status

**File:** `tests/transactions/update-status.spec.ts`

**Steps:**
  1. Create a new transaction with status 'new'
    - expect: Transaction is created with status 'new'
  2. Update transaction status to 'pending'
    - expect: Transaction status is updated
    - expect: Status cache is updated
    - expect: Status history is recorded
  3. Update transaction status to 'succeeded'
    - expect: Transaction status is 'succeeded'
    - expect: Finalization logic is triggered
    - expect: Transaction cannot be modified further

#### 1.5. Transaction Status Transitions

**File:** `tests/transactions/status-transitions.spec.ts`

**Steps:**
  1. Create transaction and verify initial status is 'new'
    - expect: Status is 'new'
  2. Transition to 'pending' via checkout session creation
    - expect: Status changes to 'pending'
    - expect: Gateway transaction ID is recorded
  3. Simulate successful payment webhook
    - expect: Status changes to 'succeeded'
    - expect: Transaction is marked as finalized
  4. Attempt to update succeeded transaction
    - expect: Update is rejected
    - expect: Transaction remains in succeeded state

#### 1.6. Transaction with Gateway Transaction ID

**File:** `tests/transactions/gateway-transaction-id.spec.ts`

**Steps:**
  1. Create transaction and update with Stripe checkout session ID
    - expect: Gateway transaction ID is stored
    - expect: Transaction can be found by gateway ID
  2. Query transaction using gateway_transaction_ids parameter
    - expect: Transaction is retrieved using Stripe session ID
    - expect: Multiple gateway IDs can be searched simultaneously

### 2. Stripe Checkout Sessions

**Seed:** `tests/seed/checkout-seed.spec.ts`

#### 2.1. Create Checkout Session

**File:** `tests/checkout/create-session.spec.ts`

**Steps:**
  1. Create a payment transaction
    - expect: Transaction is created successfully
  2. Create Stripe Checkout session with line_items, success_url, and cancel_url
    - expect: Checkout session is created
    - expect: Response contains session ID
    - expect: Response contains checkout URL
    - expect: URL points to checkout.stripe.com
    - expect: Gateway transaction ID is recorded in transaction
  3. Verify session metadata includes transaction_id
    - expect: Metadata contains the platformOS transaction ID
    - expect: Metadata contains host information for webhook routing

#### 2.2. Create Checkout Session with Line Items

**File:** `tests/checkout/session-with-line-items.spec.ts`

**Steps:**
  1. Create checkout session with multiple line items (different quantities, prices, currencies)
    - expect: Session includes all line items
    - expect: Prices are calculated correctly
    - expect: Currency matches transaction currency
  2. Verify line_items structure in Stripe request
    - expect: Each item has quantity, price_data with unit_amount, currency, and product_data
    - expect: Product names are included

#### 2.3. Retrieve Checkout Session

**File:** `tests/checkout/retrieve-session.spec.ts`

**Steps:**
  1. Create a checkout session
    - expect: Session ID is returned
  2. Retrieve the session using Stripe retrieve command
    - expect: Session details are returned
    - expect: Status is present
    - expect: Payment status is available
    - expect: Customer email (if collected) is present

#### 2.4. Expire Checkout Session

**File:** `tests/checkout/expire-session.spec.ts`

**Steps:**
  1. Create a checkout session
    - expect: Session is created
  2. Call expire command on the session
    - expect: Session is marked as expired in Stripe
    - expect: Status is 'expired'
  3. Attempt to complete an expired session
    - expect: Completion fails
    - expect: Error indicates session is expired

#### 2.5. Complete Checkout Session

**File:** `tests/checkout/complete-session.spec.ts`

**Steps:**
  1. Create and retrieve a checkout session with payment_status: 'paid'
    - expect: Session shows as paid
  2. Call complete command to finalize the session
    - expect: Transaction status is updated to 'succeeded'
    - expect: Customer information is captured
    - expect: Payment method is recorded

#### 2.6. Checkout Session with Setup Intent

**File:** `tests/checkout/setup-intent.spec.ts`

**Steps:**
  1. Create checkout session in 'setup' mode for saving payment method
    - expect: Session is created with mode: 'setup'
    - expect: Setup intent ID is returned
  2. Simulate setup intent completion
    - expect: Setup intent succeeds
    - expect: Payment method is saved
    - expect: Customer ID is recorded

#### 2.7. Checkout with Success and Cancel URLs

**File:** `tests/checkout/success-cancel-urls.spec.ts`

**Steps:**
  1. Create checkout session with custom success_url and cancel_url
    - expect: Session includes correct redirect URLs
    - expect: Transaction ID is appended to success_url
    - expect: Cancel URL allows user to retry
  2. Verify URL parameters are preserved
    - expect: Query parameters in success_url are maintained
    - expect: Session ID is available for verification

### 3. Stripe Connected Accounts

**Seed:** `tests/seed/connected-accounts-seed.spec.ts`

#### 3.1. Create Connected Account

**File:** `tests/connected-accounts/create-account.spec.ts`

**Steps:**
  1. Create Stripe connected account with reference_id and metadata
    - expect: Account is created in Stripe
    - expect: Account ID is returned
    - expect: Account is stored in connected_account table
    - expect: Reference ID matches input
    - expect: State is 'created'
  2. Retrieve account by reference_id
    - expect: Account record is found
    - expect: Account ID matches Stripe account ID

#### 3.2. Create Account with Capabilities

**File:** `tests/connected-accounts/create-with-capabilities.spec.ts`

**Steps:**
  1. Create connected account with card_payments and transfers capabilities
    - expect: Account is created
    - expect: Capabilities are requested
    - expect: Account type is 'express'

#### 3.3. Get Onboarding Link

**File:** `tests/connected-accounts/get-onboarding-link.spec.ts`

**Steps:**
  1. Create a connected account
    - expect: Account is created
  2. Generate onboarding link for the account
    - expect: Onboarding URL is returned
    - expect: URL is valid Stripe Connect onboarding link
    - expect: Expiration timestamp is included

#### 3.4. Get Dashboard Link

**File:** `tests/connected-accounts/get-dashboard-link.spec.ts`

**Steps:**
  1. Create a connected account
    - expect: Account is created
  2. Generate dashboard link for the account
    - expect: Dashboard URL is returned
    - expect: URL allows access to Stripe Express dashboard

#### 3.5. Delete Connected Account

**File:** `tests/connected-accounts/delete-account.spec.ts`

**Steps:**
  1. Create a connected account
    - expect: Account is created
  2. Delete the connected account
    - expect: Account is deleted from Stripe
    - expect: Account record is removed from database
    - expect: Deletion event is published
  3. Attempt to retrieve deleted account
    - expect: Account is not found
    - expect: Error indicates account does not exist

#### 3.6. Find Connected Account by Account ID

**File:** `tests/connected-accounts/find-by-account-id.spec.ts`

**Steps:**
  1. Create connected account
    - expect: Account ID is returned
  2. Query by account_id (Stripe ID)
    - expect: Account is retrieved
    - expect: All account details are present

#### 3.7. Find Connected Account by Reference ID

**File:** `tests/connected-accounts/find-by-reference-id.spec.ts`

**Steps:**
  1. Create connected account with specific reference_id
    - expect: Account is created
  2. Query by reference_id (application-specific ID)
    - expect: Account is retrieved using reference ID
    - expect: Enables linking to application users/entities

#### 3.8. Connected Account State Management

**File:** `tests/connected-accounts/account-state.spec.ts`

**Steps:**
  1. Create new connected account
    - expect: Initial state is tracked
  2. Simulate account.updated webhook
    - expect: Account state is updated
    - expect: Last errors are cleared or populated
    - expect: Data field contains latest account information

### 4. Webhook Handling

**Seed:** `tests/seed/webhook-seed.spec.ts`

#### 4.1. Webhook Signature Validation - Valid

**File:** `tests/webhooks/valid-signature.spec.ts`

**Steps:**
  1. Send webhook request with valid Stripe signature
    - expect: Webhook is accepted (200 status)
    - expect: Webhook handler is invoked
    - expect: Event is processed

#### 4.2. Webhook Signature Validation - Invalid

**File:** `tests/webhooks/invalid-signature.spec.ts`

**Steps:**
  1. Send webhook request with invalid or missing signature
    - expect: Webhook is rejected (403 status)
    - expect: Error is logged
    - expect: Event is not processed

#### 4.3. Charge Succeeded Webhook

**File:** `tests/webhooks/charge-succeeded.spec.ts`

**Steps:**
  1. Create transaction and checkout session
    - expect: Transaction is in 'pending' state
  2. Send 'charge.succeeded' webhook with transaction metadata
    - expect: Webhook is processed successfully
    - expect: Transaction status is updated to 'succeeded'
    - expect: Gateway request is logged
    - expect: Transaction is finalized
  3. Verify transaction record
    - expect: Status is 'succeeded'
    - expect: Charge ID is recorded
    - expect: Payment method is captured

#### 4.4. Charge Failed Webhook

**File:** `tests/webhooks/charge-failed.spec.ts`

**Steps:**
  1. Create transaction and checkout session
    - expect: Transaction exists
  2. Send 'charge.failed' webhook
    - expect: Transaction status is updated to 'failed'
    - expect: Failure reason is recorded
    - expect: Error details are logged

#### 4.5. Charge Pending Webhook

**File:** `tests/webhooks/charge-pending.spec.ts`

**Steps:**
  1. Send 'charge.pending' webhook
    - expect: Transaction status is updated to 'pending'
    - expect: Transaction awaits final settlement

#### 4.6. Checkout Session Expired Webhook

**File:** `tests/webhooks/session-expired.spec.ts`

**Steps:**
  1. Create transaction and checkout session
    - expect: Session is created
  2. Send 'checkout.session.expired' webhook
    - expect: Transaction status is updated to 'expired'
    - expect: User can create new checkout session for same transaction

#### 4.7. Setup Intent Succeeded Webhook

**File:** `tests/webhooks/setup-intent-succeeded.spec.ts`

**Steps:**
  1. Create setup intent for saving payment method
    - expect: Setup intent is created
  2. Send 'setup_intent.succeeded' webhook
    - expect: Setup intent status is updated
    - expect: Payment method is saved
    - expect: Customer ID is recorded
    - expect: Event is published for application logic

#### 4.8. Webhook Transaction Not Found

**File:** `tests/webhooks/transaction-not-found.spec.ts`

**Steps:**
  1. Send webhook for non-existent transaction ID
    - expect: Webhook returns 500 status
    - expect: Error is logged indicating transaction not found

#### 4.9. Webhook Different Host

**File:** `tests/webhooks/different-host.spec.ts`

**Steps:**
  1. Send webhook with host metadata that doesn't match receiving instance
    - expect: Webhook returns 202 status
    - expect: Message indicates transaction is from different host
    - expect: Transaction is not modified

#### 4.10. Webhook Already Processed

**File:** `tests/webhooks/already-processed.spec.ts`

**Steps:**
  1. Process webhook to update transaction to 'succeeded'
    - expect: Transaction is succeeded
  2. Send same webhook again
    - expect: Webhook returns 202 status
    - expect: Message indicates transaction already completed
    - expect: Transaction is not modified (idempotent)

#### 4.11. Webhook for Connected Account

**File:** `tests/webhooks/connected-account-webhook.spec.ts`

**Steps:**
  1. Create connected account
    - expect: Account is created
  2. Send webhook to /payments/stripe/webhooks_connect endpoint with account.updated event
    - expect: Webhook is processed
    - expect: Connected account record is updated
    - expect: Account state reflects changes

#### 4.12. Payout Webhook

**File:** `tests/webhooks/payout-webhook.spec.ts`

**Steps:**
  1. Send 'payout.paid' webhook for connected account
    - expect: Payout record is created or updated
    - expect: Payout event is published
    - expect: Payout status is tracked

### 5. Payment Operations

**Seed:** `tests/seed/payment-ops-seed.spec.ts`

#### 5.1. Create Stripe Charge

**File:** `tests/payment-ops/create-charge.spec.ts`

**Steps:**
  1. Create charge with amount, currency, and payment source
    - expect: Charge is created in Stripe
    - expect: Charge ID is returned
    - expect: Charge status is available
    - expect: Amount matches input
  2. Verify charge details
    - expect: Gateway request is logged
    - expect: Response includes charge object with all fields

#### 5.2. Create Refund

**File:** `tests/payment-ops/create-refund.spec.ts`

**Steps:**
  1. Create a successful charge
    - expect: Charge is created and succeeded
  2. Create refund for the charge
    - expect: Refund is created in Stripe
    - expect: Refund ID is returned
    - expect: Refund amount is specified
    - expect: Refund is linked to charge
  3. Verify refund record
    - expect: Refund is stored in refunds table
    - expect: Transaction ID is linked
    - expect: Refund status is tracked

#### 5.3. Partial Refund

**File:** `tests/payment-ops/partial-refund.spec.ts`

**Steps:**
  1. Create charge for $100
    - expect: Charge succeeds
  2. Create refund for $30
    - expect: Partial refund is processed
    - expect: Refund amount is $30
    - expect: Charge shows remaining $70

#### 5.4. Refund with Reason

**File:** `tests/payment-ops/refund-with-reason.spec.ts`

**Steps:**
  1. Create refund with reason (duplicate, fraudulent, requested_by_customer)
    - expect: Refund includes reason
    - expect: Reason is stored in refund record

#### 5.5. Create Payment Intent

**File:** `tests/payment-ops/create-payment-intent.spec.ts`

**Steps:**
  1. Create payment intent with amount and currency
    - expect: Payment intent is created
    - expect: Intent ID is returned
    - expect: Client secret is provided
    - expect: Status is tracked
  2. Verify payment intent can be used for frontend confirmation
    - expect: Client secret is valid
    - expect: Intent is in requires_payment_method or requires_confirmation state

#### 5.6. Retrieve Payment Method

**File:** `tests/payment-ops/retrieve-payment-method.spec.ts`

**Steps:**
  1. Create and retrieve payment method by ID
    - expect: Payment method details are returned
    - expect: Card details (last4, brand, exp_month, exp_year) are present
    - expect: Customer ID is available

#### 5.7. Retrieve Stripe Customer

**File:** `tests/payment-ops/retrieve-customer.spec.ts`

**Steps:**
  1. Create customer or use existing customer ID
    - expect: Customer ID is available
  2. Retrieve customer from Stripe
    - expect: Customer details are returned
    - expect: Email, name, and metadata are present
    - expect: Payment methods are listed

### 6. Customer Management

**Seed:** `tests/seed/customer-seed.spec.ts`

#### 6.1. Create Customer Record

**File:** `tests/customers/create-customer.spec.ts`

**Steps:**
  1. Create customer with customer_id, reference_id, email, and name
    - expect: Customer record is created in customers table
    - expect: Customer ID is Stripe customer ID
    - expect: Reference ID links to application user
    - expect: Email and name are stored

#### 6.2. Find Customer by Customer ID

**File:** `tests/customers/find-by-customer-id.spec.ts`

**Steps:**
  1. Create customer record
    - expect: Customer is created
  2. Query by customer_id (Stripe customer ID)
    - expect: Customer is retrieved
    - expect: All fields match creation data

#### 6.3. Find Customer by Reference ID

**File:** `tests/customers/find-by-reference-id.spec.ts`

**Steps:**
  1. Create customer with reference_id
    - expect: Customer is created
  2. Query by reference_id (application user ID)
    - expect: Customer is retrieved using application ID
    - expect: Enables lookup of Stripe customer from app user

#### 6.4. Search Customers

**File:** `tests/customers/search-customers.spec.ts`

**Steps:**
  1. Create multiple customer records
    - expect: Customers are created
  2. Search customers with filters (email, stripe_account_name)
    - expect: Results match search criteria
    - expect: Pagination works correctly
    - expect: Results are sorted properly

#### 6.5. Customer with Stripe Account Name

**File:** `tests/customers/customer-with-account-name.spec.ts`

**Steps:**
  1. Create customer associated with specific Stripe connected account
    - expect: Customer record includes stripe_account_name
    - expect: Customer is scoped to connected account
    - expect: Customer can be queried by account name

### 7. Error Handling & Edge Cases

**Seed:** `tests/seed/error-seed.spec.ts`

#### 7.1. Missing Stripe API Key

**File:** `tests/errors/missing-api-key.spec.ts`

**Steps:**
  1. Remove or invalidate stripe_sk_key variable
    - expect: Module is not configured
  2. Attempt to create checkout session
    - expect: Error is returned
    - expect: Error message indicates missing API key
    - expect: Transaction is not created or remains in pending state

#### 7.2. Invalid Stripe API Key

**File:** `tests/errors/invalid-api-key.spec.ts`

**Steps:**
  1. Set stripe_sk_key to invalid value
    - expect: Module shows as not configured
  2. Attempt Stripe API call
    - expect: Stripe returns authentication error
    - expect: Error is logged
    - expect: Gateway request shows failure

#### 7.3. Invalid Transaction ID

**File:** `tests/errors/invalid-transaction-id.spec.ts`

**Steps:**
  1. Attempt to retrieve transaction with non-existent ID
    - expect: Transaction is not found
    - expect: Error is handled gracefully
  2. Attempt to create checkout session for invalid transaction
    - expect: Error is returned
    - expect: No Stripe session is created

#### 7.4. Invalid Customer ID

**File:** `tests/errors/invalid-customer-id.spec.ts`

**Steps:**
  1. Attempt to retrieve customer with invalid Stripe customer ID
    - expect: Stripe returns error
    - expect: Error is handled
    - expect: No customer record is created

#### 7.5. Refund Exceeds Charge Amount

**File:** `tests/errors/refund-exceeds-amount.spec.ts`

**Steps:**
  1. Create charge for $50
    - expect: Charge succeeds
  2. Attempt to refund $100
    - expect: Refund fails
    - expect: Stripe error indicates refund exceeds charge
    - expect: Error is logged

#### 7.6. Refund Already Refunded Charge

**File:** `tests/errors/double-refund.spec.ts`

**Steps:**
  1. Create and fully refund a charge
    - expect: Charge is fully refunded
  2. Attempt to refund again
    - expect: Refund fails
    - expect: Error indicates charge already refunded

#### 7.7. Invalid Line Items Format

**File:** `tests/errors/invalid-line-items.spec.ts`

**Steps:**
  1. Attempt to create checkout session with malformed line_items
    - expect: Validation error is returned
    - expect: Error specifies line_items format requirements

#### 7.8. Negative Amount

**File:** `tests/errors/negative-amount.spec.ts`

**Steps:**
  1. Attempt to create transaction with negative amount
    - expect: Validation error is returned
    - expect: Error indicates amount must be positive

#### 7.9. Unsupported Currency

**File:** `tests/errors/unsupported-currency.spec.ts`

**Steps:**
  1. Attempt to create checkout session with unsupported currency code
    - expect: Stripe returns error
    - expect: Error indicates currency not supported

#### 7.10. Connected Account Not Found

**File:** `tests/errors/account-not-found.spec.ts`

**Steps:**
  1. Attempt to get onboarding link for non-existent account
    - expect: Error is returned
    - expect: Error indicates account not found

#### 7.11. Webhook Replay Attack Prevention

**File:** `tests/errors/webhook-replay.spec.ts`

**Steps:**
  1. Send valid webhook
    - expect: Webhook is processed
  2. Replay same webhook payload with same timestamp
    - expect: Webhook signature validation may fail or duplicate processing is prevented
    - expect: Transaction state is idempotent

### 8. Balance & Reporting

**Seed:** `tests/seed/balance-seed.spec.ts`

#### 8.1. Retrieve Balance History

**File:** `tests/balance/retrieve-history.spec.ts`

**Steps:**
  1. Create and process multiple transactions
    - expect: Transactions are completed
  2. Retrieve Stripe balance history
    - expect: Balance transactions are returned
    - expect: Each transaction shows amount, currency, type, and status
    - expect: Transactions are ordered by date

#### 8.2. Balance History with Filters

**File:** `tests/balance/history-with-filters.spec.ts`

**Steps:**
  1. Retrieve balance history filtered by type (charge, refund, payout)
    - expect: Only matching transaction types are returned
  2. Filter by date range
    - expect: Only transactions within date range are returned

#### 8.3. Gateway Requests Logging

**File:** `tests/balance/gateway-requests.spec.ts`

**Steps:**
  1. Perform various Stripe API operations (create charge, refund, checkout session)
    - expect: Each API call is logged in gateway_requests table
    - expect: Request and response are stored
    - expect: Timestamps are recorded
    - expect: Transaction IDs are linked where applicable
  2. Query gateway requests by transaction ID
    - expect: All API calls for transaction are retrieved
    - expect: Requests show complete audit trail

### 9. Module Setup & Configuration

**Seed:** `tests/seed/setup-seed.spec.ts`

#### 9.1. Module Setup Command

**File:** `tests/setup/module-setup.spec.ts`

**Steps:**
  1. Run setup command to initialize module
    - expect: Webhook endpoints are created in Stripe
    - expect: Webhooks are registered for required events (checkout.session.completed, checkout.session.expired, charge.succeeded, charge.failed, charge.pending, setup_intent.succeeded)
    - expect: Webhook secrets are stored

#### 9.2. Check Module Configuration

**File:** `tests/setup/check-configuration.spec.ts`

**Steps:**
  1. Call is_configured helper
    - expect: Returns true when stripe_sk_key is set
    - expect: Returns false when key is missing

#### 9.3. Register Webhook Endpoint

**File:** `tests/setup/register-webhook.spec.ts`

**Steps:**
  1. Create webhook endpoint with specific events
    - expect: Webhook is created in Stripe
    - expect: Webhook ID is returned
    - expect: Enabled events are configured
    - expect: Webhook URL points to instance endpoint

#### 9.4. Delete Webhook Endpoint

**File:** `tests/setup/delete-webhook.spec.ts`

**Steps:**
  1. Create a webhook endpoint
    - expect: Webhook is created
  2. Delete the webhook endpoint
    - expect: Webhook is removed from Stripe
    - expect: Webhook is no longer active

### 10. Integration & End-to-End Flows

**Seed:** `tests/seed/integration-seed.spec.ts`

#### 10.1. Complete Payment Flow

**File:** `tests/integration/complete-payment-flow.spec.ts`

**Steps:**
  1. Create payment transaction
    - expect: Transaction created with status 'new'
  2. Generate Stripe Checkout URL
    - expect: Checkout session is created
    - expect: Transaction status is 'pending'
    - expect: Checkout URL is available
  3. Simulate successful payment webhook (charge.succeeded)
    - expect: Transaction status is updated to 'succeeded'
    - expect: Payment details are captured
    - expect: Transaction is finalized
  4. Verify final transaction state
    - expect: All transaction data is complete
    - expect: Gateway transaction ID is recorded
    - expect: Customer information is captured

#### 10.2. Payment Expiration Flow

**File:** `tests/integration/payment-expiration-flow.spec.ts`

**Steps:**
  1. Create transaction and checkout session
    - expect: Session is created
  2. Simulate session expiration webhook (checkout.session.expired)
    - expect: Transaction status is 'expired'
  3. Create new checkout session for same transaction
    - expect: New session can be created
    - expect: Transaction status returns to 'pending'
    - expect: User can retry payment

#### 10.3. Payment Failure Flow

**File:** `tests/integration/payment-failure-flow.spec.ts`

**Steps:**
  1. Create transaction and checkout session
    - expect: Session is created
  2. Simulate failed payment webhook (charge.failed)
    - expect: Transaction status is 'failed'
    - expect: Failure reason is recorded
  3. Verify user can retry
    - expect: New checkout session can be created
    - expect: Transaction can be updated

#### 10.4. Refund After Payment Flow

**File:** `tests/integration/refund-flow.spec.ts`

**Steps:**
  1. Complete full payment flow
    - expect: Transaction is succeeded
    - expect: Charge ID is recorded
  2. Issue full refund
    - expect: Refund is created in Stripe
    - expect: Refund record is stored
    - expect: Transaction status may update to reflect refund
  3. Verify refund details
    - expect: Refund is linked to transaction
    - expect: Refund amount matches charge amount
    - expect: Refund status is tracked

#### 10.5. Connected Account Payment Flow

**File:** `tests/integration/connected-account-payment.spec.ts`

**Steps:**
  1. Create connected account
    - expect: Account is created
  2. Create transaction scoped to connected account
    - expect: Transaction is created with stripe_account_name
  3. Create checkout session on connected account
    - expect: Session is created on behalf of connected account
    - expect: Funds will be transferred to connected account
  4. Complete payment
    - expect: Payment succeeds
    - expect: Connected account receives funds
    - expect: Platform fee can be collected

#### 10.6. Save Payment Method Flow

**File:** `tests/integration/save-payment-method-flow.spec.ts`

**Steps:**
  1. Create setup intent for saving payment method
    - expect: Setup intent is created
  2. Simulate setup completion webhook (setup_intent.succeeded)
    - expect: Payment method is saved
    - expect: Customer ID is recorded
    - expect: Payment method ID is stored
  3. Use saved payment method for future payment
    - expect: Payment intent can reference saved payment method
    - expect: Customer doesn't need to re-enter card
