import Generator from 'yeoman-generator';
import fs from 'fs';
import path from 'path';

// Map pOS attribute types → JSON-Schema types and GraphQL value accessors.
const JSON_TYPE = { string: 'string', text: 'string', integer: 'integer', float: 'number', boolean: 'boolean', date: 'string', datetime: 'string', array: 'array' };
const GQL_ARG = { string: 'String', text: 'String', integer: 'Int', boolean: 'Boolean', float: 'Float', date: 'String', datetime: 'String', array: '[String]' };
const GQL_VALUE = { string: 'value', text: 'value', integer: 'value_int', boolean: 'value_boolean', float: 'value_float', date: 'value', datetime: 'value', array: 'value_array' };

// Keys a command SETS itself (not caller inputs) — dropped from auto-discovered fields.
const SYSTEM_KEYS = /^(id|uuid|created_at|updated_at|deleted_at)$/;
const SYSTEM_KEY_PATTERNS = [/_uuid$/, /^c__/];

// Heuristic type inference from a field name (best-effort; the author reviews the draft).
function inferType(name) {
  if (/(_at|_date)$/.test(name) || name === 'date' || name === 'datetime') { return 'datetime'; }
  if (/^(is_|has_)/.test(name) || /^(commentable|published|enabled|active|featured|public)$/.test(name)) { return 'boolean'; }
  if (/(_count|_minor|_cents|_int|quantity|amount|position|rank|priority)$/.test(name)) { return 'integer'; }
  return 'string';
}

// Resolve a logical command path (e.g. modules/community/commands/events/create, or
// commands/foo, or app-relative) to candidate physical source files, and extract the
// `object.<key>` accessors the command consumes. Returns [] if the source can't be read.
function discoverCommandFields(cwd, logicalPath) {
  const p = logicalPath.replace(/^\/+/, '');
  let base;
  const modMatch = p.match(/^modules\/([^/]+)\/commands\/(.+)$/);
  if (modMatch) {
    base = path.join('modules', modMatch[1], 'public', 'lib', 'commands', modMatch[2]);
  } else {
    base = path.join('app', 'lib', 'commands', p.replace(/^commands\//, ''));
  }
  // Prefer the `build` sub-command (it declares the input object); fall back to the
  // command file itself (some build inline).
  const candidates = [`${base}/build.liquid`, `${base}.liquid`];
  let src = null;
  for (const rel of candidates) {
    try {
      src = fs.readFileSync(path.join(cwd, rel), 'utf8');
      break;
    } catch (e) { /* try next */ }
  }
  if (!src) { return []; }

  const keys = [];
  const seen = {};
  const re = /object(?:\.([a-zA-Z_][a-zA-Z0-9_]*)|\[['"]([^'"]+)['"]\])/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = m[1] || m[2];
    if (!key || seen[key]) { continue; }
    if (key === 'valid' || key === 'errors') { continue; } // command-result fields, not inputs
    if (SYSTEM_KEYS.test(key)) { continue; }
    if (SYSTEM_KEY_PATTERNS.some((rx) => rx.test(key))) { continue; }
    seen[key] = true;
    keys.push({ name: key, type: inferType(key) });
  }
  return keys;
}

export default class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    this.description = 'Scaffold a DRAFT MCP tool (manifest + handler + query). Draft = authorization_policy unset, so it fails the meta-schema and is EXCLUDED from the registry until reviewed (propose-then-validate, §8.4).';
    this.argument('toolName', { type: String, required: true, description: 'tool name, ^[a-z][a-z0-9_]{2,63}$' });
    this.argument('attributes', { type: Array, required: false, description: 'field list name:type — the input fields (for create/command ops), e.g. name:string start_date:datetime', default: [] });
    this.option('op', { type: String, default: 'read', description: 'read | create | command' });
    this.option('table', { type: String, description: 'the pOS table (read/create ops), e.g. modules/community/event' });
    this.option('command', { type: String, description: 'the app command path to wrap (command op), e.g. modules/community/commands/events/create' });

    let op = 'read';
    if (this.options.op === 'create') { op = 'create'; }
    if (this.options.op === 'command') { op = 'command'; }
    let attributes = (this.options.attributes || []).map((attr) => {
      const [name, type = 'string'] = attr.split(':');
      return { name, type };
    });

    // Command mode: if the author gave no explicit fields, auto-discover them by
    // parsing the command's build source for `object.<key>` accessors. Explicit
    // `name:type` args always win (backward compatible). Heuristic — the author
    // reviews the draft (types inferred by name; system-set keys filtered out).
    this.discovered = false;
    if (op === 'command' && attributes.length === 0 && this.options.command) {
      const found = discoverCommandFields(this.destinationRoot(), this.options.command);
      if (found.length > 0) {
        attributes = found;
        this.discovered = true;
      }
    }

    let inputSchema;
    if (op === 'create' || op === 'command') {
      // Both build an object from the declared input fields. `command` feeds it to
      // an app command (validations/side-effects); `create` writes it directly.
      const properties = {};
      attributes.forEach((a) => {
        const t = JSON_TYPE[a.type] || 'string';
        const s = { type: t };
        if (t === 'string') s.maxLength = 255;
        if (a.type === 'date' || a.type === 'datetime') s.description = 'ISO 8601 datetime (e.g. 2026-09-01T19:00:00Z)';
        if (t === 'array') s.items = { type: 'string' };
        properties[a.name] = s;
      });
      const firstStr = attributes.find((a) => a.type === 'string' || a.type === 'text');
      inputSchema = { type: 'object', additionalProperties: false, required: firstStr ? [firstStr.name] : [], properties };
    } else {
      inputSchema = {
        type: 'object', additionalProperties: false, required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 80, description: 'keyword to match' },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'max results (default 10)' },
        },
      };
    }

    this.props = {
      toolName: this.options.toolName,
      table: this.options.table || 'TODO_set_table',
      command: this.options.command || 'TODO/set/command/path',
      op,
      // create + command mutate by default; read does not. (A read-only command can
      // be flipped to mutating:false after review.)
      mutating: op === 'create' || op === 'command',
      attributes,
      searchable: attributes.filter((a) => a.type === 'string' || a.type === 'text').slice(0, 3),
      selectFields: attributes.slice(0, 6),
      GQL_ARG,
      GQL_VALUE,
      inputSchemaJson: JSON.stringify(inputSchema),
    };
  }

  writing() {
    const name = this.props.toolName;
    const dir = `app/views/partials/mcp/tools/${name}`;
    try {
      this.fs.copyTpl(this.templatePath('manifest.liquid'), this.destinationPath(`${dir}/manifest.liquid`), this.props);
      if (this.props.op === 'create') {
        this.fs.copyTpl(this.templatePath('call_create.liquid'), this.destinationPath(`${dir}/call.liquid`), this.props);
        this.fs.copyTpl(this.templatePath('create.graphql'), this.destinationPath(`app/graphql/mcp/${name}.graphql`), this.props);
      } else if (this.props.op === 'command') {
        // Command mode wraps an existing app command — no graphql file (the command
        // owns its own queries/mutations, validations, and side-effects).
        this.fs.copyTpl(this.templatePath('call_command.liquid'), this.destinationPath(`${dir}/call.liquid`), this.props);
      } else {
        this.fs.copyTpl(this.templatePath('call_read.liquid'), this.destinationPath(`${dir}/call.liquid`), this.props);
        this.fs.copyTpl(this.templatePath('read.graphql'), this.destinationPath(`app/graphql/mcp/${name}.graphql`), this.props);
      }
    } catch (e) {
      console.error(e);
    }
  }

  end() {
    const n = this.props.toolName;
    console.log(`\nDRAFT MCP tool "${n}" scaffolded (${this.props.op}). It is NOT served until reviewed:`);
    console.log(`  app/views/partials/mcp/tools/${n}/manifest.liquid`);
    console.log(`  app/views/partials/mcp/tools/${n}/call.liquid`);
    if (this.props.op !== 'command') {
      console.log(`  app/graphql/mcp/${n}.graphql`);
    }
    if (this.discovered) {
      const names = this.props.attributes.map((a) => `${a.name}:${a.type}`).join(', ');
      console.log(`\nAuto-discovered input fields from the command's build source (REVIEW — types`);
      console.log(`inferred by name, system-set keys filtered, computed keys may be missing):`);
      console.log(`  ${names}`);
    }
    console.log(`\nComplete it, then register:`);
    console.log(`  1. Write a precise description.`);
    console.log(`  2. Set authorization_policy to a named policy (empty = excluded from the registry).`);
    console.log(`  3. Tighten input_schema (required, bounds, enums, formats)${this.discovered ? ' and correct any inferred types' : ''}.`);
    console.log(`  4. Decide requires_approval.`);
    if (this.props.op === 'command') {
      console.log(`  5. In call.liquid: map args→object keys, pass the command's identity param, confirm success fields.`);
      console.log(`  6. Add it to app/views/partials/mcp/registry.liquid, then deploy.`);
    } else {
      console.log(`  5. Add it to app/views/partials/mcp/registry.liquid, then deploy.`);
    }
  }
}
