# 12 — platformOS gotchas this module will hit

Sources: platformOS Agent Playbook (`.claude/rules`, `.claude/knowledge`), pos-module-mcp decision records, pos-cli README, this project's research. Read before writing any file. Each line: the trap → what to do here.

## Deploy and tooling
- `pos-cli deploy` deletes what the project does not contain and ignores the env name when `MPKIT_*` is set → use `deploy-start` with `env`; never `pos-cli deploy`.
- A clean `deploy-dry-run` misses invalid property types, duplicate translation keys and missing authorization policies → also run `validate_code` and read the real deploy result.
- One malformed YAML file fails the whole changeset → validate schema/translations before every deploy.
- `validate_code` checks the buffer you send, not the file → send the exact bytes, all related files in one call.
- `must_fix_before_write: false` is not "correct" → still test.
- `app/lib/**` deploys as partials; a missing command is reported as a missing partial.
- Staging sends API calls only when enabled in the Partner Portal → enable before testing SendGrid (04 §1).

## Pages and routing
- `method: post` lowercase; a POST page 404s on GET; slugs have no leading slash.
- JSON endpoints need `format: json` (or a `.json.liquid` name), not both.
- `layout: ''` for no layout; `layout: false` fails the deploy.
- Never name a param `slug` or `action` → our route params are `:id` and `:secret`.
- Two pages on one slug both deploy and one silently wins → keep one file per slug; check when an endpoint returns the wrong content type.
- Any file under `views/pages/` is a live URL → no scratch pages; delete spike pages.
- `redirect_to` in frontmatter runs before the body → use the `{% redirect_to %}` tag after the write.
- Set status with `{% response_status 404 %}`, not `context.statusCode`.
- CSRF is not enforced for you → check `context.csrf_request_valid` on every POST under `support-desk`.

## Users, roles and access (D-24, D-25)
- `modules/user/commands/user/create` with `roles: null` gives the profile `USER_DEFAULT_ROLE` (platformOS Community: `member`, i.e. full community access) → support-only accounts are created with `roles: []`.
- `can_do` returns true for `superadmin` before looking at permissions, but **not** when an `access_callback` is given → `can/desk` must handle superadmin itself (the gate auto-creates its membership).
- `can_do_or_unauthorized` redirects anonymous visitors to the host's `/sessions/new` → the desk gate redirects to `/support-desk/sign-in` itself and never passes `redirect_anonymous_to_login: true`.
- Host admin layouts may bounce anyone without `admin_pages.view` (platformOS Community `layouts/admin`) → no desk page uses a host layout.
- Role names are not standard (`admin`, `superadmin`, `staff`…) → detect staff by the `admin_pages.view` permission, never by a role name.

## Liquid
- No bare globals; everything is under `context.`; a typo renders empty.
- Params are strings: `"false"` is truthy → compare `== 'true'`.
- No ternary, no parentheses in conditions, no assigning a comparison, no filters inside conditions → assign first, nest `if`s.
- A string containing `%}` ends the tag early → never put `%}` in a string (matters for email templates and regexes).
- Hash literals use JSON quotes `{ "k": "v" }`; single quotes fail the deploy. Build hashes inside loops (shared by reference otherwise).
- `parse_json` on invalid JSON raises a 500 → validate SendGrid's JSON fields (`envelope`, `charsets`, `attachment-info`) with `{% try %}` before parsing.
- `parse_json`/`hash_assign` are deprecated → hash literals and `assign h['k'] = v`.
- A filter in a tag argument is silently dropped → assign the filtered value first (e.g. before `background` and `function` calls).
- Array filters return new arrays → `assign list = list | array_add: x`.
- Hashing: `digest: 'sha256'`, HMAC: `compute_hmac: secret, 'sha256'` (no `sha256`/`hmac_sha256` filters).
- `{% background %}` needs `job_id = 'path'`; a bare background block fails the deploy. Variables are not inherited — pass every value explicitly; context is copied with limits.
- `{% cache %}` keys have no user component → include department scope and settings version in the key.
- `{{ x | json }}` inside `<script>` is HTML-escaped → pass data through `data-*` attributes or a `format: json` endpoint (also noted in our BuildHub memory).
- Partials: render by logical name (`'modules/support/queue/row'`), never by file path; declare params in `{% doc %}`; no `{% graphql %}` in partials.
- Module references drop `public/` and `lib/`: `modules/support/commands/…`, `modules/support/queries/…`.
- Translations: start each file with `en:`; one key in one file only; use `| t` / `| t_escape` (user values) / `| l`; quote boolean-looking keys.

## GraphQL and data
- Module tables are `modules/support/<table>` → a bare name fails writes and returns zero rows on reads.
- `records` requires `per_page`; scope with `filter: { table: { value: "modules/support/ticket" } }`.
- Read custom fields with `property(name:)` / `property_int` / `property_boolean` / `property_json` / `property_array`, aliased.
- Filter type is `PropertyFilterInput`; sort custom fields via `sort: [{ properties: [{ name, order }] }]` (built-ins inside `properties` are silently ignored).
- `increment`, `array_append`, `array_remove` work only on `record_update` → ticket counter, tag edits.
- `record_update` takes no `table`; `record_delete` requires `table`.
- No ownership checks in GraphQL → load through a scoped query before any by-id write.
- Guard non-null variables before `{% graphql %}`; a missing one 500s the page.
- A property-name typo fails loudly on write and silently on read → compare with the schema when a value renders blank.
- `api_call_send` returns errors for transport problems; check `response.status` too (SendGrid 202).

## Module and platform
- No runtime file enumeration → explicit registration lists (MCP registry, hooks found by `hook/search`).
- No cron → delayed `background` jobs and a self-rescheduling sweep (06 §4).
- The user module has no permission hook, and host role names differ → never patch the host's permissions file; desk access comes only from `team_member` through `can/desk` (D-12, D-24).
- Constants never show in `{{ context }}` dumps → check with `constants-list`.
- Platform behaviour is per instance → if something here does not reproduce, read `admin_current_instance { feature_flags }` before assuming the docs are wrong.
- Assets: `{{ 'modules/support/…' | asset_url }}`; never hardcode `/assets/…`. Top-level `assets/sw-*.js` is served at the domain root (special case) — relevant only to the service-worker fallback.
- **`constant_set` inside a request** (found in TASK-6): after it runs, other constants can read as blank for the rest of that request in some contexts (seen in the test runner's `run.js`). Write constants last, after every call that needs `context.constants`, and never use a constant as a cache version.
- **`api_call_send` with a null `body`** fails with `unknown attribute 'body' for ApiCallNotification`: use a separate mutation without `body` for GET requests.
- **Settings written by another request** are not visible to a request that already read them (per-request memo); tests that check what another request stored read the record directly.
- **JSON from a page** (found in TASK-30): a page with a layout wraps whatever it echoes, so a JSON endpoint for `fetch` needs `layout: ''`; `context.headers.HTTP_ACCEPT` did not carry the browser's `Accept` header, so send an explicit form field (`respond=json`); output with `| json | html_safe`, or quotes come out as `&quot;`.
- **Never output a `capture` with `| html_safe`** (found in the performance & security test run, 2026-10-30): `{{ card }}` prints the captured tags as text, and `{{ card | html_safe }}` also decodes the entities inside it, so escaped user text (`&lt;script&gt;` from a subject, note or reply) becomes live markup — a stored XSS on the ticket page. Put the markup in a partial and `render` it where it is needed. Capturing a `render` into a variable that is sent as data (email bodies) is fine; the problem is only `html_safe` on output.
- **common-styling styles only some input types** (found in TASK-32): its form rules match `[type=text|email|password|url|datetime]`, so `search`, `number`, `time` and type-less inputs render as browser defaults (white bars in dark mode). The desk styles every input type itself in `pos-support.css`.
- **common-styling's tokens are not in a CSS layer** (found in TASK-32): overriding `--pos-color-*` from inside `@layer pos-support` has no effect; such overrides sit outside the layer, after the common-styling stylesheets and before the host's.
- **`export` from a rendered partial** reaches the layout (`context.exports`), which renders after the page; the desk uses it for the browser title (`namespace: 'support_page'`).
