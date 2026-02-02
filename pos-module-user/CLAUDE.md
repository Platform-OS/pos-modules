# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the **pos-module-user** repository - a standalone platformOS module that provides authentication, authorization (RBAC), and user management functionality. The repository contains:

- **modules/user/** - The distributable module (deployed to platformOS Partner Portal Marketplace)
- **modules/core/** - Dependency module providing foundational patterns (Commands, Events, Hooks)
- **modules/common-styling/** - UI styling dependency
- **modules/tests/** - Testing framework dependency
- **app/** - Example application demonstrating module usage (NOT distributed with the module)

When installed by users via `pos-cli modules install user`, only the `modules/user/` contents are deployed. The `app/` directory serves as a working example and testing ground.

## Development Commands

### Versioning

```bash
# Prompts for version type (major/minor/patch) and updates CHANGELOG.md
npm run version
```

This command:
1. Prompts for version selection
2. Updates `modules/user/template-values.json`
3. Auto-generates CHANGELOG entries from git commits
4. Stages changes for commit

### Testing

```bash
# Run all Playwright E2E tests for the test user
npm run pw-tests

# Run Playwright E2E tests for admin panel
npm run admin-panel-pw-tests
```

Tests require environment setup:
- Set `E2E_TEST_PASSWORD` environment variable
- Set `MPKIT_URL` environment variable (platformOS instance URL)
- Authentication state stored in `tests/.auth/` directory

### Deployment

```bash
# Deploy to environment (after syncing pos-cli environment)
pos-cli deploy <env>

# Real-time file sync during development
pos-cli sync <env>

# View instance logs
pos-cli logs <env>

# Generate migrations
pos-cli migrations generate <env> <migration_name>
```

### Local Development

```bash
# GraphQL explorer for testing queries/mutations
pos-cli gui serve
```

## Module Architecture

### Directory Structure

```
modules/user/public/
├── lib/
│   ├── commands/          # Business logic (Build/Check/Execute pattern)
│   │   ├── user/          # User CRUD operations
│   │   ├── profiles/      # Profile management & role assignment
│   │   ├── session/       # Authentication (login/logout/impersonation)
│   │   ├── passwords/     # Password reset flow
│   │   └── authentication_links/  # Temporary token generation
│   ├── queries/           # Data access layer
│   │   ├── user/          # User queries (load, search, current, count)
│   │   ├── profiles/      # Profile queries (find, search)
│   │   ├── roles/         # Role enumeration (all, custom)
│   │   └── role_permissions/  # RBAC permission definitions
│   ├── helpers/           # Reusable utilities
│   │   ├── current_profile.liquid       # Get authenticated user's profile
│   │   ├── can_do.liquid                # Permission check (returns boolean)
│   │   ├── can_do_or_unauthorized.liquid # Permission check (renders 403)
│   │   └── can_do_or_redirect.liquid    # Permission check (redirects)
│   └── events/            # Event definitions for pub/sub
├── views/
│   ├── pages/             # HTTP endpoints
│   │   ├── users/         # Registration CRUD (/users/new, /users)
│   │   ├── sessions/      # Login/logout (/sessions/new, /sessions)
│   │   ├── passwords/     # Password reset flow
│   │   └── profiles/      # Profile management UI
│   └── partials/          # Reusable UI components
├── graphql/               # GraphQL query/mutation templates
├── schema/                # Database table definitions
└── translations/          # i18n files

app/                       # Example application (NOT distributed)
├── modules/user/public/lib/queries/role_permissions/
│   └── permissions.liquid # OVERRIDDEN permissions config
├── views/pages/           # Example pages using the module
├── lib/test/              # Liquid-based unit tests
└── migrations/            # Database setup scripts
```

### User vs Profile Architecture

**Critical distinction**: This module manages both **Users** (platformOS built-in) and **Profiles** (custom table).

- **User**: Built-in platformOS object with `email`, `password`, `id`. Created via `user_create` GraphQL mutation.
- **Profile**: Custom table record with additional fields and **roles array**. One profile per user.

**Why two objects?**
- platformOS Users are authentication primitives (sessions, password hashing)
- Profiles extend Users with application-specific data and RBAC roles
- When checking permissions, always work with **profiles**, not users

**Auto-creation**: `modules/user/commands/user/create` automatically creates both User and Profile in a single transaction.

**Current user access**:
```liquid
# Get current profile (includes roles + user object)
function profile = 'modules/user/helpers/current_profile'

# Access user data via profile
{{ profile.email }}
{{ profile.user.id }}
{{ profile.roles }}  # Array: ["authenticated", "member", etc.]
```

### Command Pattern (3-Stage)

All user operations follow the Build/Check/Execute pattern inherited from core module:

```liquid
# Example: modules/user/commands/user/create.liquid
function object = 'modules/user/commands/user/create/build', email: email, password: password
function object = 'modules/user/commands/user/create/check', object: object
if object.valid
  function user = 'modules/core/commands/execute', mutation_name: 'modules/user/user/create', object: object
  # Also creates profile automatically
endif
return object
```

**Stages**:
1. **build.liquid** - Normalize inputs, set defaults, type conversions
2. **check.liquid** - Validate using core validators (sets `object.valid` and `object.errors`)
3. **execute.liquid** (or inline) - Run GraphQL mutation if valid

### RBAC System

Three built-in roles with special behavior:

- **anonymous** - Artificially added to unauthenticated users by `current_profile` helper
- **authenticated** - Artificially added to logged-in users by `current_profile` helper
- **superadmin** - Bypasses all permission checks (grants universal access)

**Permission checking flow**:
```liquid
function profile = 'modules/user/helpers/current_profile'

# Option 1: Boolean check (for conditional UI)
function can = 'modules/user/helpers/can_do', requester: profile, do: 'articles.create'
{% if can %}
  <a href="/articles/new">New Article</a>
{% endif %}

# Option 2: Render 403 if unauthorized (for page protection)
# platformos-check-disable ConvertIncludeToRender, UnreachableCode
include 'modules/user/helpers/can_do_or_unauthorized', requester: profile, do: 'admin_pages.view'
# platformos-check-enable ConvertIncludeToRender, UnreachableCode
# Code below this line only runs if user has permission
```

**Custom authorization callbacks**:

For entity-specific authorization (e.g., "users can edit their own orders"):

```liquid
# app/lib/can/orders.liquid
assign can_manage_all = 'modules/user/helpers/can_do', requester: requester, do: 'orders.manage.all'
if can_manage_all
  return true
endif

# Check if user owns this specific order
if requester.id == entity.seller_id
  return true
endif
return false

# Usage in page:
function can = 'modules/user/helpers/can_do', requester: profile, do: 'orders.confirm', entity: order, access_callback: 'can/orders'
```

**Defining permissions**:

Override `app/modules/user/public/lib/queries/role_permissions/permissions.liquid`:
```liquid
{% parse_json permissions %}
{
  "member": ["articles.create", "comments.create"],
  "moderator": ["articles.create", "comments.manage.all"],
  "admin": ["articles.manage.all", "users.manage", "site.configure"]
}
{% endparse_json %}
{% return permissions %}
```

**Permission naming convention**: `<resource>.<action>` or `<resource>.manage.all` for admin access.

### Event System

User module publishes events that other modules can consume:

**Published events**:
- `user_created` - After user registration (payload: `{user_id: "123"}`)
- `user_signed_in` - After successful login
- `user_logout` - After logout
- `user_updated` - After user update
- `user_deleted` - After user deletion
- `user_role_appended` / `user_role_removed` / `user_roles_set` - Role changes
- `impersonation_started` / `impersonation_ended` - Admin impersonation events
- `password_created` - Password reset completion
- `authentication_link_created` - Temporary token generation

**Consuming events** (in other modules or app):
Create `app/lib/consumers/<event_name>/<consumer_name>.liquid`:
```liquid
---
metadata:
  priority: default  # low, default, high
  max_attempts: 9
  delay: 0
---
{% liquid
  # Event data in 'event' variable
  log event, type: 'user_created_handler'

  # Example: send welcome email
  function _ = 'modules/core/commands/emails/send',
    to: event.email,
    subject: 'Welcome!',
    template: 'emails/welcome'
%}
```

### Session Management

**Login flow**:
```liquid
# Create session (validates password)
function res = 'modules/user/commands/session/create', email: 'user@example.com', password: 'password'

# Skip password validation (for OAuth, impersonation)
function res = 'modules/user/commands/session/create', user_id: '123', validate_password: false
```

**Logout**:
```liquid
function res = 'modules/user/commands/session/destroy'
```

**Impersonation** (admin logging in as another user):
```liquid
# Start impersonation (stores original_user_id in session)
function res = 'modules/user/commands/session/impersonation/create', user_id: target_user_id

# End impersonation (restore original user)
function res = 'modules/user/commands/session/impersonation/destroy'
```

**Current profile in Layouts**:

The `current_profile` helper uses `export` tag to avoid duplicate queries:
```liquid
# In layout file (runs once)
{% if context.current_user %}
  assign current_profile = context.exports.current_profile
  unless current_profile
    function current_profile = 'modules/user/helpers/current_profile'
  endunless
{% endif %}
```

### Password Reset Flow

Multi-step process using temporary tokens:

1. User requests reset at `/passwords/reset` → submits email
2. System generates temporary token via `authentication_links/create` command
3. Email sent with link: `/passwords/new?token=TEMP_TOKEN`
4. User clicks link, gets authenticated via temporary token
5. User submits new password at `/passwords/create`
6. System updates password, redirects to login

**Temporary token authentication**:
```liquid
function user = 'modules/user/helpers/user_from_temporary_token', token: context.params.token
if user.id
  # Token valid, proceed with password reset
endif
```

### 2FA (Two-Factor Authentication)

Users can enable OTP (One-Time Password) authentication:

**Setup flow**:
1. User enables 2FA in profile settings
2. System generates QR code via platformOS OTP API
3. User scans QR with authenticator app (Google Authenticator, Authy, etc.)
4. User confirms by entering generated 6-digit code

**Login flow with 2FA**:
1. User enters email/password
2. If 2FA enabled, prompt for OTP code
3. Verify code via `user/verify_otp` command
4. Create session if valid

**Related commands**:
- `modules/user/commands/user/verify_otp` - Validate OTP code
- `modules/user/queries/user/otp` - Get OTP secret/QR data

### OAuth Integration

OAuth providers are separate modules (e.g., `pos-module-oauth-github`). Each OAuth module provides:

**Required helpers**:
- `get_redirect_url` - Generate OAuth provider redirect URL
- `get_user_info` - Exchange OAuth code for user data (returns `{sub, email, first_name, last_name, valid}`)

**OAuth flow**:
1. User clicks "Login with GitHub" → redirects to provider
2. Provider redirects back with code
3. Module calls `get_user_info` to fetch user data
4. System calls `oauth/create_user` command to find-or-create user
5. Session created for user

### Module Override Pattern

To customize module behavior without forking:

1. Copy file from `modules/user/public/` to `app/modules/user/public/` (same path)
2. Modify the copy - it takes precedence over original
3. Add to `app/config.yml`:
```yaml
modules_that_allow_delete_on_deploy:
  - core
  - user
```

**Common overrides**:
- `lib/queries/role_permissions/permissions.liquid` - Add custom roles/permissions
- `views/pages/users/new.liquid` - Customize registration form/URL
- `views/partials/sessions/new.liquid` - Customize login form HTML

## Testing

### Playwright E2E Tests

Located in `tests/` directory. Page Object Model pattern:

```typescript
// tests/pages/login.ts - Page objects
export class LogInPage {
  constructor(public page: Page) {}
  async login(email: string, password: string) { ... }
}

// tests/accounts.spec.ts - Test specs
test('user can login', async ({ page }) => {
  const loginPage = new LogInPage(page);
  await loginPage.login(users.test1.email, PASSWORD);
});
```

**Authentication state persistence**: Tests store login state in `tests/.auth/{email}.json` to avoid re-login.

### Liquid Unit Tests

Located in `app/lib/test/`, suffix `_test.liquid`:

```liquid
# app/lib/test/commands/user/create_test.liquid
{% liquid
  assign data = '{"email": "test@example.com", "password": "pass"}' | parse_json
  function result = 'modules/user/commands/user/create', object: data

  # Assertions from tests module
  function contract = 'modules/tests/assertions/valid_object',
    contract: contract, object: result, field_name: 'user_create'
  function contract = 'modules/tests/assertions/equal',
    contract: contract, given: result.email, expected: 'test@example.com'
%}
```

Run via: `pos-cli test run <env> [test_name]`

## Key Queries and Commands

### User Commands
- `modules/user/commands/user/create` - Create user (auto-creates profile)
- `modules/user/commands/user/update` - Update user email/password
- `modules/user/commands/user/delete` - Delete user (must also delete profile manually)
- `modules/user/commands/user/email_update` - Update email with verification
- `modules/user/commands/user/verify_password` - Check password validity
- `modules/user/commands/user/verify_otp` - Validate 2FA code

### Profile Commands
- `modules/user/commands/profiles/create` - Create profile (usually automatic)
- `modules/user/commands/profiles/update` - Update profile fields
- `modules/user/commands/profiles/delete` - Delete profile
- `modules/user/commands/profiles/roles/append` - Add role to user
- `modules/user/commands/profiles/roles/remove` - Remove role from user
- `modules/user/commands/profiles/roles/set` - Replace all roles

### Session Commands
- `modules/user/commands/session/create` - Login (create session)
- `modules/user/commands/session/destroy` - Logout
- `modules/user/commands/session/impersonation/create` - Admin login as user
- `modules/user/commands/session/impersonation/destroy` - End impersonation

### Password Commands
- `modules/user/commands/passwords/create` - Set/update password
- `modules/user/commands/authentication_links/create` - Generate password reset link

### User Queries
- `modules/user/queries/user/current` - Get context.current_user (does not include profile)
- `modules/user/queries/user/load` - Get user by ID
- `modules/user/queries/user/find` - Find user by email
- `modules/user/queries/user/search` - Search users with filters
- `modules/user/queries/user/count` - Count all users
- `modules/user/queries/user/otp` - Get OTP secret/QR for 2FA

### Profile Queries
- `modules/user/queries/profiles/find` - Find profile by user_id/uuid/name
- `modules/user/queries/profiles/search` - Search profiles with filters

### Role Queries
- `modules/user/queries/roles/all` - List all roles (includes anonymous/authenticated)
- `modules/user/queries/roles/custom` - List custom roles only

### Helpers
- `modules/user/helpers/current_profile` - Get current user's profile with roles (MOST USED)
- `modules/user/helpers/can_do` - Check permission (returns boolean)
- `modules/user/helpers/can_do_or_unauthorized` - Check permission or render 403
- `modules/user/helpers/can_do_or_redirect` - Check permission or redirect
- `modules/user/helpers/user_from_temporary_token` - Authenticate via password reset token

## Important Notes

### platformOS-check Warnings

When using authorization helpers that leverage `include` + `break`:
```liquid
# platformos-check-disable ConvertIncludeToRender, UnreachableCode
include 'modules/user/helpers/can_do_or_unauthorized', requester: profile, do: 'admin_pages.view'
# platformos-check-enable ConvertIncludeToRender, UnreachableCode
```

These helpers use deprecated `include` (not `render`) to properly stop execution with `break` tag.

### Password Security

Passwords are automatically hashed using bcrypt by platformOS before storage. Never store plain-text passwords.

### Default Role Setup

Set `USER_DEFAULT_ROLE` constant via migration:
```liquid
# app/migrations/TIMESTAMP_setup_user_default_role.liquid
function result = 'modules/core/commands/variable/set', name: 'USER_DEFAULT_ROLE', value: 'member'
```

### Email Configuration

On staging environments, emails require SendGrid configuration. See [platformOS email docs](https://documentation.platformos.com/get-started/build-your-first-app/sending-email-notifications#enabling-emails-on-the-staging-instance).

### Superadmin Creation

Create first superadmin via GraphQL GUI:
```graphql
mutation {
  user: user_create(user: { email: "admin@example.com", password: "secure_password" }) {
    id
    email
  }
}
```

Then assign superadmin role:
```liquid
function result = 'modules/user/commands/profiles/roles/append', id: PROFILE_ID, role: "superadmin"
```

## Migration Notes

If upgrading from <5.0.0, see `MIGRATIONS.md` for profile table migration steps (moved from separate profile module to user module).
