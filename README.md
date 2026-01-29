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

### [pos-module-core](./pos-module-core) ![v2.0.7](https://img.shields.io/badge/version-2.0.7-blue)

**The foundation module - required by almost all other modules.**

Establishes architectural patterns and conventions for the entire ecosystem. Provides:

- **Command Pattern**: 3-stage (Build/Check/Execute) for business logic
- **Event System**: Async communication via activities and consumers
- **Module Registry**: Dependency management and version tracking
- **Validators**: Built-in input validation helpers
- **Utilities**: Email sending, API calls, global variables, session storage

**Dependencies**: None (zero dependencies)

**Links**: [README](./pos-module-core/README.md) | [Marketplace](https://partners.platformos.com/marketplace/pos_modules/126)

---

### [pos-module-user](./pos-module-user) ![v5.1.1](https://img.shields.io/badge/version-5.1.1-blue)

**Authentication and authorization module - required by modules that need auth/RBAC.**

Provides comprehensive user management with session-based authentication and Role-Based Access Control (RBAC). Features:

- **Registration & Authentication**: CRUD operations for users, sign in/out
- **RBAC Authorization**: Role-based permissions system with built-in roles (anonymous, authenticated, superadmin)
- **Password Reset**: Complete password recovery flow with email notifications
- **2FA**: Two-factor authentication with OTP/QR codes
- **Impersonation**: Admin ability to log in as another user
- **OAuth2 Integration**: Extensible OAuth provider support (see oauth-github, oauth-google, oauth-facebook modules)

**Dependencies**: core, common-styling

**Links**: [README](./pos-module-user/README.md) | [Marketplace](https://partners.platformos.com/marketplace/pos_modules/139)

---

### [pos-module-common-styling](./pos-module-common-styling) ![v1.32.0](https://img.shields.io/badge/version-1.32.0-blue)

**Design system and CSS/JavaScript utilities.**

Provides reusable UI components and styling utilities with:

- CSS variables system (pos-config.css) for theming
- Theme support (light/dark mode)
- Responsive design utilities
- Form and button components
- JavaScript utilities in `window.pos` namespace
- Scoped with `pos-` prefix to avoid conflicts

**Dependencies**: None

**Links**: [README](./pos-module-common-styling/README.md) | [Marketplace](https://partners.platformos.com/marketplace/pos_modules/129)

---

### [pos-module-tests](./pos-module-tests) ![v1.2.0](https://img.shields.io/badge/version-1.2.0-blue)

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

### [pos-module-chat](./pos-module-chat) ![v1.1.1](https://img.shields.io/badge/version-1.1.1-blue)

Real-time chat using WebSockets with inbox functionality and message storage.

**Dependencies**: core, user, common-styling

**Links**: [README](./pos-module-chat/README.md)

---

### [pos-module-payments](./pos-module-payments) ![v0.2.4](https://img.shields.io/badge/version-0.2.4-blue)

Universal payment interface supporting multiple gateways with event-based transaction tracking.

Features:
- Gateway abstraction pattern
- Transaction model with status tracking
- Event system (payment_transaction_pending/succeeded/failed/expired)
- Gateway request logging

**Dependencies**: core

**Links**: [README](./pos-module-payments/README.md)

---

### [pos-module-payments-stripe](./pos-module-payments-stripe) ![v0.2.9](https://img.shields.io/badge/version-0.2.9-blue)

Stripe payment gateway implementation with Stripe Checkout integration and webhook handling.

**Dependencies**: core, payments

**Links**: [README](./pos-module-payments-stripe/README.md)

---

### [pos-module-payments-example-gateway](./pos-module-payments-example-gateway) ![v0.1.1](https://img.shields.io/badge/version-0.1.1-blue)

Fake payment gateway for testing purposes. Does not process real payments - used to simulate successful or failed payment transactions during development.

**Dependencies**: core, payments

**Links**: [README](./pos-module-payments-example-gateway/README.md)

---

### [pos-module-reports](./pos-module-reports) ![v1.0.4](https://img.shields.io/badge/version-1.0.4-blue)

Background report generation system with CSV export functionality and document management.

**Dependencies**: core, user, tests

**Links**: [README](./pos-module-reports/README.md)

---

### [pos-module-openai](./pos-module-openai) ![v1.0.1](https://img.shields.io/badge/version-1.0.1-blue)

OpenAI integration for embeddings and AI-powered features.

**Dependencies**: core

---

### [pos-module-data-export-api](./pos-module-data-export-api) ![v0.1.1](https://img.shields.io/badge/version-0.1.1-blue)

API endpoints for triggering data exports with authentication via constant.

**Dependencies**: core

**Links**: [README](./pos-module-data-export-api/README.md)

---

### OAuth Provider Modules

OAuth2 provider implementations for external identity provider authentication. These modules integrate with the user module to enable social login.

#### [pos-module-oauth-github](./pos-module-oauth-github)

GitHub OAuth2 provider implementation.

**Dependencies**: core, user

**Links**: [README](./pos-module-oauth-github/README.md)

#### [pos-module-oauth-google](./pos-module-oauth-google)

Google OAuth2 provider implementation.

**Dependencies**: core, user

**Links**: [README](./pos-module-oauth-google/README.md)

#### [pos-module-oauth-facebook](./pos-module-oauth-facebook)

Facebook OAuth2 provider implementation.

**Dependencies**: core, user

**Links**: [README](./pos-module-oauth-facebook/README.md)

---

## Development Tools

### [ci-repository-reserve-instance-url](./ci-repository-reserve-instance-url)

GitHub Action for reserving CI instances, managing authorization tokens, and releasing instances for platformOS CI/CD workflows. This tool prevents conflicts when running multiple tests simultaneously by managing a pool of shared instances (ci.1-ci.6).

**Features:**
- Reserve/release CI instances from shared pool
- Get authorization tokens for GitHub Actions
- Prevent test conflicts across parallel workflows
- Persistent log access with timestamped report paths

**Type**: GitHub Action (not a platformOS module)

**Links**: [README](./ci-repository-reserve-instance-url/README.md) | [GitHub Action](https://github.com/Platform-OS/ci-repository-reserve-instance-url)

---

## Getting Started

### Prerequisites

- [pos-cli](https://github.com/mdyd-dev/pos-cli) - Essential tool for managing platformOS projects
- A platformOS instance (create one at [partners.platformos.com](https://partners.platformos.com/instances/new))
- [platformOS Check](https://github.com/Platform-OS/platformos-lsp) (optional but recommended)

### Installing Modules

Modules can be installed from the [Partner Portal Modules Marketplace](https://partners.platformos.com/marketplace):

```bash
# Install a module
pos-cli modules install <module-name>

# Download source code for local development
pos-cli modules download <module-name>

# Deploy to your instance
pos-cli deploy <env>
```

### Module Structure

Each module directory contains:

```
pos-module-<name>/
├── modules/
│   └── <machine-name>/          # The actual module (distributed part)
│       ├── public/              # Module source code
│       └── template-values.json # Module metadata & dependencies
├── app/                         # Example application (not distributed)
├── package.json                 # npm scripts for development
└── README.md                    # Module documentation
```

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
- **Events**: `<action>_<resource>` (past tense: `user_created`, `payment_succeeded`)
- **CSS Classes**: `pos-` prefix (e.g., `.pos-button`, `.pos-form`)

## Module Dependencies

Most modules depend on **pos-module-core** as the foundation. Authentication/authorization features require **pos-module-user**. Testing capabilities require **pos-module-tests** (often as a dev dependency).

### Dependency Graph

```
core (foundation - no dependencies)
├── user + common-styling
│   ├── chat (+ common-styling)
│   ├── reports (+ tests)
│   ├── oauth-github
│   ├── oauth-google
│   └── oauth-facebook
├── payments
│   ├── payments-stripe
│   └── payments-example-gateway
├── openai
└── data-export-api

common-styling (standalone)
tests (standalone)
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
