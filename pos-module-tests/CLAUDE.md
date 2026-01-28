# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the platformOS Tests Module - a testing framework for writing and running tests in Liquid on platformOS. It provides assertions, test runners, and email testing capabilities.

## Development Commands

```bash
# Deploy to staging
pos-cli deploy staging

# Sync changes in real-time during development
pos-cli sync staging

# View logs
pos-cli logs staging

# Run tests
pos-cli test run staging <TEST FILENAME>
```

## Running Tests

Tests are accessed via browser at `/_tests` endpoint on your deployed instance. The test runner only works in `staging` or `development` environments.

- View all tests: `/_tests`
- View sent mails: `/_tests/sent_mails`
- Run with text format: `/_tests/run?formatter=text`

## Architecture

### Module Structure

```
modules/tests/
├── public/
│   ├── graphql/          # GraphQL queries for test files and sent mails
│   ├── lib/
│   │   ├── assertions/   # Test assertion functions
│   │   ├── commands/     # Main test runner (run.liquid)
│   │   ├── helpers/      # Helper functions (register_error.liquid)
│   │   └── queries/      # Query wrappers for sent mails
│   ├── translations/     # i18n strings for assertion messages
│   └── views/
│       ├── layouts/      # Test and mailer layouts
│       ├── pages/        # Test runner endpoints (/_tests/*)
│       └── partials/     # HTML/text formatters for test output
└── template-values.json  # Module metadata
```

### Writing Tests

Test files go in `app/lib/tests/` with `_test.liquid` suffix. Each test must call at least one assertion:

```liquid
{% liquid
  assign data = '{ "foo": "bar" }' | parse_json
  function object = 'some_command', object: data

  function contract = 'modules/tests/assertions/equal', contract: contract, given: object.foo, expected: 'bar', field_name: 'foo'
%}
```

### Available Assertions

All assertions take `contract` and `field_name` parameters and return the updated contract:

- `assertions/equal` - `given`, `expected` params
- `assertions/blank` - checks value is blank
- `assertions/presence` / `assertions/not_presence` - checks value exists
- `assertions/valid_object` / `assertions/not_valid_object` / `assertions/invalid_object` - checks `object.valid`
- `assertions/object_contains_object` - checks object containment
- `assertions/true` / `assertions/not_true` - boolean checks

### Custom Assertions

Register errors manually using the helper:

```liquid
function contract = 'modules/tests/helpers/register_error', contract: contract, field_name: field_name, message: 'error message'
```

### Test Contract Structure

Tests use a contract object that tracks results:
```json
{ "errors": {}, "success": true, "total": 0 }
```

The test runner (`commands/run.liquid`) discovers tests via GraphQL, executes each test file, aggregates results, and returns HTTP 500 if any errors occur.
