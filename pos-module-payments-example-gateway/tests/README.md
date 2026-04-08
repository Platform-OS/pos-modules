# E2E Tests for Payment Gateway Module

This directory contains end-to-end tests for the `payments_example_gateway` module using Playwright.

## Running Tests

```bash
npm run pw-tests
```

## Test Coverage

- Payment page loads successfully
- Successful payment flow end-to-end
- Failed payment flow end-to-end
- Delayed payment success flow
- Invalid transaction handling (404)
- Missing transaction_id handling (404)
- Multiple payment attempts on same transaction
- URL parameters preservation in redirect flow
