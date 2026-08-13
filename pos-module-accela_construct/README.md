# accela_construct

A platformOS module that wraps the [Accela Construct API v4](https://developer.accela.com/docs/construct-apiIndex.html):
**Records** and all of its sub-resources (WorkflowTasks, Payments, Parcels,
Owners, Inspections, Documents, Conditions, Addresses), **Inspections**
(including its Checklists and Conditions sub-resources), and **Searches**
— including OAuth2 password-grant authentication with automatic token
refresh. See [Supported endpoints](#supported-endpoints) for the full list.

## How it's built (platformOS constraints)

platformOS doesn't let you attach custom resolvers to GraphQL, so this isn't
a "GraphQL API" in the REST-wrapper sense. The real architecture is:

1. **API Call Notifications** (`public/api_calls/*.liquid`) are the only way
   to make outbound HTTP requests. There are three of them:
   `accela_generic` (handles GET/POST/PUT/DELETE, with the HTTP verb passed
   through as `data.request_type` — one template, not one per verb),
   `accela_post_multipart` (its headers/body shape differs enough from the
   plain-JSON case to need its own file), and `accela_token_request` for
   OAuth. They're generic (path/method/body come from the caller) rather
   than one file per Accela endpoint, to keep the module maintainable.
   `accela_generic` and `accela_post_multipart` build their `to:` URL as
   `{% function accela_base_url = 'modules/core/queries/constants/find', name: 'ACCELA_CONSTRUCT_BASE_URL' %}{{ accela_base_url }}{{ data.path }}`
   — `ACCELA_CONSTRUCT_BASE_URL` is looked up in exactly those 2 places, nowhere
   else in the module; every query/command only ever builds a bare path
   (e.g. `/records`), never a full URL.
2. **[pos-module-core](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-core)'s
   `modules/core/api_calls/send`** is the GraphQL operation that fires those
   notifications synchronously via the built-in `api_call_send` mutation
   and returns the HTTP response inline (aliased as `api_call` in the
   response). This module doesn't own its own copy of that mutation -
   `pos-module.json` already depends on `core` (`^2.0.0`), so `send.liquid`
   and `get_valid_token.liquid` call core's wrapper directly instead of
   maintaining a near-identical `generic_send.graphql` of our own.
3. **Liquid functions** are the actual developer-facing "wrapper" — one
   function per Accela endpoint, split per platformOS module convention into
   **queries** (`public/lib/queries/**/*.liquid`, read-only calls like
   `records/search`, `records/inspection_types/list`) and **commands**
   (`public/lib/commands/**/*.liquid`, mutating calls like
   `records/create`, `inspections/schedule`, `records/documents/upload`).
   Each builds the path/query string/JSON body, calls
   `lib/accela_client/send`, and returns a normalized result hash.
   The shared HTTP/token plumbing itself (`send.liquid`,
   `get_valid_token.liquid`) lives in `public/lib/accela_client/` since it
   isn't a resource-facing query or command.
4. **`accela_oauth_token`** is a Table (`public/schema/accela_oauth_token.yml`)
   used to cache the OAuth token between requests. `get_valid_token.liquid`
   reads it via `lib/queries/accela_oauth_token/find` (the same
   query-wrapper convention used for Accela's own resources, applied here
   to the module's internal token table), and only calls Accela's token
   endpoint when the cached token is missing/expired.

Call chain: `your page/partial` → `lib/queries/records/search` →
`lib/accela_client/send` → (`lib/accela_client/get_valid_token` if needed) →
`modules/core/api_calls/send` → `api_call_send` → Accela.

This module also uses pos-module-core for validation and constant
lookups rather than hand-rolling either: every command's `check.liquid`
calls `modules/core/validations/presence`, and every constant read
anywhere in the module — including the `api_calls/*.liquid` templates'
`to:` URL — goes through `modules/core/queries/constants/find` instead of
`context.constants[...]` directly. There are zero direct
`context.constants` reads left in this module. Using the query there
instead of direct access is actually *more* robust, not just more
consistent: `modules/core/queries/constants/find` itself falls back to a
live `constant()` GraphQL query when `context.constants` isn't populated,
so even if that turns out not to be hydrated inside a notification
template's frontmatter (see Known gaps), the lookup still works.
`get_valid_token.liquid`'s OAuth form body is also built with core's
`modules/core/helpers/hash_to_x_form_encoded` from a plain hash, instead
of manually `url_encode`-ing and concatenating each field.

5. **Background retries** are opt-in per call via a `with_retries: true`
   param, present on every query and command except `records/documents/upload`
   (always MULTIPART, so retrying would never apply - the param is simply
   not exposed there rather than being a documented no-op).
   `lib/accela_client/send.liquid` still makes its first attempt
   synchronously and returns that result either way; if it fails and
   `with_retries` was set, it hands off to `lib/accela_client/schedule_retry.liquid`,
   which schedules a `{% background %}` job after
   `ACCELA_CONSTRUCT_RETRY_DELAY_MINUTES * retry number` minutes (linear backoff -
   1x, 2x, 3x the base delay for the 1st/2nd/3rd retry), up to
   `ACCELA_CONSTRUCT_MAX_RETRIES` retries. Every file in the chain
   (`send.liquid`/`schedule_retry.liquid`/`perform_retry_attempt.liquid`)
   shares one absolute, 1-based `attempt_number` (1 = the original call,
   2 = the first retry, ...) rather than mixing that with a separate
   retry-relative counter, and `ACCELA_CONSTRUCT_RETRY_DELAY_MINUTES` is looked up
   once (by whichever call first triggers scheduling) and threaded through
   the rest of the chain instead of being re-queried on every retry.
   Neither `schedule_retry.liquid` nor the `{% background %}` job's data
   carries the request itself (`method`/`path`/`payload`) - only the
   `accela_request` row's id (see point 6 below). `lib/accela_client/perform_retry_attempt.liquid`
   runs inside that job, looks the request back up via
   `queries/accela_request/get`, calls `send` again with it (without
   `with_retries`, so it doesn't re-trigger its own scheduling), and
   either logs success, schedules the next attempt, or logs
   `accela_retry_exhausted` and gives up. Retries are log-only -
   there's no table tracking retry state, and nothing observes the
   eventual outcome except logs (`accela_retry_scheduled`/
   `accela_retry_succeeded`/`accela_retry_exhausted`) and the
   `accela_request`/`accela_request_response` tables below. MULTIPART
   requests are never retried, since file content can't be safely
   re-sent from a detached background job.

6. **Every request/response is logged, in two tables - one row per
   logical request, one row per attempt against it** - unconditionally,
   unlike retries, which are opt-in. `accela_request`
   (`public/schema/accela_request.yml`: `method`, `path`,
   `request_payload`, `reference_id`, `reference_schema`) holds one row
   per logical request, created once on its first attempt - and never
   written to again after that, even across retries.
   `accela_request_response` (`public/schema/accela_request_response.yml`:
   `request_id` [`belongs_to: accela_request`], `attempt_number`,
   `status`, `response_body` [the raw response string], `success`,
   `error`) holds one row per attempt against that request, including
   every retry - so a request that retries twice ends up with one
   `accela_request` row and three `accela_request_response` rows
   (`attempt_number` 1, 2, 3). There's no stored "how many attempts so
   far" counter on `accela_request` - filter `queries/accela_request_response/list`
   by `request_id` and read its `total_entries` instead of maintaining a
   separate count that could drift from the rows it's supposed to
   summarize.
   `reference_id`/`reference_schema` are stored as two flat columns
   (naming matches [pos-module-core](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-core)'s
   own polymorphic-reference convention on its `status` table), but every
   caller-facing param is a single hash: `reference: { "id": ..., "table": ... }`.
   `table` is a real platformOS `Record.table` value, not a caller-invented
   label - if you already have the fetched record in hand and its own
   query selected `table`, just pass it directly (`reference: application`);
   if you only have an id, pass `reference: { "id": application_id }` and
   `table` is looked up automatically via `accela_client/resolve_reference_table.liquid`
   (one extra GraphQL read - `records()` can look up any record by id
   regardless of which table it's actually in, so this works for any
   platformOS record, not just ones this module knows about). Set once at
   creation, otherwise unused by this module. `send.liquid`/`post_search.liquid`
   accept `reference` directly, and every query/command wrapper function
   forwards it the same way it forwards `with_retries` - e.g.
   `{% function result = 'modules/accela_construct/commands/records/create',
   record: record, reference: { "id": application.id, "table": application.table } %}`.
   `lib/accela_client/log_request.liquid` (called from `send.liquid`)
   owns the write: if `request_id` is blank (attempt 1) it resolves
   `table` if needed and creates the `accela_request` row, then uses its
   new id; otherwise it reuses the `request_id` passed in from a prior
   attempt as-is - retries touch `accela_request_response` only, and
   `reference` is never looked at again once the request row exists. A
   failed write here is ignored - it never fails or blocks the underlying
   Accela request. The write happens synchronously whenever something
   needs its result: when this attempt is about to trigger a retry (the
   `accela_request` id becomes the chain's `request_id` before
   scheduling), and when this attempt succeeded (the
   `accela_construct_request_succeeded` event - see "Events" below -
   needs both ids). Only a non-retried failure has nothing waiting on it,
   so that's the one case the write still runs in the background,
   unread by anything. For that one case, the rows for a given call may
   not be queryable for a brief moment after the call returns (eventual
   consistency), rather than being guaranteed visible immediately. Read
   access is three normal queries -
   `queries/accela_request/list` (filterable by `method`/`path`/
   `reference: { "id", "table" }` - unlike the write side, `table` is
   never auto-resolved here, since filtering by `id` alone is already
   unambiguous), `queries/accela_request/get` (fetch one by id - also
   what `perform_retry_attempt.liquid` uses to look up what to resend),
   and `queries/accela_request_response/list` (filterable by
   `request_id`/`success`, so `request_id: <id>` pulls a whole retry
   chain's responses together, and `total_entries` on that result is "how
   many attempts so far") - there's no admin UI, only the GraphQL/Liquid
   layer.

## Install

1. Copy `modules/accela_construct` into your instance's `modules/` directory
   (sibling to `app/`), or install/push it through the Partner Portal
   Marketplace per platformOS module conventions.
2. Fill in real values in `template-values.json` (or set them directly as
   Constants — see below) — **do not commit real secrets**.
3. Deploy:
   ```
   pos-cli deploy <env>
   ```
   Table creation isn't a separate migration step - `pos-cli deploy`/`sync`
   creates and syncs the `accela_oauth_token`/`accela_request`/
   `accela_request_response` tables directly from their `schema/*.yml`
   files as part of a normal deploy.
4. Seed the `ACCELA_CONSTRUCT_*` constants from `template-values.json` by
   running the one migration this module ships (`public/migrations/..._set_accela_constants.liquid`,
   which does need an explicit migration since it's seeding Constants
   data, not creating a table):
   ```
   pos-cli migrations run 20260730120100 <env>
   ```
5. Verify the tables/constants exist (GraphiQL console):
   ```graphql
   query { records(filter: { table: { value: "modules/accela_construct/accela_oauth_token" } }, per_page: 1) { results { id } } }
   ```
6. Register an app at the [Accela Developer Portal](https://developer.accela.com/ApplicationList/Index)
   to get your `client_id`/`client_secret` (app id/app secret). Accela
   publishes a public sandbox for initial testing: agency `Nullisland`,
   user `developer` / password `accela`, `environment: TEST`.

## Required constants

Set these as encrypted platformOS Constants (`constant_set` mutation, or via
the seed migration + `template-values.json`):

| Constant | Example | Notes |
|---|---|---|
| `ACCELA_CONSTRUCT_BASE_URL` | `https://apis.accela.com/v4` | API base URL |
| `ACCELA_CONSTRUCT_AUTH_URL` | `https://auth.accela.com/oauth2/token` | OAuth token endpoint |
| `ACCELA_CONSTRUCT_APP_ID` | — | sent as `x-accela-appid` on every call |
| `ACCELA_CONSTRUCT_CLIENT_ID` | — | OAuth client_id |
| `ACCELA_CONSTRUCT_CLIENT_SECRET` | — | OAuth client_secret |
| `ACCELA_CONSTRUCT_USERNAME` | — | Civic ID or Accela Automation account |
| `ACCELA_CONSTRUCT_PASSWORD` | — | |
| `ACCELA_CONSTRUCT_AGENCY` | `Nullisland` | agency name |
| `ACCELA_CONSTRUCT_ENVIRONMENT` | `TEST` or `PROD` | must match the agency's configured environments |
| `ACCELA_CONSTRUCT_SCOPE` | `get_record create_record update_record get_inspections create_inspections update_inspections get_documents create_documents` | space-delimited, per endpoint you plan to call |
| `ACCELA_CONSTRUCT_MAX_RETRIES` | `3` | optional, defaults to `3`; total background retries per call when `with_retries: true` is passed (0 disables retrying) |
| `ACCELA_CONSTRUCT_RETRY_DELAY_MINUTES` | `1` | optional, defaults to `1`; base delay in minutes, multiplied by the retry number (1st, 2nd, ...) for linear backoff |

## Usage examples

All functions return `{ success, status, body, raw, error }`. Always check
`success` (or, for bulk cancel/delete calls, each item's `isSuccess` inside
`body.result[]` — see gotcha below). Commands additionally short-circuit
before calling Accela if required params are missing, returning
`{ success: false, status: null, error: "accela_validation_failed", errors: { <field>: [<message>] } }`
— note `errors[field]` is an **array** of messages (pos-module-core's
`register_error` appends to it), not a single string. See
[Queries vs. commands](#queries-vs-commands) below.

**Search records**
```liquid
{% liquid
  assign criteria = { "module": "Building", "address": { "postalCode": "94108" } }
  function result = 'modules/accela_construct/queries/records/search', criteria: criteria, limit: 25
%}
{% if result.success %}{{ result.body.result | json }}{% endif %}
```

**Get a record**
```liquid
{% function result = 'modules/accela_construct/queries/records/get', ids: '12CAP-00000-00001', expand: 'addresses,parcels' %}
```

**Check required fields, then create a record**
```liquid
{% liquid
  function described = 'modules/accela_construct/queries/records/describe_create', type: 'Building/Residential/Alteration/NA'

  assign record = {
    "type": { "id": "Building-Residential-Alteration-NA" },
    "description": "Residence alteration",
    "parcels": [{ "parcelNumber": "005020018" }],
    "addresses": [{ "isPrimary": "Y", "streetName": "123 Main Street", "city": "Pleasanton", "postalCode": "94588", "state": { "value": "CA" } }],
    "contacts": [{ "isPrimary": "Y", "fullName": "Joe Smith", "email": "jsmith@email.com", "type": { "value": "Contractor" } }]
  }
  function result = 'modules/accela_construct/commands/records/create', record: record
%}
```

**Schedule an inspection**
```liquid
{% liquid
  function types = 'modules/accela_construct/queries/records/inspection_types/list', record_ids: record_id
  # pick the right type.id from types.body.result, then:
  assign inspection = { "type": { "id": 173 }, "inspectorId": "MINSPECTOR", "recordId": { "id": "ISLANDTON-12CAP-00000-0000L" }, "requestDate": "2026-08-01", "scheduleDate": "2026-08-05" }
  function result = 'modules/accela_construct/commands/inspections/schedule', inspection: inspection
%}
```

**Cancel an inspection**
```liquid
{% function result = 'modules/accela_construct/commands/inspections/cancel', ids: inspection_id %}
{% comment %} check result.body.result[0].isSuccess, not just result.success {% endcomment %}
```

**Retry a failed call in the background**
```liquid
{% function result = 'modules/accela_construct/commands/records/create', record: record, with_retries: true %}
{% comment %}
  result is still this attempt's outcome, returned synchronously. If it
  failed, up to ACCELA_CONSTRUCT_MAX_RETRIES retries are now scheduled in the
  background with increasing delay - see "Background retries" above and
  lib/accela_client/send.liquid. Their outcome is log-only.
{% endcomment %}
```

**Tag a call with a reference object**
```liquid
{% comment %} if `application` was fetched via a query that selected `table`, just pass it: {% endcomment %}
{% function result = 'modules/accela_construct/commands/records/create', record: record, reference: application %}

{% comment %} or, with only an id in hand - `table` gets resolved automatically: {% endcomment %}
{% function result = 'modules/accela_construct/commands/records/create', record: record, reference: { "id": application_id } %}

{% comment %}
  Either way, the accela_request row this call creates carries
  reference_id/reference_schema, so later you can find every Accela call
  made on behalf of this application with:
  {% function requests = 'modules/accela_construct/queries/accela_request/list', reference: { "id": application_id } %}
{% endcomment %}
```

**List and upload documents**
```liquid
{% function docs = 'modules/accela_construct/queries/records/documents/list', record_id: record_id %}
{% function result = 'modules/accela_construct/commands/records/documents/upload',
   record_id: record_id, file_field: file_content, file_name: 'site_plan.pdf',
   content_type: 'application/pdf', description: 'Site plan' %}
```

A working smoke-test page is included at `/accela_construct/test?module=Building`
(remove or lock this down before going to production).

## Supported endpoints

Every function below is `modules/accela_construct/<queries|commands>/<path>`.
The **Params** column lists every param the function itself takes, in
call order, *excluding* `with_retries` and `reference`, which every
single query and command accepts identically (see "Background
retries" and "Request/response logging" above) - repeating them on all 88
rows would just be noise. A plain name means the param is required (this
module's own `check.liquid` rejects the call with `accela_validation_failed`
before ever reaching Accela if it's missing); `name?` means optional;
`name(!)` means required *and* Accela's own docs mark it required
independently of this module's interface contract (everywhere else, a
required body-hash param like `record`/`parcel`/`condition` is required by
*this module's own convention*, not by Accela, which documents those
bodies' individual fields as optional - see "Queries vs. commands" below
and each function's own `check.liquid`).

### Records

| Function | Params | Method | Accela path |
|---|---|---|---|
| `queries/records/get` | `ids`, `expand?`, `fields?` | GET | `/records/{ids}` |
| `queries/records/search` | `criteria?`, `offset?`, `limit?`, `expand?`, `fields?` | POST | `/search/records` |
| `queries/records/describe_create` | `type` | GET | `/records/describe/create` |
| `queries/records/list` | `offset?`, `limit?`, `fields?`, `module?`, `status?` | GET | `/records` |
| `queries/records/mine` | `offset?`, `limit?`, `fields?` | GET | `/records/mine` |
| `queries/records/additional` | `record_id` | GET | `/records/{recordId}/additional` |
| `queries/records/related` | `record_id` | GET | `/records/{recordId}/related` |
| `queries/records/usercomments` (deprecated by Accela) | `record_id` | GET | `/records/{recordId}/usercomments` |
| `queries/records/votes` | `record_id` | GET | `/records/{recordId}/votes` |
| `queries/records/votes_summary` | `record_id` | GET | `/records/{recordId}/votes/summary` |
| `commands/records/create` | `record` | POST | `/records` |
| `commands/records/update` | `id`, `record` | PUT | `/records/{id}` |
| `commands/records/initialize` | `record` | POST | `/records/initialize` |
| `commands/records/delete` | `ids` | DELETE | `/records/{ids}` |
| `commands/records/finalize` | `record_id` | POST | `/records/{recordId}/finalize` |
| `commands/records/additional/update` | `record_id`, `additional?` | PUT | `/records/{recordId}/additional` |
| `commands/records/votes/create` | `record_id`, `vote?` | POST | `/records/{recordId}/votes` |
| `commands/records/usercomments/create` (deprecated by Accela) | `record_id`, `comment?` | POST | `/records/{recordId}/usercomments` |
| `commands/records/related/create` | `record_id`, `related_record_ids(!)` | POST | `/records/{recordId}/related` |
| `commands/records/related/delete` | `record_id`, `child_record_ids` | DELETE | `/records/{recordId}/related/{childRecordIds}` |

### Records/WorkflowTasks, Payments

| Function | Params | Method | Accela path |
|---|---|---|---|
| `queries/records/workflow_tasks/list` | `record_id` | GET | `/records/{recordId}/workflowTasks` |
| `queries/records/workflow_tasks/get` | `record_id`, `id` | GET | `/records/{recordId}/workflowTasks/{id}` |
| `queries/records/workflow_tasks/statuses` | `record_id`, `id` | GET | `/records/{recordId}/workflowTasks/{id}/statuses` |
| `queries/records/workflow_tasks/histories` | `record_id` | GET | `/records/{recordId}/workflowTasks/histories` |
| `queries/records/workflow_tasks/comments_histories` | `record_id` | GET | `/records/{recordId}/workflowTasks/comments/histories` |
| `commands/records/workflow_tasks/update` | `record_id`, `id`, `task` | PUT | `/records/{recordId}/workflowTasks/{id}` |
| `queries/records/payments/list` | `record_id` | GET | `/records/{recordId}/payments` |
| `queries/records/payments/get` | `record_id`, `payment_id` | GET | `/records/{recordId}/payments/{paymentId}` |

### Records/Parcels, Owners, Addresses

Same shape for all three (`<resource>` = `parcels` \| `owners` \| `addresses`;
body param = `parcel` \| `owner` \| `address`):

| Function | Params | Method | Accela path |
|---|---|---|---|
| `queries/records/<resource>/list` | `record_id` | GET | `/records/{recordId}/<resource>` |
| `commands/records/<resource>/create` | `record_id`, `<resource-body>` | POST | `/records/{recordId}/<resource>` |
| `commands/records/<resource>/update` | `record_id`, `id`, `<resource-body>` | PUT | `/records/{recordId}/<resource>/{id}` |
| `commands/records/<resource>/delete` | `record_id`, `ids` | DELETE | `/records/{recordId}/<resource>/{ids}` |

### Records/Conditions

| Function | Params | Method | Accela path |
|---|---|---|---|
| `queries/records/conditions/list` | `record_id` | GET | `/records/{recordId}/conditions` |
| `queries/records/conditions/get` | `record_id`, `id` | GET | `/records/{recordId}/conditions/{id}` |
| `queries/records/conditions/histories` | `record_id`, `id` | GET | `/records/{recordId}/conditions/{id}/histories` |
| `commands/records/conditions/create` | `record_id`, `condition` | POST | `/records/{recordId}/conditions` |
| `commands/records/conditions/update` | `record_id`, `id`, `condition` | PUT | `/records/{recordId}/conditions/{id}` |
| `commands/records/conditions/delete` | `record_id`, `ids` | DELETE | `/records/{recordId}/conditions/{ids}` |

### Records/Inspections, Records/Documents

| Function | Params | Method | Accela path |
|---|---|---|---|
| `queries/records/inspections/list` (record-scoped) | `record_id`, `offset?`, `limit?`, `fields?` | GET | `/records/{recordId}/inspections` |
| `queries/records/inspection_types/list` (record-scoped) | `record_ids` | GET | `/records/{recordIds}/inspectionTypes` |
| `queries/records/documents/list` | `record_id`, `fields?` | GET | `/records/{recordId}/documents` |
| `queries/records/documents/categories` | `record_id` | GET | `/records/{recordId}/documentCategories` |
| `queries/documents/download` | `document_id` | GET | `/documents/{documentId}/download` |
| `commands/records/documents/upload` | `record_id`, `file_field`, `file_name`, `content_type`, `category?`, `description?` | POST | `/records/{recordId}/documents` |
| `commands/records/documents/delete` | `record_id`, `document_ids` | DELETE | `/records/{recordId}/documents/{documentIds}` |

### Inspections

| Function | Params | Method | Accela path |
|---|---|---|---|
| `queries/inspections/all` (unscoped listing/filter) | `module?`, `types?`, `scheduled_date_from?`, `scheduled_date_to?`, `inspector_ids?`, `district_ids?`, `offset?`, `limit?` | GET | `/inspections` |
| `queries/inspections/get` | `ids`, `fields?` | GET | `/inspections/{ids}` |
| `queries/inspections/available_dates` | `type_id(!)`, `record_id(!)`, `start_date(!)`, `offset?`, `limit?`, `fields?` | GET | `/inspections/availableDates` |
| `queries/inspections/histories` | `inspection_ids` | GET | `/inspections/{inspectionIds}/histories` |
| `queries/inspections/related` | `id` | GET | `/inspections/{id}/related` |
| `commands/inspections/schedule` | `inspection` | POST | `/inspections/schedule` |
| `commands/inspections/set_schedule` (schedule a pending inspection) | `id`, `inspection` | PUT | `/inspections/{id}/schedule` |
| `commands/inspections/reschedule` | `id`, `changes` | PUT | `/inspections/{id}/reschedule` |
| `commands/inspections/result` | `id`, `inspection_result` | PUT | `/inspections/{id}/result` |
| `commands/inspections/update` | `id`, `inspection` | PUT | `/inspections/{id}` |
| `commands/inspections/assign` | `ids`, `inspector_id(!)` | PUT | `/inspections/{ids}/assign` |
| `commands/inspections/cancel` | `ids` | DELETE | `/inspections/{ids}/cancel` |
| `commands/inspections/delete` | `ids` | DELETE | `/inspections/{ids}` |
| `commands/inspections/related/create` | `id`, `related_inspection_ids(!)` | POST | `/inspections/{id}/related` |
| `commands/inspections/related/delete` | `id`, `child_ids` | DELETE | `/inspections/{id}/related/{childIds}` |

### Inspections/Checklists, Inspections/Conditions

| Function | Params | Method | Accela path |
|---|---|---|---|
| `queries/inspections/checklists/list` | `inspection_id` | GET | `/inspections/{inspectionId}/checklists` |
| `commands/inspections/checklists/create` | `inspection_id`, `checklist` | POST | `/inspections/{inspectionId}/checklists` |
| `commands/inspections/checklists/delete` | `inspection_id`, `ids` | DELETE | `/inspections/{inspectionId}/checklists/{ids}` |
| `queries/inspections/conditions/list` | `inspection_id` | GET | `/inspections/{inspectionId}/conditions` |
| `queries/inspections/conditions/get` | `inspection_id`, `id` | GET | `/inspections/{inspectionId}/conditions/{id}` |
| `queries/inspections/conditions/histories` | `inspection_id`, `id` | GET | `/inspections/{inspectionId}/conditions/{id}/histories` |
| `commands/inspections/conditions/create` | `inspection_id`, `condition` | POST | `/inspections/{inspectionId}/conditions` |
| `commands/inspections/conditions/update` | `inspection_id`, `id`, `condition` | PUT | `/inspections/{inspectionId}/conditions/{id}` |
| `commands/inspections/conditions/delete` | `inspection_id`, `ids` | DELETE | `/inspections/{inspectionId}/conditions/{ids}` |

### Searches

`queries/records/search` (above) covers Search/records; every other
Search endpoint lives under a new `queries/searches/` namespace. All take
the same `criteria?`/`offset?`/`limit?`/`expand?`/`fields?` shape, except
`global` (plain GET, query-string only) - repeated per row below for
completeness, even though it's identical every time:

| Function | Params | Method | Accela path |
|---|---|---|---|
| `queries/searches/addresses` | `criteria?`, `offset?`, `limit?`, `expand?`, `fields?` | POST | `/search/addresses` |
| `queries/searches/agencies` | `criteria?`, `offset?`, `limit?`, `expand?`, `fields?` | POST | `/search/agencies` |
| `queries/searches/global` | `query?`, `type?`, `modules?`, `offset?`, `limit?`, `sort?`, `direction?` | GET | `/search/global` |
| `queries/searches/assessments` | `criteria?`, `offset?`, `limit?`, `expand?`, `fields?` | POST | `/search/assessments` |
| `queries/searches/contacts` | `criteria?`, `offset?`, `limit?`, `expand?`, `fields?` | POST | `/search/contacts` |
| `queries/searches/costs` | `criteria?`, `offset?`, `limit?`, `expand?`, `fields?` | POST | `/search/costs` |
| `queries/searches/inspections` | `criteria?`, `offset?`, `limit?`, `expand?`, `fields?` | POST | `/search/inspections` |
| `queries/searches/owners` | `criteria?`, `offset?`, `limit?`, `expand?`, `fields?` | POST | `/search/owners` |
| `queries/searches/parcels` | `criteria?`, `offset?`, `limit?`, `expand?`, `fields?` | POST | `/search/parcels` |
| `queries/searches/parts` | `criteria?`, `offset?`, `limit?`, `expand?`, `fields?` | POST | `/search/parts` |
| `queries/searches/professionals` | `criteria?`, `offset?`, `limit?`, `expand?`, `fields?` | POST | `/search/professionals` |

## Known gaps — verify against a real sandbox before production use

This module was built from Accela/platformOS documentation without a live
sandbox, per the requester's choice to scaffold first and add credentials
later. Before relying on it, verify:

- **Newly added endpoints' field-level requirements** (everything in
  [Supported endpoints](#supported-endpoints) beyond the original
  records/inspections/documents core): a representative sample of ~15
  endpoints across every resource category was individually verified
  against Accela's per-endpoint docs at
  `developer.accela.com/docs/api_reference/v4.*.html` (confirming, among
  other things, that Accela documents essentially no request-body field as
  hard-required anywhere in the API — required-ness is agency/record-type
  configured, not fixed in the schema — with the handful of genuine
  exceptions marked `(!)` in the table above). The remaining ~70 endpoints
  follow the same structural pattern by extension but were not
  individually re-verified field-by-field; if an endpoint's actual required
  fields differ from what's documented here, only `check.liquid`'s
  presence checks need updating — `build.liquid`'s path/payload
  construction is generic and doesn't hardcode field names it doesn't need.
- **Multipart document upload** (`commands/records/documents/upload/build.liquid`,
  `api_calls/accela_post_multipart.liquid`): platformOS's `post_multipart`
  request type is documented to exist, but the exact Liquid syntax for
  attaching a raw binary part inside an API Call Notification body is not
  documented. The current implementation is a best-effort scaffold.
- **`{% function %}` calls inside an API Call Notification body**: both
  generic templates (`api_calls/accela_{generic,post_multipart}.liquid`)
  build their `to:` URL by calling `modules/core/queries/constants/find`
  inline inside the `to:` frontmatter string (a `{% function %}` tag with
  no output, immediately followed by `{{ accela_base_url }}{{ data.path }}`
  on the same line). Every other `{% function %}` call in this module is
  inside a page or a `{% liquid %}`-block lib file, contexts already
  proven to support it; whether an API Call Notification template's own
  frontmatter renders custom tags (as opposed to just `{{ }}` output,
  which it already does for `data.app_id` etc.) the same way has not been
  independently confirmed. If it doesn't, fall back to reading
  `context.constants['ACCELA_CONSTRUCT_BASE_URL']` directly there (as earlier
  versions of this module did) instead of going through the query.
- **`{% liquid %}` multi-statement tag, native hash-literal `assign`,
  dot-notation `assign` (`assign object.key = value`), and string
  interpolation in `assign`**: every file in this module uses one
  `{% liquid ... %}` block per file (instead of many separate single-line
  `{% tag %}`s), builds/patches hashes with `assign x = { "key": value }`
  and `assign x.key = value` (instead of `capture` + `parse_json`, or a
  `hash_merge` filter this module no longer uses at all), and builds
  URLs/query strings/form bodies with `assign x = "text {{ var }} text"`
  (instead of `capture`). Unlike when this caveat was first written, these
  aren't just inferred from documentation — pos-module-core's own shipped
  source uses every one of these constructs (e.g. `modules/core/public/lib/commands/email/send/check.liquid`
  does `assign object.valid = c.valid`; `modules/core/public/lib/validations/presence.liquid`
  is a bare `{% liquid %}` block ending in `return c`), which is meaningful
  corroboration since core is officially maintained by platformOS. Still
  worth a live smoke test on your instance before relying on this in
  production, since none of this has been exercised outside these two repos.
- **Binary document download** (`documents/download.liquid`): assumes
  `response.body` is JSON-parseable, which is wrong for a binary stream.
  Confirm how `api_call_send` exposes binary/non-JSON response bodies
  (likely base64) and adjust `lib/accela_client/send.liquid` accordingly, e.g. by
  passing a `raw_response: true` flag that skips `parse_json`.
- **`json` Liquid filter**: used throughout to serialize hashes into JSON
  strings for request bodies/constants. Confirm this filter is available on
  your platformOS instance (it's a common Liquid extension but wasn't
  independently confirmed in the docs pulled for this module); if not,
  switch to explicit string concatenation or `to_json`/`hash_to_json` if
  that's what your instance provides.
- **`constant_set` from a migration** with `<%= template_value %>`
  interpolation: observed in other shipped modules (e.g. `payments-stripe`)
  but not documented as an official pattern. Confirm it works, or set
  constants manually via GraphiQL instead.
- **No `client_credentials` OAuth grant**: Accela's docs only document
  `password`, `authorization_code`, `token` (implicit), and `refresh_token`.
  This module uses `password` grant (resource owner credentials) since
  that's the standard approach for unattended agency-side integrations.
  There's also a separate, non-OAuth "App credentials" header auth
  (`x-accela-appid` + `x-accela-appsecret`) for a narrower set of endpoints,
  not currently wired up.
- **Accela can return HTTP 200 with an embedded error** (EMSE server-side
  scripting failures surface as `{"message": "EMSE operation failed.",
  "code": "emse_error"}` inside a 2xx response). `lib/accela_client/send.liquid`
  currently treats any 2xx as `success: true` — add a check for
  `body.code == 'emse_error'` if your agency uses EMSE scripts.
- **Rate limits**: Accela exposes `x-ratelimit-*` response headers but
  publishes no fixed numeric limit. This module doesn't currently read or
  react to those headers — add backoff logic if you hit 429s in practice.
- **`accela_request`/`accela_request_response` have no retention policy**:
  every logical request and every attempt against it is logged (see
  "Request/response logging" above) and nothing ever prunes old rows. On
  a busy integration these tables grow unbounded - add a scheduled
  cleanup (e.g. a `{% background %}` job deleting rows past some age)
  before relying on this in a high-volume production environment.
  `accela_request_response` also stores response bodies as plain text:
  for the binary document-download gap noted above, whatever
  `response_body` ends up holding for that endpoint is whatever
  `send.liquid` put in `result.raw` - fix that gap first if you need those
  rows to be meaningful. The full raw body is stored even for large
  successful responses (e.g. a `searches/*` call returning close to the
  1000-record Accela max) - if that turns out to matter, cap/truncate
  `response_body` for successful attempts rather than storing it
  unconditionally.
- **`accela_client/resolve_reference_table.liquid` assumes `records()`
  can look up any record by `id` alone, across every table in the
  instance, without a `table` filter.** This is what makes
  `reference: { "id": ... }` (without `table`) work for *any* platformOS
  record, not just ones this module knows about - but it hasn't been
  exercised against a live instance. If `id` values aren't actually
  unique across tables (e.g. two unrelated tables both happen to have a
  row with the same numeric id) or `records()` requires a `table` filter
  to return anything, the lookup will return the wrong record's `table`
  or nothing at all. Verify this before relying on the auto-resolve path
  in production - passing `reference: fetched_record` directly (skipping
  the lookup entirely, since you already have `table`) sidesteps this
  gap completely.
- **The whole retry chain depends on the `accela_request` write on
  attempt 1 succeeding** - and this is a bigger deal than it sounds,
  since `perform_retry_attempt.liquid` fetches `method`/`path`/`payload`
  from that row rather than carrying them through the chain (see point 5
  above). `log_request.liquid` only creates an `accela_request` row on
  attempt 1 (when `request_id` is blank); if that specific write fails,
  `request_id` comes back blank and `send.liquid` schedules the retry with
  it anyway. `perform_retry_attempt.liquid` guards the obvious
  consequence - it checks whether `queries/accela_request/get` actually
  found a row before calling `send`, and logs `accela_retry_exhausted` and
  gives up if not, rather than calling `send` with a nil `method`/`path`.
  So the failure mode is contained (no crash, no malformed Accela call),
  but the retry chain still silently stops instead of ever resending the
  original request. In other words: under the *old* single-table design
  this failure mode only broke correlation (cosmetic); under this one it
  aborts the retry outright. In practice this only matters if the
  `accela_request` write fails on attempt 1 specifically but the rest of
  the module's writes keep working (if writes are failing consistently,
  there's nothing to retry against anyway).
- **Retry/logging orchestration lives inside `send.liquid` itself**,
  which the file's own header still describes as a plain "generic
  authenticated Accela API request." A cleaner layering would keep
  `send.liquid` a pure one-call HTTP function and move retry-scheduling +
  logging into a thin wrapper that all 88 query/command files call
  instead - `perform_retry_attempt.liquid` already has to work around
  `send.liquid` doing more than transport (it must never pass
  `with_retries: true` back in, to avoid re-triggering scheduling from
  inside a retry). Not fixed here since it would mean repointing all 88
  call sites, which is out of scope for the current diff. A related,
  smaller version of the same issue: "should this attempt retry at all"
  (`send.liquid`'s `with_retries`/success/method/`max_retries>0` check)
  and "should the chain continue" (`perform_retry_attempt.liquid`'s
  success/`retry_number` vs `max_retries` check) are two independently
  written predicates that happen to agree today only because retryability
  is currently trivial (any non-2xx, non-MULTIPART failure qualifies). If
  retry eligibility ever grows real rules (e.g. only retry 5xx, never
  retry `DELETE`), that rule has to be added and kept in sync in both
  places rather than owned by one shared predicate - same root cause as
  the layering point above, not a new problem to fix separately.
- **The retry chain's arithmetic (`schedule_retry.liquid`'s backoff delay,
  `perform_retry_attempt.liquid`'s exhaustion check) has no automated test
  coverage**, unlike this module's other pure/deterministic helpers
  (`error_result`, `build_query_string`, both unit-tested in
  `test/accela_client_test.liquid`). Calling `schedule_retry`/
  `perform_retry_attempt`/`send` directly from a test would trigger real
  background-job scheduling and (for `send`) a real Accela HTTP call,
  which this module's test suite deliberately avoids elsewhere (see
  "Running the test suite" above) - the arithmetic itself is simple enough
  to reason about by inspection, but hasn't been exercised beyond that and
  the manual live-instance smoke test already called for below. A
  structural CI check that every query/command file forwards `with_retries`
  (guarding against a future new endpoint silently omitting it) was also
  considered and rejected as a *test* specifically - `pos-module-tests`
  runs as Liquid inside platformOS, which has no filesystem access to walk
  this module's own file tree at runtime; that check would need to be a
  separate build-time/CI script, not a `*_test.liquid` file.
- **`with_retries` has no idempotency awareness**: the same boolean is
  exposed identically on read-only queries/searches (safe to retry blindly)
  and mutating commands like `records/create` (a retried POST after a
  timeout could double-create a record if the original request actually
  reached Accela). This module doesn't currently distinguish the two -
  decide per call site whether retrying is actually safe for that specific
  write before enabling `with_retries` on a command.
- **`{% background %}`'s native `max_attempts` isn't used for retry
  backoff**: platformOS's background/consumer system has its own built-in
  automatic-retry-with-increasing-delay behavior (see pos-module-core's
  docs on consumer `max_attempts`), which could in principle replace this
  module's own hand-rolled `schedule_retry.liquid`/`perform_retry_attempt.liquid`
  recursion. Kept the hand-rolled version instead because (a) the native
  backoff schedule isn't documented as configurable via a constant, which
  the user's ask explicitly required, and (b) it's unconfirmed whether the
  native mechanism triggers on a background block completing with an
  application-level failure (this module's `send.liquid` returns
  `{success: false}` rather than raising an error) or only on an actual
  unhandled exception - adopting it without confirming that would trade
  one unverified assumption for another instead of removing one.
- **Access token lifetime**: Accela shortened access tokens to 15 minutes
  (May 2024). `get_valid_token.liquid` refreshes 60 seconds early; adjust if
  Accela's actual sandbox behavior differs.
- **`{% background %}` semantics for retries** (`lib/accela_client/schedule_retry.liquid`,
  `perform_retry_attempt.liquid`, `send.liquid`): all three schedule work
  via the direct-invocation form (`background result_var = 'modules/.../some_function',
  data: some_hash, priority: ..., max_attempts: ...`, e.g.
  `schedule_retry.liquid`'s `background attempt_job = 'modules/accela_construct/accela_client/perform_retry_attempt',
  data: retry_data, priority: 'low', delay: delay_minutes, max_attempts: 1`),
  rather than the block form (`background priority: ... \n ... \n endbackground`).
  This assumes `data:` reaches the invoked function as its own `data`
  parameter the same way a normal `{% function %}` call would, and that a
  background job is itself allowed to schedule another background job
  this way (needed for retry attempt 2+, since `perform_retry_attempt.liquid`
  already runs inside one - and, now, for every retry attempt's log write
  too, since `send.liquid` backgrounds its own logging call whenever
  it isn't the one triggering the next retry, which is always true when
  `send.liquid` is invoked from inside `perform_retry_attempt.liquid`).
  None of this was exercised against a live instance for this module - if
  nesting isn't supported, only the first retry will ever fire (and
  retry-attempt log rows may simply never get written); if `data:` isn't
  delivered the way assumed, every retry attempt will fail immediately with
  a Liquid error instead of re-attempting the Accela call. Smoke test by
  calling any command with `with_retries: true` against an endpoint you
  know will fail (e.g. a bad path) and checking for the
  `accela_retry_scheduled` → `accela_retry_succeeded`/`accela_retry_exhausted`
  log sequence, plus checking `accela_request`/`accela_request_response` for
  the corresponding rows.
- **API Call Notification template naming for pos-module-core's own
  templates**: this module deliberately does NOT use core's generic
  `modules/core/api_calls/generic`/`generic_x_form_encoded` *templates*
  (as opposed to its `api_calls/send` *graphql mutation*, which it does
  use). Those two templates have no `name:` field in their frontmatter,
  and the one confirmed usage example found in core's own source passes
  `template: 'modules/core/generic'` — a path-style identifier that drops
  the `api_calls/` segment present in the file's actual path
  (`modules/core/public/api_calls/generic.liquid`). Since every one of
  *our own* templates (`api_calls/accela_*.liquid`) instead declares an
  explicit `name:` and is referenced by that literal name, and the exact
  rule platformOS uses to resolve an unnamed template to a `template: {name: X}`
  lookup isn't confirmed, this module keeps its own 3 templates
  (`accela_generic`, `accela_post_multipart`, `accela_token_request`)
  rather than gambling on an unconfirmed identifier. If you confirm the correct
  identifier on your instance, `commands/records/documents/upload`'s and
  `get_valid_token.liquid`'s hand-built bodies could shrink further by
  switching to core's generic templates.
- **`lib/legacy/to_legacy_record.liquid`** was built by diffing exactly one
  before/after pair of real responses, not from any documented mapping -
  every field it derives (`recordId`'s `downcase`, `availableInspGroup`'s
  `upcase`, the `addressArr[].address` format string, `tpia`'s "find the
  non-Removed TPIA condition" rule) held consistently across that one
  record's ~14 conditions and 1 address, but hasn't been checked against a
  second record. `userID`, `recInsps`, `messages`, `wallCheckRequired`, and
  `wallCheckComplete` have no v4 field behind them at all in that sample
  (every condition carried the same literal `userID` regardless of what
  triggered it, and the other four were simply absent) - they're taken
  as-is from this function's params rather than guessed at. Verify against
  a few more real records, especially ones with a non-"TPIA" condition
  name, before trusting this for anything beyond the one record shape it
  was built from.

## Running the test suite

Tests use [pos-module-tests](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-tests)
(the `tests` platformOS module, `"tests": "^1.3.4"` in `pos-module.json`) —
install/deploy it alongside this module to run them. Test files live under
`public/lib/test/**/*_test.liquid` (15 files, ~330 assertions total):

- `test/accela_client_test.liquid` — unit tests for the pure helpers
  (`error_result`, `build_query_string`).
- `test/commands/*_test.liquid` (6 files) — for every command, calls
  `build.liquid`/`check.liquid` **directly** (deterministic, no network:
  asserts `check.liquid` rejects missing required fields and accepts valid
  ones via `valid_object`/`invalid_object`, and asserts `build.liquid`
  produces the exact expected `path`/`payload`), plus calls the full
  orchestrator **only** with a required param missing, asserting it
  returns `{success: false, error: "accela_validation_failed"}` — that
  path is guaranteed to short-circuit before any network I/O. No test
  ever calls an orchestrator with complete/valid params, since that would
  attempt a real HTTP request to Accela.
- `test/queries/*_test.liquid` (9 files) — **contract/shape smoke tests
  only**. Queries now have the same build/check split as commands (see
  "Queries vs. commands" below), but these tests still call the full
  orchestrator with plausible, valid dummy params for every required
  field rather than exercising `build.liquid`/`check.liquid` directly the
  way `test/commands/*_test.liquid` does - so every call here passes
  validation and always attempts the real `send` → `get_valid_token` →
  Accela HTTP chain. They assert `not_true` on `result.success` +
  `presence` on `result.error` - i.e. they verify the call completes and
  returns the documented envelope shape, **not** that the path/query-string
  built was correct, or that check.liquid actually rejects missing
  required params (unlike the command tests, which test that rejection
  path directly - queries' check.liquid layer is exercised structurally
  by every real call but has no dedicated unit test yet). This only
  holds when no live Accela credentials are configured, which is the
  expected state for automated test runs; with real credentials
  configured in a staging environment, some of these assertions would
  need to expect success instead. `test/queries/accela_oauth_token_test.liquid`,
  `test/queries/accela_request_test.liquid`, and
  `test/queries/accela_request_response_test.liquid` are the three
  exceptions — they only read their own local table (no outbound HTTP
  call), so they're asserted concretely; the latter two filter by a
  path/`request_id` that can't exist rather than asserting the table is
  empty, since real usage writes to both continuously (see
  "Request/response logging" below).

Run via browser at `/_tests` (staging/development only) or in CI with
`pos-cli test run <env>`.

## File map

```
modules/accela_construct/
├── pos-module.json
├── template-values.json
├── README.md
└── public/
    ├── schema/{accela_oauth_token,accela_request,accela_request_response}.yml
    │                                       (tables created/synced from these directly on deploy - no migration needed)
    ├── migrations/
    │   └── ..._set_accela_constants.liquid   (seeds Constants data - the one thing migrations are actually for here)
    ├── graphql/
    │   ├── accela_oauth_token/{create,update,find_latest}.graphql
    │   ├── accela_request/{create,get,list}.graphql
    │   ├── accela_request_response/{create,list}.graphql
    │   ├── reference/get_table.graphql        (generic any-table lookup by id)
    │   └── constants/set.graphql
    ├── api_calls/
    │   ├── accela_token_request.liquid
    │   ├── accela_generic.liquid
    │   └── accela_post_multipart.liquid
    ├── views/pages/accela_construct/test.liquid
    └── lib/
        ├── accela_client/
        │   ├── get_valid_token.liquid
        │   ├── send.liquid
        │   ├── schedule_retry.liquid
        │   ├── perform_retry_attempt.liquid
        │   ├── log_request.liquid
        │   ├── resolve_reference_table.liquid
        │   ├── error_result.liquid
        │   ├── build_query_string.liquid
        │   └── post_search.liquid
        ├── queries/                     (read-only; see Supported endpoints;
        │   │                              each action = orchestrator + build.liquid + check.liquid,
        │   │                              same as commands - except the 4 below, which are plain
        │   │                              single-file GraphQL reads with no Accela call to validate)
        │   ├── accela_oauth_token/find.liquid
        │   ├── accela_request/{get,list}.liquid
        │   ├── accela_request_response/list.liquid
        │   ├── records/**/*.liquid          (81 files: 27 actions x 3, across top-level +
        │   │                                 parcels/owners/addresses/conditions/workflow_tasks/payments/
        │   │                                 documents/inspections/inspection_types - the last three moved
        │   │                                 here from queries/documents/, queries/inspections/ since they
        │   │                                 wrap /records/{recordId}/... paths, not /documents/ or
        │   │                                 /inspections/. `inspection_types` (Accela's "Get Inspection
        │   │                                 Types" endpoint, GET /records/{recordIds}/inspectionTypes) is
        │   │                                 its own sub-resource, not part of `inspections` - it lists
        │   │                                 the inspection *types* configured for a record, not actual
        │   │                                 inspection instances)
        │   ├── inspections/**/*.liquid       (27 files: 9 actions x 3 - only endpoints actually
        │   │                                  under /inspections/..., see above)
        │   ├── documents/*.liquid            (3 files: 1 action x 3 - only `download`, the one
        │   │                                  documents endpoint not scoped under /records/{recordId}/)
        │   └── searches/*.liquid             (33 files: 11 actions x 3 - build.liquid is a no-op for 10 of
        │                                      these, since post_search.liquid does the real work)
        ├── commands/                    (mutating; see Supported endpoints)
        │   ├── records/**/*.liquid           (each action = orchestrator + build.liquid + check.liquid;
        │   │                                  includes documents/{upload,delete}, moved here for the
        │   │                                  same reason as the queries above)
        │   └── inspections/**/*.liquid
        ├── legacy/
        │   └── to_legacy_record.liquid  (pure data reshape, no Accela call - see below)
        ├── events/
        │   └── accela_construct_request_succeeded.liquid  (validates the event send.liquid broadcasts - see below)
        └── test/                        (pos-module-tests suite; see above)
            ├── accela_client_test.liquid
            ├── queries/*_test.liquid            (9 files)
            └── commands/*_test.liquid           (6 files)
```

318 files total. Every `<action>.liquid` query or command orchestrator has
an `<action>/build.liquid` and `<action>/check.liquid` sibling (never an
`execute.liquid` — see "Queries vs. commands" below). Run
`find public/lib -type f | sort` for the literal list.

## Queries vs. commands

Following the [platformOS module conventions](https://documentation.platformos.com/developer-guide/modules/platformos-modules.md)
used by the [core module](https://github.com/Platform-OS/pos-modules/blob/master/pos-module-core/README.md),
resource wrappers are split by whether they read or write:

- **`lib/queries/<resource>/<action>`** — read-only Accela calls, one per
  GET endpoint. See [Supported endpoints](#supported-endpoints) for the
  full list (records, records/{parcels,owners,addresses,conditions,
  workflow_tasks,payments,documents,inspections,inspection_types},
  inspections, inspections/{checklists,conditions}, documents, searches -
  `documents` and `inspections` appear twice because most of their
  endpoints are record-scoped [`/records/{recordId}/...`, live under
  `records/`] while a few (`documents/download`, and every top-level,
  unscoped `inspections/*` endpoint like `/inspections`, `/inspections/{ids}`)
  aren't; `records/inspection_types` is its own sub-resource, not part of
  `records/inspections` - it lists the inspection *types* configured for
  a record, not actual inspection instances).
- **`lib/commands/<resource>/<action>`** — calls that create or mutate
  something in Accela, one per POST/PUT/DELETE endpoint. See
  [Supported endpoints](#supported-endpoints) for the full list.
- **`lib/accela_client/`** — shared transport plumbing used by every query
  and command above; not part of the public per-resource API:
  - `send`/`get_valid_token` — token retrieval/refresh and the generic
    authenticated request (via pos-module-core's `api_calls/send`).
  - `error_result` — builds the `{ success: false, status: null, ... }`
    failure envelope; used by `send.liquid`'s own failure branches and by
    every query/command's validation-failure branch, so that shape is
    defined once instead of retyped at each call site. Also logs the
    error via `{% log %}` (type `"accela_error"`), tagged with the
    caller's own module path - every query/command orchestrator passes
    its own path (verbatim from its own doc comment header) as `caller`
    into both its own `error_result` call and its `send`/`post_search`
    call (which forwards it back to `error_result` if the live Accela
    call itself fails), so a failure in the logs is always labeled with
    which endpoint it came from, not just the bare error string.
  - `build_query_string` — joins a hash of optional query params into a
    `key=val&key=val` string (skipping blanks, url-encoding values); used
    by every query that takes optional filter params instead of each one
    hand-rolling `&`-joining differently. (No pos-module-core equivalent
    exists for this one — it's module-specific.)
  - `post_search` — the shared implementation behind every
    `lib/queries/searches/<resource>.liquid` (all of them except `global`,
    which is a plain GET): builds the `/search/<resource>?<qs>` path and
    JSON criteria payload once, since all 10 were otherwise byte-for-byte
    identical apart from the resource name. Each `searches/<resource>.liquid`
    file still exists on its own — same one-file-per-endpoint convention
    as everywhere else — it just delegates to this helper for its body.

Both queries and commands follow the
[pos-module-core build/check/execute workflow](https://github.com/Platform-OS/pos-modules/blob/master/pos-module-core/README.md),
adapted to skip a separate execute file: every
`lib/{queries,commands}/<resource>/<action>.liquid` is a thin orchestrator
around two sibling files in `<resource>/<action>/`, and executes the
request itself:

1. **`build.liquid`** — normalizes the params into an `object` hash and
   prepares the Accela request: the request path (relative to
   `ACCELA_CONSTRUCT_BASE_URL` - see "How it's built" above) and, for
   commands, the JSON-serialized request body (`payload`, or `file_info`
   for the multipart upload).
2. **`check.liquid`** — validates that required params are present using
   pos-module-core's validation contract convention: builds a local
   `c = { "errors": {}, "valid": true }`, calls
   `modules/core/validations/presence` once per required field, then
   copies `c.valid`/`c.errors` onto `object.valid`/`object.errors`. For
   queries, "required" means a param the endpoint is structurally
   meaningless without (an id/type used to build the path or an
   Accela-required filter), never an optional filter/pagination param -
   many queries (e.g. `records/list`, `records/search`, every
   `searches/*`) have nothing to validate at all, so their `check.liquid`
   just sets `valid: true` unconditionally. Commands validate required
   body fields the same way.
3. **execute step, inlined in the orchestrator** — if `object.valid`, calls
   `lib/accela_client/send` (or, for `searches/*`, `post_search`) with the
   fields `build.liquid` prepared and returns the normalized response.
   `searches/*` queries delegate their actual path-building to the shared
   `post_search.liquid` helper (see below), so their own `build.liquid` is
   a no-op passthrough - kept only for structural consistency, not because
   there's anything to build there.

The orchestrator returns that response on success, or a
`{ success: false, error: "accela_validation_failed", errors: {...} }`
result (without ever calling Accela) when `check.liquid` fails.

## Events

Following [pos-module-core's events convention](https://github.com/Platform-OS/pos-modules/blob/master/pos-module-core/README.md#events),
`lib/accela_client/send.liquid` broadcasts a `modules/core/commands/events/publish`
event of type `accela_construct_request_succeeded` after every successful
Accela attempt (this one or a retry) - never on failure. Its payload
identifies which request it was via `caller` (the query/command's own
module path), `method`, `path`, `reference` (the `{ "id", "table" }` this
call was made on behalf of, if any), `attempt_number`, and the ids of the
two log rows `log_request.liquid` writes for this attempt:  `request_id`
(the `accela_request` row - one per logical request, shared across
retries) and `response_id` (the `accela_request_response` row - one per
attempt). Getting both ids into the event is the reason a *successful*
attempt's log write is synchronous rather than backgrounded (a non-retried
*failure*'s write still runs in the background, since nothing needs its
ids and no event fires) - see send.liquid's doc comment and
`lib/events/accela_construct_request_succeeded.liquid` (the event's
validated shape) for the full explanation.

To react to it, add your own consumer at
`lib/consumers/accela_construct_request_succeeded/<your_consumer_name>.liquid`
(see pos-module-core's docs linked above) - this module doesn't ship one
itself, since what to do on success is entirely app-specific.

## Legacy response shape (backwards compatibility)

`lib/legacy/to_legacy_record.liquid` reshapes a v4 record (`queries/records/get`
with `expand: 'addresses,conditions,owners'`, then `.body.result.first`) into
the flatter shape an older, pre-v4 integration's consumers still expect -
useful when rolling this module out in front of code you don't want to
rewrite in lockstep. It's a pure data reshape (no Accela call of its own),
so it composes with any query that returns a v4 record, not just `get`:

```liquid
{% liquid
  function result = 'modules/accela_construct/queries/records/get', ids: 'B120434', expand: 'addresses,conditions,owners'
  function legacy = 'modules/accela_construct/legacy/to_legacy_record', record: result.body.result.first, user_id: 'NEARME'
%}
```

Most fields are a straight rename (`appStatus` <- `status.text`, `workDesc`
<- `description`, ...); see the doc comment at the top of
`to_legacy_record.liquid` for the full field-by-field mapping, including how
`addressArr[].address` and `capConditions[]` are built up from the v4
`addresses[]`/`conditions[]` arrays. Four legacy fields have no v4
equivalent at all and are only as good as what you pass in - see Known Gaps
below: `recInsps`, `messages` (both default `[]`), and
`wallCheckRequired`/`wallCheckComplete` (both default `false`).
