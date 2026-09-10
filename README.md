# platformOS Modules Monorepo

This monorepo contains the official collection of reusable platformOS modules. These modules are designed as composable building blocks that follow platformOS DevKit best practices and can be used independently or together to build complex applications on the platformOS platform.

## What Are platformOS Modules?

platformOS modules are reusable software components that help decompose complex systems into smaller, maintainable pieces. They follow a three-layer architecture pattern:

1. **Core functionality** (provided by foundation modules)
2. **Vendor/community contributions** (feature modules)
3. **Project-specific code** (your application)

This modular approach lowers application complexity, improves maintainability, and reduces time to market by enabling code reuse across projects.

## Foundation Modules

These modules provide core functionality that other modules depend on:

### [pos-module-core](./pos-module-core) ![v2.1.9](https://img.shields.io/badge/version-2.1.9-blue)

**The foundation module - required by almost all other modules.**

Establishes architectural patterns and conventions for the entire ecosystem. Provides:

- **Command Pattern**: 3-stage (Build/Check/Execute) for business logic
- **Hook System**: `hook/fire` and `hook/alter` for Open/Closed extensibility
- **Event System**: Async communication via activities and consumers
- **Module Registry**: Dependency management and version tracking
- **Validators**: Built-in input validation helpers
- **Utilities**: Email sending, API calls, global variables, constants, statuses
- **Generators**: `command` and `crud` generators for scaffolding

**Dependencies**: None (zero dependencies)

**Links**: [README](./pos-module-core/README.md) | [Marketplace](https://partners.platformos.com/marketplace/pos_modules/126)

---

### [pos-module-user](./pos-module-user) ![v5.2.12](https://img.shields.io/badge/version-5.2.12-blue)

**Authentication and authorization module - required by modules that need auth/RBAC.**

Provides comprehensive user management with session-based authentication and Role-Based Access Control (RBAC). Features:

- **Registration & Authentication**: CRUD operations for users, sign in/out
- **RBAC Authorization**: Role-based permissions system with built-in roles (anonymous, authenticated, superadmin)
- **Password Reset**: Complete password recovery flow with email notifications
- **2FA**: Two-factor authentication with OTP/QR codes
- **Impersonation**: Admin ability to log in as another user
- **OAuth2 Integration**: Extensible OAuth provider support via `oauth_<provider>` modules (see oauth-github, oauth-google, oauth-facebook)

**Dependencies**: core, common-styling
**Dev dependencies**: oauth_github, tests

**Links**: [README](./pos-module-user/README.md) | [Marketplace](https://partners.platformos.com/marketplace/pos_modules/139)

---

### [pos-module-common-styling](./pos-module-common-styling) ![v1.38.5](https://img.shields.io/badge/version-1.38.5-blue)

**Design system and CSS/JavaScript utilities.**

Provides reusable UI components and styling utilities with:

- CSS variables system (pos-config.css) for theming
- Theme support (light/dark mode)
- Responsive design utilities
- Components: forms, buttons, cards, dialogs, popovers, tables, toasts, markdown editor, uploads
- Style guide page for browsing available components
- JavaScript utilities in `window.pos` namespace
- Scoped with `pos-` prefix to avoid conflicts

**Dependencies**: None

**Links**: [README](./pos-module-common-styling/README.md) | [Marketplace](https://partners.platformos.com/marketplace/pos_modules/154)

---

### [pos-module-tests](./pos-module-tests) ![v1.3.4](https://img.shields.io/badge/version-1.3.4-blue)

**Testing framework - often used as a dev dependency for unit/integration tests.**

Liquid-based testing framework for writing and running tests on platformOS. Features:

- Assertion library (equal, presence, valid_object, etc.)
- Test runner with HTML and JSON output formats
- Email inspection tools (`/_tests/sent_mails`)
- Background test execution
- CI/CD integration via `pos-cli test run`

**Dependencies**: None

**Note**: Only runs in staging/development environments for security.

**Links**: [README](./pos-module-tests/README.md) | [Marketplace](https://partners.platformos.com/marketplace/pos_modules/130) | [CLAUDE.md](./pos-module-tests/CLAUDE.md)

---

## Feature Modules

These modules provide specific functionality and typically depend on foundation modules:

### [pos-module-chat](./pos-module-chat) ![v2.1.5](https://img.shields.io/badge/version-2.1.5-blue)

Real-time chat using WebSockets with inbox functionality and message storage. Integrates with push notifications for message alerts.

**Dependencies**: core, user, common-styling, push_notifications

**Links**: [README](./pos-module-chat/README.md) | [Marketplace](https://partners.platformos.com/marketplace/pos_modules/152)

---

### [pos-module-push-notifications](./pos-module-push-notifications) ![v2.0.1](https://img.shields.io/badge/version-2.0.1-blue)

Web Push notifications implemented in Liquid - [Web Push](https://www.rfc-editor.org/rfc/rfc8030) with VAPID authentication ([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)) and payload encryption ([RFC 8291](https://www.rfc-editor.org/rfc/rfc8291)).

Features:
- Subscription model with create/rotate/delete commands
- `notifications/send` and `notifications/broadcast` commands
- Service worker (`sw.js`), init partial and subscribe toggle partial
- Events: push_subscription_created/rotated/deleted/expired, push_notification_sent/failed
- Configuration via core variables (VAPID keys, sender keypair)

**Dependencies**: core, common-styling, user

**Links**: [README](./pos-module-push-notifications/modules/push_notifications/README.md)

---

### [pos-module-user-invites](./pos-module-user-invites) ![v1.0.1](https://img.shields.io/badge/version-1.0.1-blue)

Invite users to your application by email, individually or in bulk from a CSV file.

Features:
- `user_invite` model with sent/accepted/expiry tracking
- Admin pages for CSV upload, preview and sending (`/admin/community/invite_users`)
- Invite acceptance flow with email templates
- Events: user_invited, user_invite_accepted (invite email sent via consumer)

**Dependencies**: core, user, common-styling

---

### [pos-module-payments](./pos-module-payments) ![v0.3.2](https://img.shields.io/badge/version-0.3.2-blue)

Universal payment interface supporting multiple gateways with event-based transaction tracking.

Features:
- Gateway abstraction pattern
- Transaction model with status tracking
- Event system (payment_transaction_pending/succeeded/failed/expired)
- Gateway request logging

**Dependencies**: core
**Dev dependencies**: tests

**Links**: [README](./pos-module-payments/README.md)

---

### [pos-module-payments-stripe](./pos-module-payments-stripe) ![v1.3.1](https://img.shields.io/badge/version-1.3.1-blue)

Stripe payment gateway implementation with Stripe Checkout integration and webhook handling.

**Dependencies**: core, payments, user
**Dev dependencies**: tests

**Links**: [README](./pos-module-payments-stripe/README.md)

---

### [pos-module-payments-example-gateway](./pos-module-payments-example-gateway) ![v0.1.2](https://img.shields.io/badge/version-0.1.2-blue)

Fake payment gateway for testing purposes. Does not process real payments - used to simulate successful or failed payment transactions during development.

**Dependencies**: core, payments
**Dev dependencies**: tests

**Links**: [README](./pos-module-payments-example-gateway/README.md)

---

### [pos-module-reports](./pos-module-reports) ![v2.0.1](https://img.shields.io/badge/version-2.0.1-blue)

Background report generation system with CSV export functionality and document management.

**Dependencies**: core, user

**Links**: [README](./pos-module-reports/README.md)

---

### [pos-module-openai](./pos-module-openai) ![v1.3.1](https://img.shields.io/badge/version-1.3.1-blue)

OpenAI integration for AI-powered features:

- Embeddings CRUD backed by the platformOS Embeddings backend
- Chat Completions API
- Responses API

**Dependencies**: core

**Links**: [README](./pos-module-openai/README.md) | [Marketplace](https://partners.platformos.com/marketplace/pos_modules/143)

---

### [pos-module-data-export-api](./pos-module-data-export-api) ![v0.2.1](https://img.shields.io/badge/version-0.2.1-blue)

API endpoints for triggering data exports of records and/or users, with GraphQL-driven scoping, optional PGP encryption and IP allowlisting. Authentication uses the `_data_export_api_key` constant generated by a migration.

**Dependencies**: core

**Links**: [README](./pos-module-data-export-api/README.md)

---

### Captcha Modules

A generic captcha abstraction plus swappable provider implementations. The abstraction exposes one uniform interface - `modules/captchas/widget` to render, `modules/captchas/commands/captcha/verify` to verify server-side - and dispatches to a provider module by naming convention (`captchas_<key>`). Installing a provider module is all it takes to enable it; keys are caller-supplied (typically from platformOS constants) and never stored by the modules.

#### [pos-module-captchas](./pos-module-captchas) ![v1.1.0](https://img.shields.io/badge/version-1.1.0-blue)

The provider-agnostic abstraction: widget rendering, normalized verification, provider dispatch.

**Dependencies**: None
**Dev dependencies**: tests

**Links**: [README](./pos-module-captchas/README.md)

#### [pos-module-captchas-turnstile](./pos-module-captchas-turnstile) ![v1.1.0](https://img.shields.io/badge/version-1.1.0-blue)

Cloudflare Turnstile provider (key `turnstile`) - passive/invisible, public test keys available.

**Dependencies**: captchas

**Links**: [README](./pos-module-captchas-turnstile/README.md)

#### [pos-module-captchas-hcaptcha](./pos-module-captchas-hcaptcha) ![v1.1.0](https://img.shields.io/badge/version-1.1.0-blue)

hCaptcha provider (key `hcaptcha`).

**Dependencies**: captchas

**Links**: [README](./pos-module-captchas-hcaptcha/README.md)

#### [pos-module-captchas-recaptcha](./pos-module-captchas-recaptcha) ![v1.1.0](https://img.shields.io/badge/version-1.1.0-blue)

Google reCAPTCHA v2 provider (key `recaptcha`) - checkbox or invisible.

**Dependencies**: captchas

**Links**: [README](./pos-module-captchas-recaptcha/README.md)

#### [pos-module-captchas-recaptcha3](./pos-module-captchas-recaptcha3) ![v1.1.0](https://img.shields.io/badge/version-1.1.0-blue)

Google reCAPTCHA v3 provider (key `recaptcha3`) - invisible, score-based.

**Dependencies**: captchas

**Links**: [README](./pos-module-captchas-recaptcha3/README.md)

> Do not mix reCAPTCHA v2 and v3 widgets on one page - both use Google's `api.js` loader, which cannot be loaded twice with different parameters.

---

### OAuth Provider Modules

OAuth2 provider implementations for external identity provider authentication. Each provider module depends only on core; the user module dispatches to it by naming convention (`oauth_<provider>`) to enable social login.

#### [pos-module-oauth-github](./pos-module-oauth-github) ![v0.0.13](https://img.shields.io/badge/version-0.0.13-blue)

GitHub OAuth2 provider implementation.

**Dependencies**: core

**Links**: [README](./pos-module-oauth-github/README.md)

#### [pos-module-oauth-google](./pos-module-oauth-google) ![v0.0.6](https://img.shields.io/badge/version-0.0.6-blue)

Google OAuth2 provider implementation.

**Dependencies**: core

**Links**: [README](./pos-module-oauth-google/README.md)

#### [pos-module-oauth-facebook](./pos-module-oauth-facebook) ![v0.0.5](https://img.shields.io/badge/version-0.0.5-blue)

Facebook OAuth2 provider implementation.

**Dependencies**: core

**Links**: [README](./pos-module-oauth-facebook/README.md)

---

## Getting Started

### Prerequisites

- [pos-cli](https://github.com/mdyd-dev/pos-cli) - Essential tool for managing platformOS projects
- A platformOS instance (create one at [partners.platformos.com](https://partners.platformos.com/instances/new))
- [platformOS Check](https://github.com/Platform-OS/platformos-lsp) (optional but recommended)

### Installing Modules

Modules can be installed from the [Partner Portal Modules Marketplace](https://partners.platformos.com/marketplace):

```bash
# Install a module (also downloads the module and all its dependencies)
pos-cli modules install <module-name>

# Deploy to your instance
pos-cli deploy <env>
```

Installing a module records it in your project's `app/pos-module.json` and resolves versions into a lock file, so the same dependency set can be reinstalled on any environment.

### Repository Structure

Each module directory contains:

```
pos-module-<name>/
├── modules/
│   ├── <machine-name>/          # The actual module (distributed part)
│   │   └── public/              # Module source code
│   └── <dependency>/            # Installed dependencies (gitignored)
├── app/                         # Example application (not distributed)
│   └── pos-module.json          # Dependencies of the example app
├── pos-module.json              # Module manifest: machine_name, version, dependencies
├── pos-module.lock.json         # Resolved dependency versions and registries
├── package.json                 # npm scripts for development (most modules)
└── README.md                    # Module documentation
```

`pos-module.json` at the module root is the manifest that declares the module's version and its `dependencies`/`devDependencies`. Dependencies installed into `modules/` are gitignored so duplicated code is not committed to this repository.

### Development Workflow

```bash
# Real-time sync during development
pos-cli sync <env>

# View instance logs
pos-cli logs <env>

# Run tests
pos-cli test run <env> [test-name]

# Create migrations
pos-cli migrations generate <env> <name>

# GraphQL explorer
pos-cli gui serve
```

### Continuous Integration

Two GitHub Actions workflows run on push and can also be dispatched manually with a comma-separated list of modules (or `all`):

- [`.github/workflows/lint.yml`](./.github/workflows/lint.yml) - lints modules with platformOS Check
- [`.github/workflows/tests.yml`](./.github/workflows/tests.yml) - deploys and runs each module's test suite

Both detect which modules changed and build a job matrix from them, so a push only exercises the affected modules.

## Architectural Patterns

### Command Pattern (3-Stage Process)

All modules follow this pattern for business logic:

1. **Build**: Normalize input, set defaults, type conversions
2. **Check**: Validate inputs using core validators
3. **Execute**: Run GraphQL mutation (only if valid)

```liquid
{% liquid
  function object = 'modules/<module>/commands/<resource>/<action>/build', object: object
  function object = 'modules/<module>/commands/<resource>/<action>/check', object: object

  if object.valid
    function object = 'modules/<module>/commands/<resource>/<action>/execute', object: object
  endif

  return object
%}
```

### Hook System

Hooks let modules extend each other without modifying source code. Fire a hook at an integration point and any `hook_<name>.liquid` file in an app or module responds:

```liquid
{% liquid
  function results = 'modules/core/commands/hook/fire', hook: 'my-hook-name', params: data
%}
```

### Event System

Events enable async, loosely-coupled communication:

```liquid
{% liquid
  # Publish event
  function activity = 'modules/core/commands/events/publish', type: 'user_created', object: user_data
%}
```

Consume events by creating consumers in `lib/consumers/<event_name>/`.

### Naming Conventions

- **Permissions**: `<resource>.<action>` (e.g., `user.create`, `orders.manage.all`)
- **Commands**: `<resource>/<action>` (e.g., `users/create`, `order/cancel`)
- **Queries**: `<resource>/search` (multiple) or `<resource>/find` (single)
- **Hooks**: `hook_<hook-name>` prefix
- **Events**: `<action>_<resource>` (past tense: `user_created`, `payment_succeeded`)
- **CSS Classes**: `pos-` prefix (e.g., `.pos-button`, `.pos-form`)

## Module Dependencies

Most modules depend on **pos-module-core** as the foundation. Authentication/authorization features require **pos-module-user**. Testing capabilities require **pos-module-tests** (usually as a dev dependency).

### Dependency Graph

```
core (foundation - no dependencies)
├── user (+ common-styling)
│   ├── chat (+ common-styling, push_notifications)
│   ├── push-notifications (+ common-styling)
│   ├── user-invites (+ common-styling)
│   ├── reports
│   └── payments-stripe (+ payments)
├── payments
│   ├── payments-stripe (+ user)
│   └── payments-example-gateway
├── oauth-github
├── oauth-google
├── oauth-facebook
├── openai
└── data-export-api

captchas (standalone)
├── captchas-turnstile
├── captchas-hcaptcha
├── captchas-recaptcha
└── captchas-recaptcha3

common-styling (standalone)
tests (standalone - dev dependency)
```

## Customizing Modules

Modules can be customized without forking by using the override system:

1. Copy file from `modules/<module>/public/` to `app/modules/<module>/public/`
2. Modify the copy - it will take precedence
3. Configure `app/config.yml`:

```yaml
modules_that_allow_delete_on_deploy:
  - core
  - user
  - <your-module>
```

## Best Practices

### Resourceful Routing

Organize endpoints using REST conventions:
- `GET /articles` - List articles
- `POST /articles` - Create article
- `GET /articles/:id` - Show article
- `PATCH /articles/:id` - Update article
- `DELETE /articles/:id` - Delete article

### Separation of Concerns

- **Pages**: Act as controllers, handle business logic
- **Partials**: Handle presentation only
- **Commands**: Encapsulate business rules
- **Queries**: Encapsulate data access

### Testing

Write tests in `app/lib/test/*_test.liquid`:

```liquid
{% liquid
  function result = 'modules/user/commands/user/create', email: 'test@example.com', password: 'password'

  function contract = 'modules/tests/assertions/valid_object', contract: contract, object: result, field_name: 'user_create'
  function contract = 'modules/tests/assertions/equal', contract: contract, given: result.email, expected: 'test@example.com', field_name: 'email'
%}
```

## Resources

- [platformOS Documentation](https://documentation.platformos.com/)
- [platformOS Modules Guide](https://documentation.platformos.com/developer-guide/modules/platformos-modules)
- [Partner Portal](https://partners.platformos.com/)
- [Modules Marketplace](https://partners.platformos.com/marketplace)
- [pos-cli GitHub](https://github.com/mdyd-dev/pos-cli)
- [platformOS Check (Linter/LSP)](https://github.com/Platform-OS/platformos-lsp)

## Contributing

Each module in this monorepo follows semantic versioning and can be developed independently. Refer to individual module READMEs for specific contribution guidelines.

## License

Individual modules may have their own licenses. Please refer to each module's directory for specific licensing information.
