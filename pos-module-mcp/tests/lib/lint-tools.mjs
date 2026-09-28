#!/usr/bin/env node
/**
 * pos-module-mcp — tool linter (static, dev-time; spec §12.1/§12.3 + author-boundary
 * enforcement).
 *
 * Reads the app's Layer-2 tool sources (registry + each tool's manifest, handler, and
 * any bespoke GraphQL) and flags security/quality issues the engine's runtime
 * meta-schema cannot see — because it never has the handler/query source. This turns
 * the "Security boundaries — what the engine does NOT do for you" doc into an
 * automated gate.
 *
 * Run:   node tests/lib/lint-tools.mjs [--strict] [--json] [--include-vuln]  (also imported by lint-tools.test.mjs)
 *   --strict        warnings also fail the run (default: only errors fail)
 *   --json          machine-readable output
 *   --include-vuln  also lint the vuln_* negative-control fixtures (see below)
 * Exit:  0 clean · 1 findings at the failing level · 2 setup error
 *
 * The vuln_* tools are DELIBERATELY-insecure negative controls for the RUNTIME agentic-eval
 * (gated behind MCP_ENABLE_VULN_TOOLS) — they exist to be *detected as vulnerable* at
 * runtime, not to pass a static author-boundary gate. So this linter SKIPS them by default;
 * pass --include-vuln (or lintAll({ includeVuln: true })) to analyze them anyway.
 *
 * It is fully static — no instance, no network, no deps. Safe to run in CI on every PR.
 *
 * Severity model:
 *   error — a real vulnerability or an invalid tool that would be excluded/unsafe.
 *   warn  — a likely bug or missing hardening a reviewer should not merge without.
 *   info  — a nudge; correct-by-context but worth a glance.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(ROOT, 'app');
const TOOLS_DIR = join(APP, 'views/partials/mcp/tools');
const POLICIES_DIR = join(APP, 'views/partials/mcp/policies');
const GRAPHQL_DIR = join(APP, 'graphql/mcp');
const REGISTRY = join(APP, 'views/partials/mcp/registry.liquid');

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const JSON_OUT = args.includes('--json');
const INCLUDE_VULN = args.includes('--include-vuln');

// vuln_* = deliberately-insecure negative-control fixtures for the runtime agentic-eval;
// skipped by the static linter unless explicitly included (they are meant to be insecure).
const isVulnFixture = (name) => /^vuln_/.test(name || '');

// ---------------------------------------------------------------- findings ----
const findings = [];
const add = (level, tool, file, check, message) => findings.push({ level, tool, file, check, message });
const rel = (p) => p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p;

// ---------------------------------------------------------------- helpers ----
function read(p) { try { return readFileSync(p, 'utf8'); } catch { return null; } }

// Strip Liquid comments + full-line `#` comments so we lint CODE, not documentation.
function stripComments(src) {
  if (!src) return '';
  let s = src.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, ' ');
  s = s.replace(/\{%-?\s*doc\s*-?%\}[\s\S]*?\{%-?\s*enddoc\s*-?%\}/g, ' ');
  s = s.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
  return s;
}

// Parse the conventional manifest Liquid into a plain object. The manifest builds a
// single hash via `hash_assign m['key'] = <value>`; we extract scalars + the
// input_schema JSON literal. Unparseable fields → recorded as undefined (checks that
// need them emit an info rather than a false positive).
function parseManifest(src) {
  const m = {};
  const code = stripComments(src);
  // string scalars: hash_assign X['key'] = 'value'
  for (const mt of code.matchAll(/hash_assign\s+\w+\['([a-z_]+)'\]\s*=\s*'([^']*)'/g)) {
    if (m[mt[1]] === undefined) m[mt[1]] = mt[2];
  }
  // booleans
  for (const mt of code.matchAll(/hash_assign\s+\w+\['([a-z_]+)'\]\s*=\s*(true|false)\b/g)) {
    m[mt[1]] = mt[2] === 'true';
  }
  // numbers
  for (const mt of code.matchAll(/hash_assign\s+\w+\['([a-z_]+)'\]\s*=\s*(-?\d+)\s*$/gm)) {
    if (m[mt[1]] === undefined) m[mt[1]] = Number(mt[2]);
  }
  // audit_fields: '...' | split: ','
  const af = code.match(/hash_assign\s+\w+\['audit_fields'\]\s*=\s*'([^']*)'\s*\|\s*split/);
  if (af) m.audit_fields = af[1].split(',').map((x) => x.trim()).filter(Boolean);
  // input_schema: the JSON literal fed to parse_json that is an object schema.
  for (const mt of code.matchAll(/'(\{[^']*\})'\s*\|\s*parse_json/g)) {
    try {
      const obj = JSON.parse(mt[1]);
      if (obj && (obj.type === 'object' || obj.properties)) { m.input_schema = obj; break; }
    } catch { /* not this one */ }
  }
  // detect declared additionalProperties:true even if we couldn't parse the whole schema
  if (m.input_schema === undefined && /"additionalProperties"\s*:\s*true/.test(code)) {
    m._additionalPropertiesTrueRaw = true;
  }
  return m;
}

const SUPPORTED_KEYWORDS = new Set([
  'type', 'description', 'title', 'default', 'properties', 'required', 'additionalProperties',
  'enum', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'minLength', 'maxLength', 'pattern', 'format', 'items', 'minItems', 'maxItems',
]);
const VALID_TYPES = new Set(['object', 'string', 'integer', 'number', 'boolean', 'array']);
const SUPPORTED_FORMATS = new Set(['date-time', 'email', 'uuid']); // the engine only enforces these
const DISPLAY_FIELD = /^(name|title|label|summary|description|short_description|venue|message|body|content|comment|subject|headline|caption|bio|about|note|notes)$/i;
const SENSITIVE_FIELD = /(password|passwd|secret|token|api_?key|ssn|card|cvv|credit)/i;
const CATASTROPHIC = [/\+\)\+/, /\*\)\*/, /\+\)\*/, /\*\)\+/, /\)\)\*/, /\)\)\+/, /\(\.\*\)\+/, /\(\.\+\)\+/];

// Classify a string field by name + declared format → tailored, correct advice.
// This is what stops the linter from telling you a datetime field "can carry HTML".
function classifyString(field, node) {
  const f = (field || '').toLowerCase();
  if (node.format === 'date-time' || /(_at|_date)$/.test(f) || /^(date|datetime|start|end|from|to|when|time|starts|ends|deadline|expires)$/.test(f)) return 'datetime';
  if (node.format === 'email' || /e?mail/.test(f)) return 'email';
  if (node.format === 'uuid' || /(_uuid)$|^uuid$/.test(f)) return 'uuid';
  if (/(url|link|href|website|uri|src|image|photo|avatar|redirect|callback)$|^(url|link|website|redirect)$/.test(f)) return 'url';
  if (/(_id)$|^id$/.test(f)) return 'id';
  if (/slug/.test(f)) return 'slug';
  if (/(phone|tel|mobile)/.test(f)) return 'phone';
  if (DISPLAY_FIELD.test(f)) return 'display';
  if (/^(q|query|keyword|search|term|filter)$/.test(f)) return 'keyword';
  return 'text';
}

function isValidRegex(p) { try { new RegExp(p); return true; } catch { return false; } }

// Tool-poisoning markers (mirrors the engine's lint_description, extended).
const POISON = [
  'ignore previous', 'ignore all', 'ignore the', 'disregard', 'you must', 'you should',
  'system prompt', 'as an ai', 'do not tell', 'without telling', 'override', 'forget everything',
  'new instructions', 'act as', 'pretend', 'bypass', 'jailbreak', 'sudo', 'developer mode',
];

// ------------------------------------------------------ schema-node checks ----
function lintSchemaNode(tool, file, node, path, depth) {
  if (!node || typeof node !== 'object') return;
  if (depth > 6) { add('error', tool, file, 'schema-depth', `${path}: schema nesting exceeds a sane depth (6)`); return; }
  const field = path.split('.').pop();

  // unsupported keywords → the engine drops the whole manifest at load
  for (const k of Object.keys(node)) {
    if (!SUPPORTED_KEYWORDS.has(k)) add('error', tool, file, 'schema-keyword', `${path}: unsupported JSON-Schema keyword "${k}" — the engine excludes the whole manifest at load`);
  }

  const t = node.type;
  if (t === undefined) add('error', tool, file, 'schema-type', `${path}: missing "type"`);
  else if (!VALID_TYPES.has(t)) add('error', tool, file, 'schema-type', `${path}: invalid type "${t}"`);

  if (node.additionalProperties === true) add('error', tool, file, 'additional-props', `${path}: additionalProperties:true is unsafe and not honored (the engine forces false) — remove it`);

  // ---- bound contradictions (real, deterministic bugs) ----
  if (num(node.minLength) > num(node.maxLength, Infinity)) add('error', tool, file, 'bound-contradiction', `${path}: minLength > maxLength`);
  if (num(node.minimum, -Infinity) > num(node.maximum, Infinity)) add('error', tool, file, 'bound-contradiction', `${path}: minimum > maximum`);
  if (num(node.minItems) > num(node.maxItems, Infinity)) add('error', tool, file, 'bound-contradiction', `${path}: minItems > maxItems`);

  // ---- format sanity ----
  if (node.format !== undefined && !SUPPORTED_FORMATS.has(node.format)) {
    add('warn', tool, file, 'format-unsupported', `${path}: format "${node.format}" is NOT enforced by the engine (only date-time/email/uuid are) — add a pattern instead of relying on it`);
  }

  // ---- pattern sanity ----
  if (node.pattern !== undefined) {
    if (typeof node.pattern !== 'string') add('error', tool, file, 'pattern', `${path}: pattern must be a string`);
    else {
      if (!isValidRegex(node.pattern)) add('error', tool, file, 'pattern-invalid', `${path}: pattern is not a valid regular expression`);
      if (node.pattern.length > 200) add('warn', tool, file, 'pattern-long', `${path}: pattern is very long (>200) — cap it`);
      if (CATASTROPHIC.some((rx) => rx.test(node.pattern))) add('error', tool, file, 'pattern-redos', `${path}: pattern has catastrophic-backtracking risk (ReDoS)`);
      if (/^(\.\*|\.\+|\^\.\*\$|\^\.\+\$)$/.test(node.pattern)) add('warn', tool, file, 'pattern-useless', `${path}: pattern "${node.pattern}" matches everything — it constrains nothing`);
      if (!(node.pattern.startsWith('^') && node.pattern.endsWith('$'))) add('info', tool, file, 'pattern-anchor', `${path}: pattern is not anchored (^…$) — it matches substrings, so it likely fails to constrain the whole value`);
      // blacklist smell: trying to *exclude* markup instead of allow-listing
      if (/</.test(node.pattern) && !/\[\^[^\]]*<[^\]]*\]/.test(node.pattern)) add('warn', tool, file, 'pattern-blacklist', `${path}: pattern appears to blacklist characters — blacklists are bypassable; prefer an allowlist like ^[^<>]*$`);
    }
  }

  // ---- enum sanity ----
  if (node.enum !== undefined) {
    if (!Array.isArray(node.enum) || node.enum.length === 0) add('error', tool, file, 'enum', `${path}: enum must be a non-empty array`);
    else for (const v of node.enum) {
      const ok = (t === 'string' && typeof v === 'string') || ((t === 'integer' || t === 'number') && typeof v === 'number') || (t === 'boolean' && typeof v === 'boolean');
      if (!ok) { add('error', tool, file, 'enum-type', `${path}: enum value ${JSON.stringify(v)} does not match type "${t}"`); break; }
    }
  }

  // ---- string content constraint, ROUTED BY FIELD KIND (the clever part) ----
  if (t === 'string') {
    if (node.maxLength === undefined && node.enum === undefined) add('warn', tool, file, 'unbounded-string', `${path}: string has no maxLength — unbounded input`);
    const constrained = node.pattern !== undefined || node.enum !== undefined;
    const kind = classifyString(field, node);
    if (!constrained && node.format === undefined) {
      switch (kind) {
        case 'datetime':
          add('info', tool, file, 'weak-datetime', `${path}: a date/time field with no format or pattern — add "format":"date-time" (the engine validates it) so malformed dates are rejected`); break;
        case 'email':
          add('warn', tool, file, 'weak-email', `${path}: email field with no constraint — add "format":"email" (or a pattern)`); break;
        case 'url':
          add('warn', tool, file, 'weak-url', `${path}: a URL/link field with no constraint can carry javascript:/data: URIs (stored XSS) or arbitrary hosts (SSRF if ever fetched) — pin it, e.g. "pattern":"^https://"`); break;
        case 'id': case 'uuid':
          add('warn', tool, file, 'weak-id', `${path}: id field with no constraint — add a strict pattern, e.g. "pattern":"^[A-Za-z0-9_-]+$"`); break;
        case 'slug':
          add('warn', tool, file, 'weak-slug', `${path}: slug field with no constraint — add "pattern":"^[a-z0-9-]+$"`); break;
        case 'display':
          add('warn', tool, file, 'unconstrained-display', `${path}: a display/content field is rendered to users — block markup with "pattern":"^[^<>]*$" so HTML/script payloads are rejected at validation, not just escaped downstream`); break;
        case 'keyword':
          add('info', tool, file, 'unconstrained-keyword', `${path}: search keyword unrestricted — consider "pattern":"^[^<>]*$" as defense-in-depth`); break;
        default:
          add('info', tool, file, 'unconstrained-string', `${path}: string has no pattern/enum/format — add one if the content is constrained`);
      }
    }
    // type smell: a field whose name screams numeric but is a string
    if (/(_count|_minor|_cents|quantity|amount|limit|page|per_page|size|age|year|price)$|^(count|limit|page|size|quantity|amount|price)$/.test((field || '').toLowerCase())) {
      add('info', tool, file, 'type-smell', `${path}: field name looks numeric but type is "string" — confirm it should not be integer/number`);
    }
  }

  // ---- numeric bounds ----
  if (t === 'integer' || t === 'number') {
    if (node.minimum === undefined && node.exclusiveMinimum === undefined) add('warn', tool, file, 'unbounded-number', `${path}: numeric field has no minimum`);
    if (node.maximum === undefined && node.exclusiveMaximum === undefined) add('warn', tool, file, 'unbounded-number', `${path}: numeric field has no maximum`);
  }

  // ---- array bounds + items ----
  if (t === 'array') {
    if (node.maxItems === undefined) add('warn', tool, file, 'unbounded-array', `${path}: array has no maxItems`);
    if (node.items === undefined) add('warn', tool, file, 'array-items', `${path}: array has no items schema — element content is unvalidated`);
  }

  // ---- object: required must reference declared properties ----
  if (t === 'object') {
    const props = node.properties ? Object.keys(node.properties) : [];
    if (Array.isArray(node.required)) {
      for (const r of node.required) if (!props.includes(r)) add('error', tool, file, 'required-ref', `${path}: required lists "${r}" which is not a declared property`);
    }
    if (node.properties) for (const [pk, child] of Object.entries(node.properties)) lintSchemaNode(tool, file, child, `${path}.${pk}`, depth + 1);
  }
  if (t === 'array' && node.items) lintSchemaNode(tool, file, node.items, `${path}.items`, depth + 1);
}

function num(v, dflt = -Infinity) { return typeof v === 'number' ? v : dflt; }

// --------------------------------------------------------- manifest checks ----
function lintManifest(tool, manifestFile, m, registeredName) {
  const src = read(manifestFile) || '';
  const F = rel(manifestFile);

  if (!m.name) add('error', tool, F, 'name', 'manifest has no name');
  else if (!/^[a-z][a-z0-9_]{2,63}$/.test(m.name)) add('error', tool, F, 'name', `name "${m.name}" must match ^[a-z][a-z0-9_]{2,63}$`);
  if (registeredName && m.name && m.name !== registeredName) add('error', tool, F, 'name-mismatch', `manifest name "${m.name}" ≠ registered name "${registeredName}"`);

  if (!m.version) add('error', tool, F, 'version', 'no version');
  else if (!/^\d+\.\d+\.\d+/.test(m.version)) add('error', tool, F, 'version', `version "${m.version}" is not SemVer`);

  if (!m.description) add('error', tool, F, 'description', 'no description (model-read, required)');
  else {
    if (m.description.length < 20) add('warn', tool, F, 'description', 'description is very short (<20 chars) — agents select on this');
    const lc = m.description.toLowerCase();
    const hits = POISON.filter((p) => lc.includes(p));
    if (hits.length) add('error', tool, F, 'tool-poisoning', `description contains model-directed / injection text: ${hits.join(', ')}`);
    if (/[A-Za-z0-9+/]{80,}/.test(m.description)) add('warn', tool, F, 'tool-poisoning', 'description contains a long encoded-looking blob');
  }

  if (m.authorization_policy === undefined || m.authorization_policy === '') {
    add('error', tool, F, 'no-implicit-allow', 'authorization_policy is empty — the engine excludes this tool (no implicit allow). Set a named policy.');
  } else {
    const pol = join(POLICIES_DIR, `${m.authorization_policy}.liquid`);
    const builtin = ['mcp_authenticated'].includes(m.authorization_policy);
    if (!builtin && !existsSync(pol)) add('error', tool, F, 'missing-policy', `authorization_policy "${m.authorization_policy}" has no file at ${rel(pol)}`);
  }

  if (typeof m.mutating !== 'boolean') add('error', tool, F, 'mutating', 'mutating must be declared (boolean)');
  if (typeof m.requires_approval !== 'boolean') add('error', tool, F, 'requires_approval', 'requires_approval must be declared (boolean)');
  if (m.idempotent !== undefined && typeof m.idempotent !== 'boolean') add('error', tool, F, 'idempotent', 'idempotent must be boolean');
  if (!m.handler) add('error', tool, F, 'handler', 'no handler');

  if (m.input_schema === undefined) {
    if (m._additionalPropertiesTrueRaw) add('error', tool, F, 'additional-props', 'schema declares additionalProperties:true (unsafe)');
    else add('info', tool, F, 'schema-unparsed', 'could not statically parse input_schema — review its bounds manually');
  } else {
    if (m.input_schema.type !== 'object') add('error', tool, F, 'schema-root', 'input_schema root type must be "object"');
    lintSchemaNode(tool, F, m.input_schema, 'input_schema', 1);
  }

  // audit_fields hygiene
  if (Array.isArray(m.audit_fields)) {
    const props = (m.input_schema && m.input_schema.properties) ? Object.keys(m.input_schema.properties) : null;
    for (const af of m.audit_fields) {
      if (SENSITIVE_FIELD.test(af)) add('warn', tool, F, 'audit-pii', `audit_fields includes "${af}" which looks sensitive — it is stored verbatim in the ledger (should be non-PII)`);
      if (props && !props.includes(af)) add('warn', tool, F, 'audit-unknown', `audit_fields references "${af}" which is not a schema property`);
    }
  }

  // governance posture nudges
  if (m.mutating === true && m.requires_approval === false) {
    const permissive = /public|member|authenticated|any/i.test(m.authorization_policy || '');
    if (permissive) add('info', tool, F, 'unmoderated-write', `mutating tool with a permissive policy ("${m.authorization_policy}") and no approval — ensure the handler routes through a moderated command (status:pending) or set requires_approval:true`);
  }
}

// ---------------------------------------------------------- handler checks ----
function lintHandler(tool, handlerFile, m) {
  const raw = read(handlerFile);
  if (raw === null) { add('error', tool, rel(handlerFile), 'handler-missing', 'handler file not found'); return { code: '', graphqlRefs: [] }; }
  const F = rel(handlerFile);
  const code = stripComments(raw);

  // --- injection / dynamic execution: query/partial path must be a string literal ---
  for (const mt of code.matchAll(/\bgraphql\s+\w+\s*=\s*([^,\n]+)/g)) {
    const target = mt[1].trim();
    if (!target.startsWith("'")) add('error', tool, F, 'dynamic-graphql', `GraphQL query name is not a literal ("${target.slice(0, 40)}") — a query path from input is code injection`);
  }
  for (const kw of ['function', 'include', 'render', 'render_file']) {
    for (const mt of code.matchAll(new RegExp(`\\b${kw}\\s+\\w+\\s*=\\s*([^,\\n]+)|\\b${kw}\\s+([^\\n'"]+)`, 'g'))) {
      const target = (mt[1] || mt[2] || '').trim();
      if (target && !target.startsWith("'") && /arguments\.|params\./.test(target)) {
        add('error', tool, F, 'dynamic-partial', `${kw} executes a path derived from input ("${target.slice(0, 40)}") — SSTI/path injection`);
      }
    }
  }

  // --- SSRF: external calls, especially with agent-controlled inputs ---
  if (/\bapi_call_send\b|\bapi_call\b/.test(code)) {
    const near = /arguments\.[\s\S]{0,120}(api_call_send|api_call)|(api_call_send|api_call)[\s\S]{0,120}arguments\./.test(code);
    add(near ? 'error' : 'warn', tool, F, 'ssrf', near
      ? 'external API call appears to use agent-supplied input — never fetch an argument-derived URL (SSRF)'
      : 'handler makes an external API call — the endpoint must be a fixed constant, never from arguments');
  }

  // --- ledger tampering: a handler must never write the ledger ---
  if (/mcp_ledger|ledger\/(append|create|update)/.test(code)) {
    add('error', tool, F, 'ledger-write', 'handler references the ledger — handlers must never write mcp_ledger (the engine attests)');
  }

  // --- destructive / mass mutations ---
  if (/\brecords_delete_all\b/.test(code)) add('error', tool, F, 'mass-delete', 'handler calls records_delete_all — a mass-delete surface is almost never a valid tool');
  if (/\brecord_delete\b/.test(code)) add('warn', tool, F, 'destructive', 'handler deletes records — confirm ownership/authorization and consider requires_approval');

  // --- raw output that could re-enable XSS downstream ---
  if (/\|\s*raw\b/.test(code)) add('warn', tool, F, 'raw-output', 'handler uses | raw — returned/echoed values bypass escaping');

  // --- string-building from arguments near a GraphQL call (interpolation smell) ---
  if (/\bgraphql\b/.test(code) && /assign\s+\w+\s*=\s*[^\n]*arguments\.\w+[^\n]*\|\s*append/.test(code)) {
    add('warn', tool, F, 'interpolation-smell', 'a string is built from arguments near a GraphQL call — pass values as typed variables, never interpolate');
  }

  // --- returning secrets ---
  if (/context\.constants|context\.session/.test(code) && /hash_assign\s+result\b/.test(code)) {
    add('warn', tool, F, 'secret-leak', 'handler reads constants/session and builds a result — ensure no secret/session value is returned to the agent');
  }

  // --- mutation vs manifest.mutating consistency ---
  const mutatesInHandler = /\brecord_(create|update|delete)\b/.test(code);
  const wrapsCommand = /commands\//.test(code);
  const graphqlRefs = [...code.matchAll(/\bgraphql\s+\w+\s*=\s*'([^']+)'/g)].map((x) => x[1]);
  return { code, graphqlRefs, mutatesInHandler, wrapsCommand };
}

// ----------------------------------------------------------- graphql checks ----
function lintGraphql(tool, name) {
  const p = join(GRAPHQL_DIR, `${name}.graphql`);
  if (!existsSync(p)) { add('error', tool, rel(p), 'missing-graphql', `handler calls mcp/${name} but ${rel(p)} does not exist`); return; }
  const src = read(p) || '';
  const F = rel(p);
  if (/\{\{|\{%/.test(src)) add('error', tool, F, 'graphql-liquid', 'GraphQL file contains Liquid interpolation ({{ }}/{% %}) — inject values via $typed variables only');
  if (/\brecords_delete_all\b/.test(src)) add('error', tool, F, 'graphql-mass-delete', 'query uses records_delete_all');
  if (/\brecord_delete\b/.test(src) && !/table\s*:/.test(src)) add('warn', tool, F, 'graphql-delete', 'record_delete without an explicit table constraint');
  const usesVars = /\$\w+/.test(src);
  const hasArgsBlock = /\([^)]*\$\w+/.test(src);
  if (!usesVars && /record_(create|update)/.test(src)) add('info', tool, F, 'graphql-novars', 'mutation defines no $variables — confirm nothing is hardcoded that should be an input');
  else void hasArgsBlock;
  return { mutates: /record_(create|update|delete)/.test(src) };
}

// ------------------------------------------------------------ registry ----
function parseRegistry() {
  const src = read(REGISTRY);
  if (src === null) { add('error', '(registry)', rel(REGISTRY), 'registry-missing', 'app/views/partials/mcp/registry.liquid not found'); return []; }
  const code = stripComments(src);
  const names = {}, paths = {};
  for (const mt of code.matchAll(/hash_assign\s+(\w+)\['name'\]\s*=\s*'([^']+)'/g)) names[mt[1]] = mt[2];
  for (const mt of code.matchAll(/hash_assign\s+(\w+)\['path'\]\s*=\s*'([^']+)'/g)) paths[mt[1]] = mt[2];
  const entries = [];
  for (const v of Object.keys(names)) {
    if (!paths[v]) { add('error', names[v], rel(REGISTRY), 'registry-entry', `registry entry "${names[v]}" has no path`); continue; }
    entries.push({ name: names[v], path: paths[v] });
  }
  // duplicate names
  const seen = {};
  for (const e of entries) { if (seen[e.name]) add('error', e.name, rel(REGISTRY), 'duplicate', `tool "${e.name}" registered twice`); seen[e.name] = true; }
  return entries;
}

// ------------------------------------------------------------- main ----
function lintTool(name, dir, { registered }) {
  const manifestFile = join(dir, 'manifest.liquid');
  if (!existsSync(manifestFile)) { add('error', name, rel(manifestFile), 'no-manifest', 'tool directory has no manifest.liquid'); return; }
  const m = parseManifest(read(manifestFile));
  // For a registered tool the registered name is authoritative (identity guard). For a
  // draft, the manifest's own name is the identity.
  lintManifest(name, manifestFile, m, registered ? name : (m.name || name));

  const toolLogical = `mcp/tools/${m.name || name}`;
  const handlerLogical = m.handler || `${toolLogical}/call`;
  const handlerFile = join(APP, 'views/partials', handlerLogical) + '.liquid';
  const h = lintHandler(name, handlerFile, m);

  let anyGraphqlMutates = false;
  for (const refPath of h.graphqlRefs || []) {
    const mt = refPath.match(/^mcp\/([a-z0-9_]+)$/);
    if (mt) { const g = lintGraphql(name, mt[1]); if (g && g.mutates) anyGraphqlMutates = true; }
  }
  if ((h.mutatesInHandler || anyGraphqlMutates) && m.mutating === false) {
    add('error', name, rel(handlerFile), 'mislabeled-mutation', 'handler/query performs a record mutation but manifest.mutating is false — it will run WITHOUT a transaction (no rollback)');
  }
  if (!h.wrapsCommand && (h.mutatesInHandler || anyGraphqlMutates) && m.mutating === true) {
    add('info', name, rel(handlerFile), 'raw-write', 'writes records directly (raw mode) — if the target has app-side rules (moderation/defaults/relationships), prefer command mode so the tool inherits them');
  }
  if (!registered) {
    const emptyPolicy = m.authorization_policy === undefined || m.authorization_policy === '';
    add('info', name, rel(dir), 'not-registered', emptyPolicy
      ? 'draft tool: unregistered and authorization_policy is empty — finish it (set a policy, then add to mcp/registry) before it can be served'
      : 'tool is not in mcp/registry — it will not be served until registered');
  }
}

// Run the full static analysis and RETURN the findings (no printing, no exit). This is
// the reusable entrypoint the Vitest suite imports; the CLI wraps it below. `findings` is
// module-level, so reset it first to make repeated calls independent.
export function lintAll({ includeVuln = false } = {}) {
  findings.length = 0;
  if (!existsSync(APP)) throw new Error(`No app/ dir at ${APP}`);
  const entries = parseRegistry();
  const seen = new Set();
  const skippedVuln = [];
  const skip = (name) => !includeVuln && isVulnFixture(name);

  // 1) every registered tool (authoritative name)
  for (const { name, path } of entries) {
    const dir = join(APP, 'views/partials', path);
    seen.add(dir); // mark seen either way so the drafts pass never re-lints it
    if (skip(name)) { skippedVuln.push(name); continue; }
    lintTool(name, dir, { registered: true });
  }
  // 2) every tool dir on disk that ISN'T registered — draft/orphan; still deep-lint it
  if (existsSync(TOOLS_DIR)) {
    for (const d of readdirSync(TOOLS_DIR)) {
      const full = join(TOOLS_DIR, d);
      if (statSync(full).isDirectory() && !seen.has(full)) {
        if (skip(d)) { skippedVuln.push(d); continue; }
        lintTool(d, full, { registered: false });
      }
    }
  }

  return {
    errors: findings.filter((f) => f.level === 'error'),
    warnings: findings.filter((f) => f.level === 'warn'),
    infos: findings.filter((f) => f.level === 'info'),
    findings: [...findings],
    skippedVuln,
  };
}

// -------------------------------------------------------- CLI ----
function main() {
  let errors, warns, infos, skippedVuln = [];
  try { ({ errors, warnings: warns, infos, skippedVuln } = lintAll({ includeVuln: INCLUDE_VULN })); }
  catch (e) { console.error(e.message); process.exit(2); }

  if (!JSON_OUT && skippedVuln.length) {
    console.log(`(skipped ${skippedVuln.length} vuln_* negative-control fixture(s): ${skippedVuln.join(', ')} — pass --include-vuln to lint them)`);
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ errors: errors.length, warnings: warns.length, infos: infos.length, skippedVuln, findings }, null, 2));
  } else {
    const icon = { error: '✗', warn: '⚠', info: 'ℹ' };
    const byTool = {};
    for (const f of findings) (byTool[f.tool] ||= []).push(f);
    for (const [tool, fs] of Object.entries(byTool)) {
      console.log(`\n${tool}`);
      for (const f of fs.sort((a, b) => ({ error: 0, warn: 1, info: 2 }[a.level] - { error: 0, warn: 1, info: 2 }[b.level]))) {
        console.log(`  ${icon[f.level]} [${f.check}] ${f.message}\n      ${f.file}`);
      }
    }
    console.log(`\n${errors.length} error(s), ${warns.length} warning(s), ${infos.length} info`);
    if (!errors.length && !warns.length) console.log('Tools clean.');
  }

  const fail = errors.length > 0 || (STRICT && warns.length > 0);
  process.exit(fail ? 1 : 0);
}

// Only run the CLI when invoked directly (node tests/lib/lint-tools.mjs [--strict] [--json]);
// when imported by the Vitest suite, expose lintAll() without side effects.
if (import.meta.url === `file://${process.argv[1]}`) main();
