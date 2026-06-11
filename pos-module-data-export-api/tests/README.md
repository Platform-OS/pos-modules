# Data Export API E2E Tests

This directory contains Playwright E2E tests for the pos-module-data-export-api module.

## Test Status

This suite intentionally covers only behavior that is explicitly implemented by the module:
- API key authorization
- Export creation
- Export retrieval
- Export deletion
- Lifecycle and response-shape verification

Speculative tests for unsupported payload formats and undocumented response fields were removed.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Deploy test application** (includes core + data_export_api modules):
   ```bash
   bash tests/data/seed/seed.sh staging
   ```

3. **Set the base URL**:

   ```bash
   export MPKIT_URL="https://your-instance.staging.oregon.platform-os.com"
   ```

4. **Recommended: export `MPKIT_TOKEN`**

   If `DATA_EXPORT_API_KEY` is not set, test setup will initialize `_data_export_api_key`
   via GraphQL using `MPKIT_TOKEN` and use that value for the suite.

   ```bash
   export MPKIT_TOKEN="your-pos-api-token"
   ```

5. **Optional: export `DATA_EXPORT_API_KEY` manually**

   If you prefer, set the API key yourself instead of letting setup initialize it:

   Use GraphQL at: `https://your-instance/gui/graphql`
   ```graphql
   mutation {
     variable: constant_set(name: "_data_export_api_key", value: "your-api-key-here") {
       name
         value
      }
     }
   }
   ```

   Then export it:
   ```bash
   export DATA_EXPORT_API_KEY="your-api-key-here"
   ```

6. **Run tests:**
   ```bash
   npm run test
   ```

## Test Structure

- `auth/` - Authentication and authorization tests
- `exports/` - Export creation, retrieval, and deletion tests
- `errors/` - Error handling and edge case tests
- `validation/` - API response structure validation tests
- `helpers/` - Shared helper functions and utilities

## Running Tests

```bash
# Run all tests
npm run test

# Run with UI
npm run test:ui

# Run in headed mode (see browser)
npm run test:headed

# Debug mode
npm run test:debug
```

Run Playwright from within this module directory, not the monorepo root. Each module has its own `playwright.config.ts`, and root-level discovery can mix configs and produce invalid test-loading errors.

## Test Patterns

All tests follow the same structure documented in TEST_PLAN.md:

1. **Authentication Tests** - Verify API key validation
2. **Export CRUD Tests** - Create, read, delete operations
3. **Error Tests** - Edge cases and error handling
4. **Validation Tests** - Response structure verification

## Adding New Tests

To add new tests, follow the existing patterns in the test files. All test scenarios are documented in TEST_PLAN.md.

## Troubleshooting

### "Environment variable not set" Error
Make sure `MPKIT_URL` is exported in your shell. If `DATA_EXPORT_API_KEY` is not set, also export `MPKIT_TOKEN` so setup can initialize `_data_export_api_key` via GraphQL.

### "401 Unauthorized" Errors
- Verify your API key is correct
- Check that the `_data_export_api_key` value exists on the instance
- Ensure the module is deployed

### "404 Not Found" Errors
- Make sure the module is deployed: `pos-cli deploy <env>`
- Verify the API endpoints are accessible: `curl $MPKIT_URL/_api/data-exports`

### Tests Timing Out
- Check instance logs for errors: `pos-cli logs <environment-name>`
- Verify the instance is processing exports normally
