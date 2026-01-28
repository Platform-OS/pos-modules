# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **modular monorepo** for platformOS modules. Each `pos-module-*` directory is an independent, self-contained module with its own git history, versioning, and dependencies. Modules are designed as composable building blocks that follow shared architectural patterns while maintaining independence for distribution via the platformOS Partner Portal Marketplace.

## Development Commands

### Common Module Operations

```bash
# Install a module from marketplace
pos-cli modules install <module-name>

# Download module source code locally for development
pos-cli modules download <module-name>

# Deploy to environment
pos-cli deploy <env>

# Real-time sync during development
pos-cli sync <env>

# View instance logs
pos-cli logs <env>

# GraphQL explorer
pos-cli gui serve

# Create migration
pos-cli migrations generate <env> <name>
```

### Module-Specific npm Commands

Most modules with `package.json` support these commands:

```bash
# Versioning (updates CHANGELOG.md automatically)
npm run version              # Prompts for version type

# Testing
npm run pw-tests            # Run Playwright E2E tests
npm run test                # Run Vitest unit tests (core module)
npm run test:ui             # Vitest UI mode

# Building (for modules with webpack)
npm run build               # Production webpack build
npm run build:dev          # Development webpack build

# Deployment
npm run deploy             # Build + deploy to production
npm run deploy:dev        # Build + deploy to staging
```

### Testing with Tests Module

```bash
# Run tests via pos-cli (uses test runner module)
pos-cli test run <env> [test-name]

# Access test UI in browser
# Navigate to: https://your-instance.staging.oregon.platform-os.com/_tests
# View sent emails: /_tests/sent_mails
```

## Architecture

### Modular Monorepo Pattern

Each module is **independently distributable** but shares development infrastructure:

- **Independent**: Own git history, versioning (template-values.json), marketplace distribution
- **Hierarchical**: Complex modules contain `modules/` subdirectory with nested dependency modules
- **Composable**: Modules integrate via hooks, commands, events without modifying source code

### Module Structure Convention

```
pos-module-<name>/
├── modules/
│   └── <machine-name>/          # The actual module (distributed part)
│       ├── public/
│       │   ├── lib/
│       │   │   ├── commands/        # Business logic (Build/Check/Execute pattern)
│       │   │   ├── queries/         # Data access wrappers
│       │   │   ├── hooks/           # Integration hooks (hook_*.liquid)
│       │   │   ├── consumers/       # Event consumers
│       │   │   ├── validations/     # Input validators
│       │   │   └── helpers/         # Utility functions
│       │   ├── graphql/             # GraphQL queries/mutations
│       │   ├── views/
│       │   │   ├── pages/           # Endpoints
│       │   │   ├── partials/        # Reusable components
│       │   │   └── layouts/         # Page templates
│       │   ├── assets/              # CSS, JS, images
│       │   ├── schema/              # Database schema
│       │   ├── translations/        # i18n
│       │   └── api_calls/           # External API templates
│       └── template-values.json      # Module metadata & dependencies
├── app/                             # Example application (NOT distributed)
├── package.json                     # npm scripts for development
└── README.md                        # Module documentation
```

### Core Module (Foundation)

**pos-module-core** is the foundation - all complex modules depend on it. It provides:

- **Hook System**: Implements Open/Closed Principle for extensibility
- **Command Pattern**: 3-stage (Build/Check/Execute) for business logic
- **Event System**: Async communication via activities and consumers
- **Module Registry**: Dependency management and version tracking
- **Utilities**: Email sending, API calls, validators, global variables

### Module Dependency Graph

```
core (no dependencies)
├── user (+ common-styling)
│   ├── oauth (optional integration)
│   └── profile (extends user)
├── chat (+ user, profile, common-styling)
├── reports (+ user, tests)
├── payments
│   └── payments-stripe
├── openai
├── data-export-api
└── instance-portal (+ common-styling)

common-styling (standalone, used by UI modules)
tests (standalone testing framework)
```

## Command Pattern (3-Stage Process)

All modules follow this pattern for business logic:

```liquid
{% liquid
  # 1. BUILD: Normalize input, set defaults, type conversions
  function object = 'commands/<resource>/<action>/build', object: object

  # 2. CHECK: Validate inputs using core validators
  function object = 'commands/<resource>/<action>/check', object: object

  # 3. EXECUTE: Run GraphQL mutation (only if valid)
  if object.valid
    function object = 'commands/<resource>/<action>/execute', object: object
  endif

  return object
%}
```

Commands are located in `lib/commands/<resource>/<action>/` with `build.liquid`, `check.liquid`, `execute.liquid` files.

### Generating Commands

```bash
# Generate single command
pos-cli generate run modules/core/generators/command <resource>/<action>

# Generate full CRUD
pos-cli generate run modules/core/generators/crud <resource> field1:type field2:type --includeViews
```

## Hook System

Hooks enable extensibility without modifying source code:

### Declaring a Hook (Making it Available)

```liquid
{% liquid
  # Fire hook at integration point
  function results = 'modules/core/commands/hook/fire', hook: 'my-hook-name', params: data
%}
```

### Implementing a Hook

Create `lib/hooks/hook_my-hook-name.liquid` (in app/ or module/):

```liquid
{% liquid
  # Hook logic here
  # Access params via params variable

  # MUST return (even if null)
  return result
%}
```

The hook system searches for all files matching `hook_<hook-name>.liquid` pattern and executes them.

### Common Hooks

- `hook_module_info`: Register module with registry (name, version, dependencies)
- `hook_permission`: Contribute permissions for RBAC (user module)
- `hook_headscripts`: Inject CSS/JS into layout head
- `hook_user_create`: React to user creation events

## Event System

Events enable async, loosely-coupled communication:

### Publishing Events

```liquid
{% liquid
  assign event_data = null | hash_merge: foo_id: "123", bar: "value"
  function activity = 'modules/core/commands/events/publish', type: 'something_happened', object: event_data
%}
```

### Consuming Events

Create `lib/consumers/<event_name>/<consumer_name>.liquid`:

```liquid
---
metadata:
  priority: default    # low, default, high
  max_attempts: 9      # Retry count
  delay: 0            # Minutes to delay
---
{% liquid
  # Event data available in 'event' variable
  log event
%}
```

Event types should be past tense (e.g., `user_created`, `payment_succeeded`).

## Module Integration Patterns

### Commands & Queries

```liquid
# Invoke command
function result = 'modules/<module>/commands/<resource>/<action>', param1: value1

# Invoke query
function data = 'modules/<module>/queries/<resource>/search', limit: 20

# Common query patterns:
# - <resource>/search.liquid (multiple results)
# - <resource>/find.liquid (single result)
```

### Module Registry

```liquid
# Check if module exists
function exists = 'modules/core/queries/module/exists', type: 'module'

# List installed modules
function modules = 'modules/core/queries/registry/search', type: 'module'
```

## Naming Conventions

- **Permissions**: `<resource>.<action>` (e.g., `user.create`, `orders.manage.all`)
- **Commands**: `<resource>/<action>` (e.g., `users/create`, `order/cancel`)
- **Queries**: `<resource>/search` or `<resource>/find`
- **Hooks**: `hook_<hook-name>` prefix
- **Events**: `<action>_<resource>` (past tense: `user_created`, `payment_succeeded`)
- **CSS Classes**: `pos-` prefix (e.g., `.pos-button`, `.pos-form`)
- **JavaScript**: `window.pos` namespace

## RBAC Authorization (User Module)

### Built-in Roles

- `anonymous`: Unauthenticated users
- `authenticated`: Any logged-in user
- `superadmin`: Full access to all permissions

### Permission Checking

```liquid
# Get current user profile
function profile = 'modules/user/helpers/current_profile'

# Check permission (returns boolean)
function can = 'modules/user/helpers/can_do', requester: profile, do: 'resource.action'

# Enforce permission (renders 403 if unauthorized)
# platformos-check-disable ConvertIncludeToRender, UnreachableCode
include 'modules/user/helpers/can_do_or_unauthorized', requester: profile, do: 'resource.action'
# platformos-check-enable ConvertIncludeToRender, UnreachableCode
```

### Defining Permissions

Override `modules/user/public/lib/queries/role_permissions/permissions.liquid`:

```liquid
{% parse_json permissions %}
{
  "member": ["articles.create", "comments.create"],
  "moderator": ["comments.manage.all"],
  "admin": ["articles.manage.all", "users.manage"]
}
{% endparse_json %}
{% return permissions %}
```

## Module Override System

To customize a module without forking:

1. Copy file from `modules/<module>/public/` to `app/modules/<module>/public/`
2. Modify the copy - it will take precedence
3. Add module to `modules_that_allow_delete_on_deploy` in `app/config.yml`

```yaml
# app/config.yml
modules_that_allow_delete_on_deploy:
  - core
  - user
```

## Testing

### Writing Tests (Tests Module)

Place tests in `app/lib/test/` with `_test.liquid` suffix:

```liquid
{% liquid
  # Setup test data
  assign data = '{ "email": "test@example.com" }' | parse_json

  # Execute command
  function result = 'commands/users/create', object: data

  # Assertions
  function contract = 'modules/tests/assertions/valid_object', contract: contract, object: result, field_name: 'user_create'
  function contract = 'modules/tests/assertions/equal', contract: contract, given: result.email, expected: 'test@example.com', field_name: 'email'
%}
```

### Available Assertions

- `assertions/equal` - Check value equality
- `assertions/presence` / `assertions/not_presence` - Check field exists
- `assertions/blank` - Check field is blank
- `assertions/valid_object` / `assertions/not_valid_object` - Check object.valid
- `assertions/true` / `assertions/not_true` - Boolean checks
- `assertions/object_contains_object` - Check object containment

### Running Tests

```bash
# Via pos-cli
pos-cli test run staging [test-name]

# Via browser
# https://instance.staging.oregon.platform-os.com/_tests
```

## Key Technology Stack

- **Liquid**: Server-side templating for all business logic
- **GraphQL**: Data queries and mutations
- **platformOS**: Serverless backend platform
- **JavaScript (ESM)**: Frontend interactivity
- **CSS**: Styling with `pos-` prefixed classes
- **Webpack**: Asset bundling (where needed)
- **Vitest**: Unit testing (core module)
- **Playwright**: E2E testing
- **npm**: Package management and scripts

## Important Notes

### Module Files Never Delete by Default

Modules use partial deployment - files are never deleted unless explicitly configured. This allows developers to override specific files without breaking the module.

### CSS Scoping

All common-styling uses `pos-` prefix to avoid conflicts. Use CSS layers for low-specificity overrides.

### Session Management

User module uses session-based authentication. Current user via `context.current_user`, current profile via `function profile = 'modules/user/helpers/current_profile'`.

### Background Jobs

Commands can be executed as background jobs. Events use background jobs via consumers with priority, retry, and delay configuration.

## Module-Specific Notes

### pos-module-user

Authentication, RBAC, password reset, 2FA, impersonation. Depends on core and common-styling. Auto-creates profile for each user.

### pos-module-core

Foundation module. Zero dependencies. Provides hooks, commands, events, validators, module registry.

### pos-module-tests

Testing framework. Only runs in staging/development. Access via `/_tests` endpoint.

### pos-module-payments + pos-module-payments-stripe

Generic payment interface (payments) + Stripe implementation (payments-stripe). Event-based (payment_transaction_pending/succeeded/failed/expired).

### pos-module-chat

Real-time chat via WebSockets. Depends on user, profile, common-styling.

### pos-module-common-styling

Design system with CSS variables and JS utilities. Theme support (light/dark). Zero dependencies.
