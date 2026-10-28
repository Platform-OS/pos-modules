import Generator from 'yeoman-generator';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

// Install generator for the support desk (tech spec 09 §3). Every step looks
// at what is already there first, so running it twice changes nothing.
// It never edits the host's permissions file and never writes a secret or a
// password to a file: they go straight to the environment.

const EMAIL_RE = /^[^@\s'"{}%<>|]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const ROLE_RE = /^[a-z0-9_-]+$/i;
const SECRETS = ['INBOUND_SECRET', 'EVENTS_SECRET', 'REPLY_TOKEN_SECRET'];
const SUPPORT_ROLES = ['agent', 'manager', 'admin'];

const ADMIN_PAGE_OFF = `---
slug: admin/support
layout: ''
---
{% comment %}Support is not listed in the host admin menu (support install generator).{% endcomment %}
{% response_status 404 %}
`;

const BRANDING_HOOK = `{% liquid
  # Branding for the support desk (support install generator). Fill in what
  # the desk should show; anything left out falls back to the module default.
  assign brand = { "app_name": "Support", "short_name": "Support", "theme_color": null, "background_color": null, "support_email_name": null }
  # assign brand.logo_url = 'images/logo.svg' | asset_url
  # assign brand.icon_url = 'images/icon-512.png' | asset_url
  return brand
%}
`;

const headscriptsHook = (links) => `{% comment %}
  Host stylesheets for the support desk layout (support install generator),
  taken from app/views/layouts/application.liquid.
{% endcomment %}
{% capture tags %}
${links.join('\n')}
{% endcapture %}
{% return tags %}
`;

export default class extends Generator {
  constructor(args, opts) {
    super(args, opts);
    this.description = 'Set up the support desk: admin menu entry, first support admin, theme and branding hooks, email provider and secrets';
  }

  initializing() {
    this.adminOverride = this.destinationPath('app/modules/support/public/views/pages/admin/support.liquid');
    this.headscriptsHook = this.destinationPath('app/lib/hooks/hook_headscripts.liquid');
    this.brandingHook = this.destinationPath('app/lib/hooks/hook_support_branding.liquid');
    this.layout = this.destinationPath('app/views/layouts/application.liquid');
    this.environments = this._readEnvironments();
  }

  _readEnvironments() {
    try {
      const output = execFileSync('pos-cli', ['env', 'list'], { cwd: this.destinationPath(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return [...output.matchAll(/^-\s+\[([^\]]+)\]/gm)].map((m) => m[1]);
    } catch (e) {
      console.log(`Could not list pos-cli environments (${e.message.split('\n')[0]}).`);
      return [];
    }
  }

  _constants(env) {
    const output = execFileSync('pos-cli', ['constants', 'list', env], { cwd: this.destinationPath(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return new Set([...output.matchAll(/^(\S+)\s/gm)].map((m) => m[1]));
  }

  // Runs Liquid on the environment and returns the JSON it prints.
  _liquid(env, code) {
    const output = execFileSync('pos-cli', ['exec', 'liquid', env, code], { cwd: this.destinationPath(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const json = output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1);
    return JSON.parse(json);
  }

  _state(env, email) {
    return this._liquid(env, `{% liquid
  function state = 'modules/support/queries/install/state', email: '${email}'
  echo state | json | html_safe
%}`);
  }

  async prompting() {
    this.answers = {};
    const ask = async (question) => Object.assign(this.answers, await this.prompt([question]));

    if (!fs.existsSync(this.adminOverride)) {
      await ask({ type: 'confirm', name: 'keepAdminMenu', default: true, message: 'List Support in the host admin menu (admin/support redirects into the desk)?' });
    }

    if (this.environments.length === 0) {
      console.log('No pos-cli environments found: the first admin, email and secret steps are skipped. Run `pos-cli env add`, deploy, and run this generator again.');
    } else {
      await ask({ type: 'list', name: 'environment', message: 'Environment to set up (deploy the app with the support module there first):', choices: [...this.environments, { name: 'Skip the environment steps', value: '' }] });
    }

    if (this.answers.environment) await this._promptEnvironment(ask, this.answers.environment);

    if (!fs.existsSync(this.headscriptsHook)) {
      this.hostLinks = this._hostStylesheets();
      if (this.hostLinks.length > 0) {
        await ask({ type: 'confirm', name: 'headscripts', default: true, message: `Load the host's ${this.hostLinks.length} stylesheet(s) in the desk (creates app/lib/hooks/hook_headscripts.liquid)?` });
      }
    }
    if (!fs.existsSync(this.brandingHook)) {
      await ask({ type: 'confirm', name: 'branding', default: true, message: 'Create app/lib/hooks/hook_support_branding.liquid to fill in the desk name, logo and colours?' });
    }
  }

  async _promptEnvironment(ask, env) {
    await ask({ type: 'input', name: 'adminEmail', message: 'Email of the first support admin:', validate: (v) => EMAIL_RE.test(v.trim()) || 'Enter an email address' });
    this.answers.adminEmail = this.answers.adminEmail.trim().toLowerCase();
    try {
      this.state = this._state(env, this.answers.adminEmail);
      this.constants = this._constants(env);
    } catch (e) {
      console.log(`\nCould not read the support module on "${env}" (${e.message.split('\n')[0]}). Deploy the app there first (pos-cli deploy -p ${env}), then run this generator again.`);
      this.answers.environment = '';
      return;
    }

    if (!this.state.user_id) {
      console.log(`No user ${this.answers.adminEmail} on "${env}" yet: it will be created with no host roles.`);
      await ask({ type: 'password', name: 'adminPassword', mask: '*', message: 'Password for the new user (sent to the environment, never written to a file):', validate: (v) => v.length >= 8 || 'At least 8 characters' });
    } else if (this.state.member_role) {
      console.log(`${this.answers.adminEmail} is already a support ${this.state.member_role} on "${env}".`);
    }

    const anonymous = this.state.roles.anonymous || [];
    if (anonymous.includes('users.register')) {
      console.log('\nNote: anonymous visitors can register (the "anonymous" role has users.register). Sites without members, such as marketing sites, usually turn this off in the host permissions file. This generator does not change it.');
      await ask({ type: 'confirm', name: 'signUpIntended', default: true, message: 'Is public sign-up intended on this site?' });
    }

    const mapped = this.state.role_map && Object.keys(this.state.role_map).length > 0;
    const hostRoles = Object.entries(this.state.roles)
      .filter(([role, permissions]) => role !== 'superadmin' && ROLE_RE.test(role) && (permissions || []).includes('admin_pages.view'))
      .map(([role]) => role);
    this.answers.roleMap = {};
    if (!mapped) {
      for (const role of hostRoles) {
        const { support } = await this.prompt([{ type: 'list', name: 'support', message: `Give host role "${role}" access to the desk?`, choices: [{ name: 'No (default; invite people instead)', value: '' }, ...SUPPORT_ROLES] }]);
        if (support) this.answers.roleMap[role] = support;
      }
    }

    if (!this.state.email_provider) {
      await ask({ type: 'list', name: 'provider', message: 'Email provider:', choices: [{ name: 'SendGrid', value: 'sendgrid' }, { name: 'Set up later in Settings → Email', value: '' }] });
    }
    if (this.answers.provider || this.state.email_provider) {
      if (!this.constants.has('modules/support/EMAIL_API_KEY')) {
        await ask({ type: 'password', name: 'apiKey', mask: '*', message: 'Email provider API key (leave empty to add it later in Settings → Email):' });
      }
      if (!this.state.inbound_domain) {
        await ask({ type: 'input', name: 'inboundDomain', message: 'Inbound hostname customers write to (e.g. in.support.example.com):', validate: (v) => v.trim() === '' || HOST_RE.test(v.trim()) || 'Enter a hostname' });
      }
    }
  }

  _hostStylesheets() {
    if (!fs.existsSync(this.layout)) return [];
    const content = fs.readFileSync(this.layout, 'utf8');
    return (content.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || []).filter((tag) => !tag.includes('modules/'));
  }

  writing() {
    if (this.answers.keepAdminMenu === false) {
      fs.mkdirSync(path.dirname(this.adminOverride), { recursive: true });
      fs.writeFileSync(this.adminOverride, ADMIN_PAGE_OFF);
      console.log('Wrote app/modules/support/public/views/pages/admin/support.liquid (admin/support answers 404).');
    }
    if (this.answers.headscripts) {
      fs.mkdirSync(path.dirname(this.headscriptsHook), { recursive: true });
      fs.writeFileSync(this.headscriptsHook, headscriptsHook(this.hostLinks));
      console.log('Wrote app/lib/hooks/hook_headscripts.liquid.');
    }
    if (this.answers.branding) {
      fs.mkdirSync(path.dirname(this.brandingHook), { recursive: true });
      fs.writeFileSync(this.brandingHook, BRANDING_HOOK);
      console.log('Wrote app/lib/hooks/hook_support_branding.liquid; fill it in and deploy.');
    }
  }

  end() {
    const env = this.answers.environment;
    if (!env) {
      console.log('\nDone. Deploy the app, then run this generator again for each environment.');
      return;
    }
    try {
      this._setUpEnvironment(env);
    } catch (e) {
      console.error(`\nSetting up "${env}" failed: ${e.message.split('\n')[0]}\nFix the cause and run the generator again; finished steps are skipped.`);
    }
  }

  _setConstant(env, name, value) {
    execFileSync('pos-cli', ['constants', 'set', env, '--name', `modules/support/${name}`, '--value', value], { cwd: this.destinationPath(), stdio: ['ignore', 'ignore', 'inherit'] });
    console.log(`Set constant modules/support/${name}.`);
  }

  _createUser(env, email, password) {
    const userCreate = this.destinationPath('modules/user/public/graphql/user/create.graphql');
    const profileCreate = this.destinationPath('modules/user/public/graphql/profiles/create.graphql');
    const user = JSON.parse(execFileSync('pos-cli', ['exec', 'graphql', env, '-f', userCreate, '-p', JSON.stringify({ email, password })], { cwd: this.destinationPath(), encoding: 'utf8' }));
    const userId = user && user.data && user.data.user && user.data.user.id;
    if (!userId) throw new Error('user_create returned no user');
    const profile = { uuid: crypto.randomUUID(), user_id: userId, first_name: '', last_name: '', name: '', email, roles: [], c__names: '' };
    execFileSync('pos-cli', ['exec', 'graphql', env, '-f', profileCreate, '-p', JSON.stringify(profile)], { cwd: this.destinationPath(), stdio: 'ignore' });
    console.log(`Created user ${email} on "${env}" with no host roles.`);
  }

  _setUpEnvironment(env) {
    const email = this.answers.adminEmail;
    if (!this.state.user_id && this.answers.adminPassword) this._createUser(env, email, this.answers.adminPassword);

    const provider = this.answers.provider || '';
    const domain = (this.answers.inboundDomain || '').trim().toLowerCase();
    const roleMap = JSON.stringify(this.answers.roleMap || {});
    const done = this._liquid(env, `{% liquid
  assign role_map = '${roleMap}' | parse_json
  function done = 'modules/support/commands/install/apply', email: '${email}', provider: '${provider}', inbound_domain: '${domain}', role_map: role_map
  echo done | json | html_safe
%}`);
    console.log(`First support admin: ${done.admin}; email provider: ${done.email_provider}; inbound domain: ${done.inbound_domain}; role map: ${done.role_map}.`);

    if (!this.constants.has('modules/support/ADMIN_EMAILS')) this._setConstant(env, 'ADMIN_EMAILS', email);
    if (this.answers.apiKey) this._setConstant(env, 'EMAIL_API_KEY', this.answers.apiKey.trim());
    for (const name of SECRETS) {
      if (!this.constants.has(`modules/support/${name}`)) this._setConstant(env, name, crypto.randomBytes(32).toString('hex'));
    }

    if (!this.constants.has('modules/push_notifications/VAPID_PUBLIC_KEY')) {
      console.log(`\nPush keys are missing on "${env}". Run the push module's generator for it:\n  pos-cli generate run modules/push_notifications/generators/install`);
    }

    const setup = this._liquid(env, `{% liquid
  function settings = 'modules/support/helpers/settings'
  function setup = 'modules/support/commands/email/providers/sendgrid/setup_instructions', settings: settings
  echo setup | json | html_safe
%}`);
    console.log('\nNext steps:');
    if (setup.mx) console.log(`  DNS: ${setup.mx.type} ${setup.mx.host} → ${setup.mx.value} (priority ${setup.mx.priority})`);
    if (setup.inbound_url_masked) console.log(`  Inbound webhook (the full URL is under Reveal in Settings → Email): ${setup.inbound_url_masked}`);
    console.log(`  Sign in at /support-desk as ${email} and finish Settings → Email (check key, domain, inbound, test, events).`);
  }
};
