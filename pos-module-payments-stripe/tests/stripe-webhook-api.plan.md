# Stripe Payments Module - Webhook API Test Plan

## Application Overview

This test plan provides comprehensive API test coverage for the pos-module-payments-stripe webhook endpoints. The module exposes three webhook endpoints that can be tested directly without requiring additional test infrastructure:

1. `/payments/stripe/webhooks` - Handles standard Stripe events (charge.succeeded, charge.pending, charge.failed, checkout.session.expired, setup_intent.succeeded)
2. `/payments/stripe/webhooks_connect` - Handles Stripe Connect events (payout.paid, account.updated)
3. `/payments/stripe/checkout_session_completed_webhook` - Handles checkout.session.completed events

**Testing Approach:**
All tests use Playwright's request context to send HTTP POST requests directly to webhook endpoints. Tests verify:
- Webhook signature validation (valid/invalid signatures)
- Event processing logic for different event types
- Transaction status updates after webhook processing
- Error handling (missing signatures, invalid payloads, non-existent transactions)
- Idempotency (duplicate webhook handling)
- Multi-tenant routing (webhooks from different hosts)

**Key Constraints:**
- Tests work against deployed module without modification
- No test pages or helper endpoints required
- Tests use GraphQL queries to verify transaction state changes
- Webhook signatures must be generated correctly using HMAC-SHA256

**Prerequisites:**
- Module deployed to platformOS instance
- Stripe API key configured (stripe_sk_key variable)
- Webhook endpoints registered in Stripe
- Test environment URL set in MPKIT_URL environment variable

## Test Scenarios

### 1. Webhook Signature Validation

**Seed:** `N/A - No seed required`

#### 1.1. Valid webhook signature is accepted

**File:** `tests/webhooks/valid-signature.spec.ts`

**Steps:**
  1. Generate a valid Stripe webhook payload for charge.succeeded event with correct HMAC-SHA256 signature
    - expect: Webhook signature header (Stripe-Signature) is correctly formatted
    - expect: Timestamp and signature components are present
    - expect: HMAC signature matches the webhook secret
  2. POST the signed webhook to /payments/stripe/webhooks endpoint
    - expect: Response status is 200 (webhook accepted)
    - expect: Webhook validation passes
    - expect: Event is processed by the appropriate handler

#### 1.2. Invalid webhook signature is rejected

**File:** `tests/webhooks/invalid-signature.spec.ts`

**Steps:**
  1. Generate a webhook payload with incorrect or tampered signature
    - expect: Signature does not match expected HMAC-SHA256 hash
  2. POST the webhook to /payments/stripe/webhooks endpoint
    - expect: Response status is 403 (Forbidden)
    - expect: Error is logged indicating invalid webhook signature
    - expect: Event is NOT processed
    - expect: No transaction status changes occur

#### 1.3. Missing webhook signature is rejected

**File:** `tests/webhooks/missing-signature.spec.ts`

**Steps:**
  1. Send a webhook request without Stripe-Signature header
    - expect: Request has no signature header present
  2. POST to /payments/stripe/webhooks endpoint
    - expect: Response status is 403 (Forbidden)
    - expect: Validation fails due to missing signature
    - expect: Event is rejected and not processed

#### 1.4. Webhook endpoint not registered is rejected

**File:** `tests/webhooks/endpoint-not-registered.spec.ts`

**Steps:**
  1. Query GraphQL to verify no webhook_endpoint record exists for a specific URL
    - expect: GraphQL query returns no webhook_endpoint records
    - expect: Webhook secret is not available for signature validation
  2. Send webhook to unregistered endpoint path
    - expect: Response status is 403 (Forbidden)
    - expect: Error logged: webhook_endpoint NOT FOUND
    - expect: Webhook is rejected

### 2. Charge Event Webhooks

**Seed:** `N/A - No seed required`

#### 2.1. charge.succeeded webhook updates transaction to succeeded

**File:** `tests/webhooks/charge-succeeded.spec.ts`

**Steps:**
  1. Create a test transaction via GraphQL with status 'pending' and gateway 'stripe'
    - expect: Transaction is created successfully
    - expect: Transaction ID is returned
    - expect: Initial status is 'pending'
    - expect: Gateway is set to 'stripe'
  2. Generate charge.succeeded webhook payload with transaction metadata (metadata.transaction_id = transaction_id, metadata.host = current_host)
    - expect: Webhook payload includes charge object with status 'succeeded'
    - expect: Metadata contains transaction_id
    - expect: Metadata contains host for routing
  3. Sign and POST webhook to /payments/stripe/webhooks
    - expect: Response status is 200
    - expect: Webhook is processed successfully
    - expect: Response body confirms transaction update
  4. Query transaction via GraphQL to verify status change
    - expect: Transaction status is now 'succeeded'
    - expect: Gateway transaction ID (charge ID) is recorded
    - expect: Gateway request is logged in gateway_requests table
    - expect: Transaction is marked as finalized
    - expect: Status history includes status change record

#### 2.2. charge.failed webhook updates transaction to failed

**File:** `tests/webhooks/charge-failed.spec.ts`

**Steps:**
  1. Create test transaction with status 'pending'
    - expect: Transaction is created with pending status
  2. Send charge.failed webhook with transaction metadata and failure reason
    - expect: Webhook payload includes charge status 'failed'
    - expect: Failure code and message are included
  3. POST signed webhook to endpoint
    - expect: Response status is 200
    - expect: Webhook is accepted and processed
  4. Verify transaction status via GraphQL
    - expect: Transaction status is 'failed'
    - expect: Failure reason is recorded
    - expect: Gateway request logs the failed charge attempt
    - expect: User can create new checkout session to retry

#### 2.3. charge.pending webhook updates transaction to pending

**File:** `tests/webhooks/charge-pending.spec.ts`

**Steps:**
  1. Create test transaction with status 'new'
    - expect: Transaction exists with new status
  2. Send charge.pending webhook (for async payment methods like ACH)
    - expect: Webhook includes charge with status 'pending'
  3. POST webhook to endpoint
    - expect: Response status is 200
    - expect: Transaction status is updated to 'pending'
    - expect: Transaction awaits final settlement
    - expect: Gateway request is logged

#### 2.4. charge webhook for non-existent transaction returns error

**File:** `tests/webhooks/charge-transaction-not-found.spec.ts`

**Steps:**
  1. Generate charge.succeeded webhook with non-existent transaction_id in metadata
    - expect: Metadata contains invalid/fake transaction ID
    - expect: Metadata host matches current instance
  2. POST signed webhook to endpoint
    - expect: Response status is 500 (Internal Server Error)
    - expect: Response body: 'Transaction not found'
    - expect: Error is logged with webhook payload details
    - expect: No transaction is modified

#### 2.5. charge webhook from different host returns 202

**File:** `tests/webhooks/charge-different-host.spec.ts`

**Steps:**
  1. Create test transaction on current instance
    - expect: Transaction exists
  2. Send charge webhook with metadata.host pointing to different domain (not current instance)
    - expect: Metadata host does not match context.location.host
  3. POST webhook to endpoint
    - expect: Response status is 202 (Accepted)
    - expect: Response body: 'Transaction is from a different host'
    - expect: Transaction is NOT modified
    - expect: Allows multi-tenant webhook routing

#### 2.6. duplicate charge.succeeded webhook is idempotent

**File:** `tests/webhooks/charge-idempotent.spec.ts`

**Steps:**
  1. Create transaction and send charge.succeeded webhook
    - expect: First webhook processes successfully
    - expect: Transaction status is 'succeeded'
  2. Send identical charge.succeeded webhook again
    - expect: Response status is 202
    - expect: Response body: 'Transaction already completed'
    - expect: Transaction status remains 'succeeded' (unchanged)
    - expect: Duplicate processing is prevented
    - expect: Idempotency is maintained

#### 2.7. charge webhook using gateway_transaction_id instead of metadata

**File:** `tests/webhooks/charge-gateway-id-lookup.spec.ts`

**Steps:**
  1. Create transaction with gateway_transaction_id set to Stripe charge ID
    - expect: Transaction has gateway_transaction_id populated
  2. Send charge webhook WITHOUT metadata.transaction_id but with charge.id matching gateway_transaction_id
    - expect: Webhook contains data.object.id matching the charge ID
  3. POST webhook to endpoint
    - expect: Transaction is found by gateway_transaction_id lookup
    - expect: Response status is 200
    - expect: Transaction status is updated correctly
    - expect: Fallback lookup mechanism works

### 3. Checkout Session Webhooks

**Seed:** `N/A - No seed required`

#### 3.1. checkout.session.expired webhook updates transaction to expired

**File:** `tests/webhooks/session-expired.spec.ts`

**Steps:**
  1. Create transaction with checkout session ID as gateway_transaction_id
    - expect: Transaction exists with pending status
    - expect: Gateway transaction ID is Stripe session ID
  2. Send checkout.session.expired webhook with session ID and success_url containing current host
    - expect: Webhook data.object.id is the session ID
    - expect: Webhook data.object.success_url contains instance domain
  3. POST signed webhook to /payments/stripe/webhooks
    - expect: Response status is 200
    - expect: Transaction status is updated to 'expired'
    - expect: User can create new checkout session to retry payment

#### 3.2. session.expired webhook for non-existent transaction returns error

**File:** `tests/webhooks/session-expired-not-found.spec.ts`

**Steps:**
  1. Send checkout.session.expired webhook with non-existent session ID and success_url matching current host
    - expect: Session ID does not match any transaction
    - expect: Success URL indicates payment was initiated on this instance
  2. POST webhook to endpoint
    - expect: Response status is 500
    - expect: Response body: 'Transaction not found'
    - expect: Error is logged

#### 3.3. session.expired webhook from different host returns 202

**File:** `tests/webhooks/session-expired-different-host.spec.ts`

**Steps:**
  1. Send checkout.session.expired webhook with success_url pointing to different domain
    - expect: Success URL does not contain current instance host
  2. POST webhook to endpoint
    - expect: Response status is 202
    - expect: Response body: 'Transaction is from a different host'
    - expect: No transaction is modified

#### 3.4. checkout.session.completed webhook completes transaction

**File:** `tests/webhooks/session-completed.spec.ts`

**Steps:**
  1. Create transaction with checkout session ID
    - expect: Transaction exists with pending status
  2. Send checkout.session.completed webhook to /payments/stripe/checkout_session_completed_webhook with payment_status: 'paid'
    - expect: Webhook data.object.payment_status is 'paid'
    - expect: Webhook data.object.success_url contains current host
    - expect: Webhook contains session ID matching transaction
  3. POST signed webhook to endpoint
    - expect: Response status is 200 (or appropriate success status)
    - expect: Transaction status is updated to 'succeeded'
    - expect: Customer information is captured
    - expect: Payment method is recorded
    - expect: Gateway request is logged

#### 3.5. session.completed webhook from different host returns 202

**File:** `tests/webhooks/session-completed-different-host.spec.ts`

**Steps:**
  1. Send checkout.session.completed webhook with success_url not matching current instance
    - expect: Success URL points to different domain
  2. POST webhook to /payments/stripe/checkout_session_completed_webhook
    - expect: Response status is 202
    - expect: Response body: 'Transaction from different host'
    - expect: Transaction is not modified

#### 3.6. session.completed webhook for non-existent transaction with wrong host is accepted

**File:** `tests/webhooks/session-completed-not-found-wrong-host.spec.ts`

**Steps:**
  1. Send checkout.session.completed webhook with non-existent transaction_id but success_url from different host
    - expect: Transaction does not exist
    - expect: Success URL indicates payment from different instance
  2. POST webhook to endpoint
    - expect: Response status is 202 (not 500)
    - expect: Webhook is accepted gracefully
    - expect: No error is logged (or only WARNING level)
    - expect: Prevents false errors in multi-tenant setup

#### 3.7. session.completed webhook for non-existent transaction with current host returns 500

**File:** `tests/webhooks/session-completed-not-found-current-host.spec.ts`

**Steps:**
  1. Send checkout.session.completed webhook with non-existent transaction_id but success_url matching current host
    - expect: Transaction does not exist
    - expect: Success URL indicates payment from this instance
  2. POST webhook to endpoint
    - expect: Response status is 500
    - expect: Error is logged at ERROR level
    - expect: Response indicates transaction not found
    - expect: Alerts to genuine problem on this instance

### 4. Setup Intent Webhooks

**Seed:** `N/A - No seed required`

#### 4.1. setup_intent.succeeded webhook saves payment method

**File:** `tests/webhooks/setup-intent-succeeded.spec.ts`

**Steps:**
  1. Create a setup_intent record via GraphQL with reference_id and gateway_id (Stripe setup intent ID)
    - expect: Setup intent record is created
    - expect: Record has gateway_id (seti_xxx)
    - expect: Reference_id links to application entity
  2. Send setup_intent.succeeded webhook with setup intent ID and payment method details
    - expect: Webhook data.object.id matches setup intent gateway_id
    - expect: Webhook includes payment_method ID
    - expect: Webhook includes customer ID
  3. POST signed webhook to /payments/stripe/webhooks
    - expect: Response status is 200
    - expect: Setup intent status is updated to 'succeeded'
    - expect: Payment method is saved
    - expect: Customer ID is recorded
    - expect: Event is published for application logic to handle

#### 4.2. setup_intent webhook for non-existent intent is handled gracefully

**File:** `tests/webhooks/setup-intent-not-found.spec.ts`

**Steps:**
  1. Send setup_intent.succeeded webhook with non-existent setup intent ID
    - expect: Setup intent ID does not match any database record
  2. POST webhook to endpoint
    - expect: Webhook is accepted (status 200 or 202)
    - expect: Error is handled gracefully
    - expect: No crash or 500 error occurs

### 5. Connected Account Webhooks

**Seed:** `N/A - No seed required`

#### 5.1. account.updated webhook updates connected account state

**File:** `tests/webhooks/account-updated.spec.ts`

**Steps:**
  1. Create a connected_account record via GraphQL with account_id (Stripe acct_xxx) and reference_id
    - expect: Connected account record exists
    - expect: Account has Stripe account ID
    - expect: Reference ID links to application entity
  2. Send account.updated webhook to /payments/stripe/webhooks_connect with updated account details
    - expect: Webhook data.object.id matches connected account ID
    - expect: Webhook contains updated account state
    - expect: Webhook includes capabilities and requirements
  3. POST signed webhook to endpoint
    - expect: Response status is 200
    - expect: Connected account record is updated
    - expect: Account state reflects latest information
    - expect: Account capabilities are tracked
    - expect: Requirements/errors are updated

#### 5.2. payout.paid webhook records payout event

**File:** `tests/webhooks/payout-paid.spec.ts`

**Steps:**
  1. Create connected_account record
    - expect: Connected account exists with Stripe account ID
  2. Send payout.paid webhook to /payments/stripe/webhooks_connect with payout details
    - expect: Webhook data.object.id is payout ID
    - expect: Webhook includes amount, currency, arrival_date
    - expect: Webhook is associated with connected account
  3. POST signed webhook to endpoint
    - expect: Response status is 200
    - expect: Payout record is created or updated in payouts table
    - expect: Payout event is published
    - expect: Payout status is tracked
    - expect: Application can react to payout completion

#### 5.3. connected account webhook signature validation

**File:** `tests/webhooks/connected-account-signature.spec.ts`

**Steps:**
  1. Send webhook to /payments/stripe/webhooks_connect with invalid signature
    - expect: Signature does not match webhook secret
  2. POST webhook to endpoint
    - expect: Response status is 403
    - expect: Webhook is rejected
    - expect: No account data is modified

#### 5.4. connected account webhook with stripe_account_name parameter

**File:** `tests/webhooks/connected-account-named.spec.ts`

**Steps:**
  1. Create connected account with specific stripe_account_name
    - expect: Account record includes stripe_account_name property
    - expect: Allows multi-account support
  2. Send webhook to /payments/stripe/webhooks_connect/:stripe_account_name path
    - expect: URL includes stripe_account_name parameter
    - expect: Webhook is scoped to specific account
  3. POST signed webhook to endpoint
    - expect: Webhook validates against correct account secret
    - expect: Correct account record is updated
    - expect: Account isolation is maintained

### 6. Webhook Error Handling

**Seed:** `N/A - No seed required`

#### 6.1. Malformed webhook payload is rejected

**File:** `tests/webhooks/malformed-payload.spec.ts`

**Steps:**
  1. Send webhook with invalid JSON payload
    - expect: Payload is not valid JSON or missing required fields
  2. POST to webhook endpoint
    - expect: Response indicates error (4xx or 5xx)
    - expect: Error is logged
    - expect: No transaction is modified

#### 6.2. Webhook with missing event type is rejected

**File:** `tests/webhooks/missing-event-type.spec.ts`

**Steps:**
  1. Send webhook payload without 'type' field
    - expect: Webhook JSON does not include type property
  2. POST signed webhook to /payments/stripe/webhooks
    - expect: Webhook passes signature validation but fails routing
    - expect: No event handler is invoked
    - expect: Response indicates error or returns gracefully

#### 6.3. Webhook with unsupported event type is ignored

**File:** `tests/webhooks/unsupported-event.spec.ts`

**Steps:**
  1. Send webhook with event type not handled by module (e.g., 'invoice.created')
    - expect: Event type is not in the case statement handlers
  2. POST signed webhook to endpoint
    - expect: Webhook passes signature validation
    - expect: No handler processes the event
    - expect: Response status is 200 (accepted but ignored)
    - expect: No error is logged
    - expect: Allows Stripe to send all events to one endpoint

#### 6.4. Webhook timestamp too old is rejected

**File:** `tests/webhooks/old-timestamp.spec.ts`

**Steps:**
  1. Generate webhook with timestamp older than 5 minutes (Stripe's tolerance)
    - expect: Timestamp in signature is significantly in the past
  2. POST webhook to endpoint
    - expect: Signature validation may fail due to timestamp
    - expect: Prevents replay attacks with old webhooks
    - expect: Response status is 403 or error

#### 6.5. Concurrent webhooks for same transaction are handled safely

**File:** `tests/webhooks/concurrent-webhooks.spec.ts`

**Steps:**
  1. Create test transaction with pending status
    - expect: Transaction exists
  2. Send two identical charge.succeeded webhooks simultaneously
    - expect: Both webhooks have same payload and signature
    - expect: Requests arrive at nearly the same time
  3. Verify both webhook responses
    - expect: First webhook returns 200 and updates transaction
    - expect: Second webhook returns 202 (already completed)
    - expect: Transaction is in succeeded state exactly once
    - expect: No race condition or duplicate processing occurs

### 7. GraphQL Query Verification

**Seed:** `N/A - No seed required`

#### 7.1. Query transaction by ID after webhook processing

**File:** `tests/graphql/query-transaction-by-id.spec.ts`

**Steps:**
  1. Create transaction and process charge.succeeded webhook
    - expect: Transaction is updated to succeeded status
  2. Execute GraphQL query: transactions/search with id parameter
    - expect: Transaction is retrieved by ID
    - expect: Status field shows 'succeeded'
    - expect: Gateway transaction ID is populated
    - expect: All transaction properties are present

#### 7.2. Query transaction with gateway_requests included

**File:** `tests/graphql/query-with-gateway-requests.spec.ts`

**Steps:**
  1. Process webhook that logs gateway request
    - expect: Gateway request record is created
  2. Execute GraphQL query with with_gateway_requests: true
    - expect: Transaction includes related gateway_requests array
    - expect: Gateway request shows request_url, request_data, response_body
    - expect: API call audit trail is complete
    - expect: Webhook processing is logged

#### 7.3. Query transaction with status history

**File:** `tests/graphql/query-with-status-history.spec.ts`

**Steps:**
  1. Create transaction and update status multiple times via webhooks (pending -> succeeded)
    - expect: Transaction has multiple status changes
  2. Execute GraphQL query with with_statuses: true
    - expect: Transaction includes statuses array
    - expect: Each status change has timestamp
    - expect: Status history is ordered chronologically
    - expect: Shows complete audit trail of status transitions

#### 7.4. Query transactions by gateway_transaction_id

**File:** `tests/graphql/query-by-gateway-id.spec.ts`

**Steps:**
  1. Create transaction with specific gateway_transaction_id (Stripe charge or session ID)
    - expect: Transaction has gateway_transaction_id populated
  2. Execute GraphQL query with gateway_transaction_id parameter
    - expect: Transaction is found using Stripe ID
    - expect: Allows lookup by external gateway identifier
    - expect: Useful for webhook processing and reconciliation

#### 7.5. Query transactions by multiple gateway_transaction_ids

**File:** `tests/graphql/query-by-multiple-gateway-ids.spec.ts`

**Steps:**
  1. Create multiple transactions with different gateway IDs
    - expect: Multiple transactions exist with unique gateway IDs
  2. Execute GraphQL query with gateway_transaction_ids array parameter
    - expect: All matching transactions are returned
    - expect: Supports batch lookup
    - expect: Used by webhook handlers to find transactions

#### 7.6. Query transactions filtered by status

**File:** `tests/graphql/query-by-status.spec.ts`

**Steps:**
  1. Create transactions with different statuses (new, pending, succeeded, failed, expired)
    - expect: Transactions exist in various states
  2. Execute GraphQL query with c__status parameter set to 'succeeded'
    - expect: Only succeeded transactions are returned
    - expect: Filtering works correctly
    - expect: Enables status-based reporting

#### 7.7. Query transactions with stripe_account_name filter

**File:** `tests/graphql/query-by-account-name.spec.ts`

**Steps:**
  1. Create transactions associated with specific stripe_account_name
    - expect: Transactions have stripe_account_name property set
  2. Execute GraphQL query with stripe_account_name parameter
    - expect: Only transactions for specified account are returned
    - expect: Multi-account isolation works
    - expect: Supports marketplace/platform scenarios

#### 7.8. Query webhook_endpoints by URL

**File:** `tests/graphql/query-webhook-endpoints.spec.ts`

**Steps:**
  1. Create webhook_endpoint record via GraphQL with specific URL and secret
    - expect: Webhook endpoint record exists
    - expect: Secret is stored for signature validation
  2. Execute GraphQL query: webhook_endpoints/search with url parameter
    - expect: Webhook endpoint is retrieved by URL
    - expect: Properties include secret for HMAC validation
    - expect: Used by webhook signature validation logic

#### 7.9. Count transactions via GraphQL

**File:** `tests/graphql/count-transactions.spec.ts`

**Steps:**
  1. Create multiple transactions
    - expect: Several transaction records exist
  2. Execute GraphQL query: transactions/count with optional filters
    - expect: Total count of transactions is returned
    - expect: Count can be filtered by status, gateway, date range
    - expect: Enables reporting and analytics

### 8. Integration Scenarios

**Seed:** `N/A - No seed required`

#### 8.1. Complete payment flow via webhooks

**File:** `tests/integration/complete-payment-flow.spec.ts`

**Steps:**
  1. Create transaction with status 'new' via GraphQL
    - expect: Transaction ID is returned
    - expect: Initial status is 'new'
  2. Simulate checkout session creation by updating transaction with gateway_transaction_id (session ID) and status 'pending'
    - expect: Transaction status is 'pending'
    - expect: Gateway transaction ID is set
  3. Send charge.succeeded webhook with transaction metadata
    - expect: Webhook is accepted (status 200)
    - expect: Transaction status is updated to 'succeeded'
  4. Query final transaction state via GraphQL
    - expect: Transaction status is 'succeeded'
    - expect: Gateway transaction ID contains charge ID
    - expect: Status history shows: new -> pending -> succeeded
    - expect: Transaction is marked as finalized
    - expect: Complete payment lifecycle is verified

#### 8.2. Payment expiration and retry flow

**File:** `tests/integration/expiration-retry-flow.spec.ts`

**Steps:**
  1. Create transaction with checkout session
    - expect: Transaction has pending status and session ID
  2. Send checkout.session.expired webhook
    - expect: Transaction status is updated to 'expired'
    - expect: Session is no longer usable
  3. Update transaction with new gateway_transaction_id (new session) and status 'pending'
    - expect: Transaction can be retried
    - expect: New session ID is recorded
    - expect: Status returns to 'pending'
  4. Send charge.succeeded webhook for new session
    - expect: Payment succeeds on retry
    - expect: Transaction status is 'succeeded'
    - expect: Retry flow is complete

#### 8.3. Payment failure and recovery flow

**File:** `tests/integration/failure-recovery-flow.spec.ts`

**Steps:**
  1. Create transaction and simulate checkout
    - expect: Transaction is pending
  2. Send charge.failed webhook with error details
    - expect: Transaction status is 'failed'
    - expect: Error message is recorded
  3. Create new checkout session (update gateway_transaction_id) and return to pending
    - expect: User can retry payment
    - expect: New session is created
  4. Send charge.succeeded webhook for retry
    - expect: Payment succeeds on second attempt
    - expect: Final status is 'succeeded'
    - expect: Failure and recovery are both tracked

#### 8.4. Multi-event webhook sequence

**File:** `tests/integration/multi-event-sequence.spec.ts`

**Steps:**
  1. Create transaction with pending status
    - expect: Transaction exists
  2. Send charge.pending webhook (for async payment method)
    - expect: Status is 'pending'
    - expect: Payment is being processed
  3. Send charge.succeeded webhook after settlement
    - expect: Status updates to 'succeeded'
    - expect: Payment is complete
  4. Verify status history via GraphQL
    - expect: Status history shows: pending -> succeeded
    - expect: Timestamps show event sequence
    - expect: Complete audit trail exists

#### 8.5. Connected account payment with payout

**File:** `tests/integration/connected-account-payout.spec.ts`

**Steps:**
  1. Create connected_account record
    - expect: Connected account exists with Stripe account ID
  2. Create transaction with stripe_account_name matching connected account
    - expect: Transaction is scoped to connected account
    - expect: Payment will route to connected account
  3. Send charge.succeeded webhook for connected account transaction
    - expect: Transaction succeeds
    - expect: Funds are allocated to connected account
  4. Send payout.paid webhook to /payments/stripe/webhooks_connect
    - expect: Payout record is created
    - expect: Payout event is published
    - expect: Complete marketplace payment flow is verified

#### 8.6. Setup intent to payment flow

**File:** `tests/integration/setup-intent-to-payment.spec.ts`

**Steps:**
  1. Create setup_intent record for saving payment method
    - expect: Setup intent exists with gateway_id
  2. Send setup_intent.succeeded webhook
    - expect: Payment method is saved
    - expect: Customer ID is recorded
    - expect: Payment method ID is stored
  3. Create transaction referencing saved payment method
    - expect: Transaction uses saved payment method
    - expect: Customer doesn't re-enter card details
  4. Send charge.succeeded webhook
    - expect: Payment succeeds using saved method
    - expect: Complete save-and-pay flow works
