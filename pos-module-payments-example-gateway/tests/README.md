# E2E Tests for Payment Gateway Module

This directory contains end-to-end tests for the `payments_example_gateway` module using Playwright.

## Test Structure

```
tests/
├── post_import/              # Test environment (generated, not committed)
│   ├── app/                  # Test application (committed)
│   │   ├── config.yml
│   │   └── views/
│   │       ├── pages/
│   │       │   ├── test-payment.liquid
│   │       │   └── test-payment-post.liquid
│   │       └── layouts/
│   │           └── application.liquid
│   ├── modules/              # All modules (generated, gitignored)
│   │   ├── core/             # Dependency
│   │   ├── payments/         # Dependency
│   │   └── payments_example_gateway/  # Module under test
│   └── .pos                  # Environment config (generated, gitignored)
├── *.spec.ts                 # Test files (committed)
└── README.md                 # This file
```

## Running Tests

### 1. Setup Test Environment

**For local development (uses source from monorepo):**
```bash
npm run test:setup:local
```

**For CI or external users (downloads from marketplace):**
```bash
npm run test:setup
```

This script:
- Creates `tests/post_import/modules/` directory
- Installs/copies dependency modules (core, payments)
- Copies the source module (payments_example_gateway)
- Copies `.pos` configuration

### 2. Deploy Test Environment

```bash
npm run test:deploy
```

This deploys the test application (including all modules) to your platformOS instance.

### 3. Run Tests

```bash
npm run pw-tests
```

## Complete Workflow

```bash
# One-time setup
npm install

# For each test run
npm run test:setup:local   # or test:setup for marketplace mode
npm run test:deploy
npm run pw-tests
```

## Clean Up

To remove generated files and start fresh:

```bash
npm run test:clean
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
- Seed test

## Environment Variables

Required environment variables:

- `MPKIT_URL` - Base URL of your platformOS instance
- `E2E_TEST_PASSWORD` - Password for test users (if authentication is added)

## CI Integration

For CI pipelines, use marketplace mode:

```yaml
- run: npm run test:setup
- run: npm run test:deploy
- run: npm run pw-tests
```

## Notes

- The test application (`tests/post_import/app/`) is committed to git
- Dependency modules (`tests/post_import/modules/`) are generated and gitignored
- Source module is always copied from `modules/payments_example_gateway/` at the root
- In local mode, dependency modules are copied from sibling directories in the monorepo
- In marketplace mode, dependency modules are downloaded via `pos-cli modules install`
