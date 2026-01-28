# platformOS Tests Module

The platformOS Tests Module provides a testing framework for writing and running tests in Liquid on platformOS. It includes assertions, test runners, and email testing capabilities.

> [!NOTE]
> The test runner only works in `staging` or `development` environments for security reasons.

## Installation

The platformOS Tests Module is available on the [Partner Portal Modules Marketplace](https://partners.platformos.com/marketplace/pos_modules/130).

### Prerequisites

- [pos-cli](https://github.com/mdyd-dev/pos-cli#overview) installed
- A platformOS instance (staging or development environment)

### Installation Steps

1. Navigate to your project directory where you want to install the Tests Module.

2. Run the installation command:

```bash
pos-cli modules install tests
```

3. Download the module files:

```bash
pos-cli modules download tests
```

4. Deploy to your instance:

```bash
pos-cli deploy staging
```

This command installs the Tests Module and updates or creates the `app/pos-modules.json` file in your project directory to track module configurations.

## Endpoints

The module exposes the following endpoints:

| Endpoint | Formats | Parameters | Description |
|----------|---------|------------|-------------|
| `/_tests` | html, js | `name` | Lists all available test files |
| `/_tests/run` | html, js | `formatter`, `name` | Runs tests and returns results |
| `/_tests/run_async` | html, js | | Runs tests asynchronously in background, returns test identifier |
| `/_tests/sent_mails` | html | `page` | Lists all sent emails (paginated) |
| `/_tests/sent_mails/:id` | html | | Shows details of a specific sent email |

### Format Extensions

Append the format extension to the endpoint URL:
- `.html` (default) - HTML formatted output
- `.js` - JSON formatted output

Example: `/_tests/run.js` returns JSON results.

**JSON response for `/_tests.js`:**

```json
[
  {
    "name": "test/examples/assertions_test",
    "url": "/_tests/run.js?name=test/examples/assertions_test"
  }
]
```

### Parameters for `/_tests/run`

| Parameter | Description |
|-----------|-------------|
| `formatter` | Output format: `text` or `html` (default) |
| `name` | Run a specific test by its partial path |

**Running a specific test:**

The `name` parameter accepts the path to partial with test relative to `app/lib/` including the `_test` suffix but without the `.liquid` extension.

For example, to run `app/lib/test/examples/assertions_test.liquid`:
```
/_tests/run?name=test/examples/assertions_test
```

, and to run `modules/my_module/public/lib/test/examples/assertions_test.liquid`:
```
/_tests/run?name=modules/my_module/test/examples/assertions_test
```

**Running via curl:**

```bash
# Run all tests and get JSON response
curl https://your-instance.staging.oregon.platform-os.com/_tests/run.js

# Run a specific test
curl "https://your-instance.staging.oregon.platform-os.com/_tests/run.js?name=test/examples/assertions_test"

# List all available tests as JSON
curl https://your-instance.staging.oregon.platform-os.com/_tests.js
```

## Writing Tests

Test files should be placed in `app/lib/test/` directory with `_test.liquid` suffix.

Example: `app/lib/test/user_create_test.liquid`

Every test should call at least one assertion. The test contract is passed through assertions and tracks results:

```liquid
{% liquid
  assign data = '{ "email": "test@example.com" }' | parse_json
  function result = 'commands/users/create', object: data

  function contract = 'modules/tests/assertions/valid_object', contract: contract, object: result, field_name: 'user_create'
  function contract = 'modules/tests/assertions/equal', contract: contract, given: result.email, expected: 'test@example.com', field_name: 'email'
%}
```

## Assertions

All assertions take a `contract` parameter (the test contract object) and `field_name` parameter (snake_case identifier for the assertion). They return the updated contract.

### equal

Checks if `given` value equals `expected` value.

**Parameters:** `contract`, `field_name`, `given`, `expected`

```liquid
{% liquid
  function contract = 'modules/tests/assertions/equal', contract: contract, given: user.name, expected: 'John', field_name: 'user_name'
%}
```

### blank

Checks if the field value in the object is blank.

**Parameters:** `contract`, `field_name`, `object`

```liquid
{% liquid
  assign result = '{ "error": null }' | parse_json
  function contract = 'modules/tests/assertions/blank', contract: contract, object: result, field_name: 'error'
%}
```

### presence

Checks if the field value in the object is present (not blank).

**Parameters:** `contract`, `field_name`, `object`

```liquid
{% liquid
  assign user = '{ "id": "123", "name": "John" }' | parse_json
  function contract = 'modules/tests/assertions/presence', contract: contract, object: user, field_name: 'id'
%}
```

### not_presence

Checks if the field value in the object is not present (is blank).

**Parameters:** `contract`, `field_name`, `object`

```liquid
{% liquid
  assign result = '{ "deleted_at": null }' | parse_json
  function contract = 'modules/tests/assertions/not_presence', contract: contract, object: result, field_name: 'deleted_at'
%}
```

### valid_object

Checks if `object.valid` is `true`. Useful for validating command results.

**Parameters:** `contract`, `field_name`, `object`

```liquid
{% liquid
  function result = 'commands/users/create', object: user_data
  function contract = 'modules/tests/assertions/valid_object', contract: contract, object: result, field_name: 'user_create'
%}
```

### not_valid_object

Checks if `object.valid` is not `true`.

**Parameters:** `contract`, `field_name`, `object`

```liquid
{% liquid
  assign invalid_data = '{ "email": "" }' | parse_json
  function result = 'commands/users/create', object: invalid_data
  function contract = 'modules/tests/assertions/not_valid_object', contract: contract, object: result, field_name: 'invalid_user_create'
%}
```

### invalid_object

Checks if `object.valid` is falsy. Similar to `not_valid_object` but checks for falsy value rather than not true.

**Parameters:** `contract`, `field_name`, `object`

```liquid
{% liquid
  assign invalid_data = '{ "email": "invalid" }' | parse_json
  function result = 'commands/users/create', object: invalid_data
  function contract = 'modules/tests/assertions/invalid_object', contract: contract, object: result, field_name: 'should_be_invalid'
%}
```

### object_contains_object

Checks if `given` object contains all key-value pairs from `object_contains`.

**Parameters:** `contract`, `field_name`, `given`, `object_contains`

```liquid
{% liquid
  assign user = '{ "id": "123", "name": "John", "role": "admin" }' | parse_json
  assign expected_values = '{ "name": "John", "role": "admin" }' | parse_json
  function contract = 'modules/tests/assertions/object_contains_object', contract: contract, given: user, object_contains: expected_values, field_name: 'user_attributes'
%}
```

### true

Checks if the value is truthy. Can use either `object[field_name]` or pass `value` directly.

**Parameters:** `contract`, `field_name`, `object` (optional), `value` (optional)

```liquid
{% liquid
  assign result = '{ "active": true }' | parse_json
  function contract = 'modules/tests/assertions/true', contract: contract, object: result, field_name: 'active'

  # Or with direct value:
  assign is_valid = true
  function contract = 'modules/tests/assertions/true', contract: contract, value: is_valid, field_name: 'is_valid'
%}
```

### not_true

Checks if the value is falsy. Can use either `object[field_name]` or pass `value` directly.

**Parameters:** `contract`, `field_name`, `object` (optional), `value` (optional)

```liquid
{% liquid
  assign result = '{ "deleted": false }' | parse_json
  function contract = 'modules/tests/assertions/not_true', contract: contract, object: result, field_name: 'deleted'

  # Or with direct value:
  assign has_errors = false
  function contract = 'modules/tests/assertions/not_true', contract: contract, value: has_errors, field_name: 'has_errors'
%}
```

## Custom Assertions

If the built-in assertions don't cover your use case, you can register errors manually using the helper:

```liquid
{% liquid
  assign actual_count = items | size
  if actual_count < 5
    assign message = 'Expected at least 5 items, got ' | append: actual_count
    function contract = 'modules/tests/helpers/register_error', contract: contract, field_name: 'items_count', message: message
  endif
%}
```

The `register_error` helper accepts:
- `contract` - the test contract object
- `field_name` - identifier for the assertion (snake_case)
- `message` - error message to display
- `key` - (optional) i18n key to resolve into message

## Testing Emails

The module provides endpoints to inspect emails sent during test execution.

### Viewing Sent Emails

Navigate to `/_tests/sent_mails` to see a paginated list of all sent emails.

To view details of a specific email, click on it or navigate to `/_tests/sent_mails/:id`.

### Example: Testing Email Sending

```liquid
{% liquid
  # Trigger an action that sends email
  function result = 'commands/users/send_welcome_email', user_id: user.id
  function contract = 'modules/tests/assertions/valid_object', contract: contract, object: result, field_name: 'send_email'

  # Then check /_tests/sent_mails to verify the email was sent correctly
%}
```

## Running Tests in CI

You can run tests in CI/CD pipelines using the `pos-cli`:

```bash
pos-cli test run staging
```

This command:
- Calls the `/_tests/run_async.js` endpoint to start tests in the background
- Polls the logs for test results
- Exits with code 0 if all tests pass, or non-zero if any tests fail

### Log Types and pos-cli Display

Starting from version 1.2.0, logs generated during test runs use a unique test name as their type, making it easier for pos-cli to identify and display test results.

### Running Specific Tests

```bash
pos-cli test run staging test/user_test
```

## Versioning

This module follows [Semantic Versioning](https://semver.org/).
