import Generator from 'yeoman-generator';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const FLASH_SNIPPET = `  {% liquid
    function flash = 'modules/core/commands/session/get', key: 'sflash', clear: null
    if context.location.pathname != flash.from or flash.force_clear
      function _ = 'modules/core/commands/session/clear', key: 'sflash'
    endif

    render 'modules/common-styling/toasts', autohide: null, delay: null, message: flash.message, severity: flash.severity
  %}`;

const MANUAL_DEFAULT_ROLE_STEP = `Run this yourself to give every new user a default role (see README Setup step 3):

  pos-cli migrations generate <env> setup_user_default_role

Add this to the generated migration file:

  {% liquid
    function result = 'modules/core/commands/variable/set', name: 'USER_DEFAULT_ROLE', value: 'member'
    log result, type: 'setup_user_default_role result'
  %}

Then deploy:

  pos-cli deploy <env>`;

const MANUAL_SUPERADMIN_STEP = `Create a superadmin yourself via the GraphQL Explorer (see README Setup step 5):

  pos-cli gui serve

Run the user_create mutation:

  mutation user_create {
    user: user_create(user: { email: "admin@example.com", password: "password" }) {
      id
      email
    }
  }

Then find the profile for that user and append the superadmin role (e.g. from a migration):

  function result = 'modules/user/commands/profiles/roles/append', id: PROFILE_ID, role: "superadmin"`;

export default class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    this.description = 'Wire up the user module in your layout and (optionally) set up the default role, RBAC overrides, and a superadmin';
  }

  initializing() {
    const layoutsDir = this.destinationPath('app/views/layouts');
    this.layoutFiles = fs.existsSync(layoutsDir)
      ? fs.readdirSync(layoutsDir).filter((f) => f.endsWith('.liquid'))
      : [];

    this.permissionsSource = this.destinationPath('modules/user/public/lib/queries/role_permissions/permissions.liquid');
    this.permissionsTarget = this.destinationPath('app/modules/user/public/lib/queries/role_permissions/permissions.liquid');
    this.permissionsSourceExists = fs.existsSync(this.permissionsSource);
    this.permissionsAlreadyOverridden = fs.existsSync(this.permissionsTarget);
  }

  async prompting() {
    const questions = [];

    if (this.layoutFiles.length > 0) {
      questions.push({
        type: 'checkbox',
        name: 'layoutsToPatch',
        message: 'Wire up common-styling + notifications (pos-app class, init partial, flash/toasts) in which layout(s)?',
        choices: this.layoutFiles,
        default: this.layoutFiles
      });
    } else {
      questions.push({
        type: 'confirm',
        name: 'createLayout',
        message: 'No layouts found in app/views/layouts. Generate a starter app/views/layouts/application.liquid wired up for the user module?',
        default: true
      });
    }

    if (this.permissionsSourceExists && !this.permissionsAlreadyOverridden) {
      questions.push({
        type: 'confirm',
        name: 'overridePermissions',
        message: 'Copy the default RBAC permissions file into app/ (so you can define your own roles) and allow core+user to delete on deploy?',
        default: true
      });
    }

    questions.push(
      {
        type: 'confirm',
        name: 'setupDefaultRole',
        message: 'Set a USER_DEFAULT_ROLE constant via a migration (assigned automatically to every new user)?',
        default: true
      },
      {
        type: 'input',
        name: 'defaultRole',
        message: 'Default role name:',
        default: 'member',
        when: (answers) => answers.setupDefaultRole,
        validate: (value) => /^[a-zA-Z0-9_-]+$/.test(value) || 'Use only letters, numbers, - and _'
      },
      {
        type: 'confirm',
        name: 'createSuperadmin',
        message: 'Create a superadmin user now? (creates a real user + profile on the target environment)',
        default: false
      },
      {
        type: 'input',
        name: 'environment',
        message: 'Target environment (e.g. staging, production):',
        when: (answers) => answers.setupDefaultRole || answers.createSuperadmin,
        validate: (value) => (value && value.trim().length > 0) || 'Environment name is required'
      },
      {
        type: 'input',
        name: 'superadminEmail',
        message: 'Superadmin email:',
        default: 'admin@example.com',
        when: (answers) => answers.createSuperadmin
      },
      {
        type: 'password',
        name: 'superadminPassword',
        message: 'Superadmin password:',
        mask: '*',
        when: (answers) => answers.createSuperadmin,
        validate: (value) => (value && value.length >= 8) || 'Password must be at least 8 characters'
      }
    );

    this.answers = await this.prompt(questions);
  }

  writing() {
    if (this.layoutFiles.length > 0) {
      const selected = this.answers.layoutsToPatch || [];
      if (selected.length === 0) {
        console.log("Skipped layout setup — see README Setup step 2 for the manual snippet.");
      }
      selected.forEach((file) => this._patchLayout(file));
    } else if (this.answers.createLayout) {
      this.fs.copyTpl(
        this.templatePath('./views/layouts/application.liquid'),
        this.destinationPath('app/views/layouts/application.liquid'),
        {}
      );
      console.log('Layout generated: app/views/layouts/application.liquid');
    } else {
      console.log("Skipped layout setup — see README Setup step 2 for the manual snippet.");
    }

    if (this.permissionsAlreadyOverridden) {
      console.log('app/modules/user/public/lib/queries/role_permissions/permissions.liquid already exists — left untouched');
    } else if (this.answers.overridePermissions) {
      this._overridePermissions();
    }
  }

  _patchLayout(file) {
    const filePath = this.destinationPath(path.join('app/views/layouts', file));
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    const htmlTagMatch = content.match(/<html([^>]*)>/i);
    if (htmlTagMatch && !/\bpos-app\b/.test(htmlTagMatch[1])) {
      const attrs = htmlTagMatch[1];
      const classMatch = attrs.match(/class=(["'])(.*?)\1/i);
      const newAttrs = classMatch
        ? attrs.replace(classMatch[0], `class=${classMatch[1]}${classMatch[2]} pos-app${classMatch[1]}`)
        : `${attrs} class="pos-app"`;
      content = content.replace(htmlTagMatch[0], `<html${newAttrs}>`);
      changed = true;
    }

    if (!content.includes('modules/common-styling/init')) {
      if (content.includes('</head>')) {
        content = content.replace('</head>', `  {% render 'modules/common-styling/init', reset: true %}\n</head>`);
        changed = true;
      } else {
        console.log(`Could not find </head> in ${file} — add {% render 'modules/common-styling/init' %} manually.`);
      }
    }

    if (!content.includes('modules/common-styling/toasts')) {
      if (content.includes('</body>')) {
        content = content.replace('</body>', `${FLASH_SNIPPET}\n</body>`);
        changed = true;
      } else {
        console.log(`Could not find </body> in ${file} — add the flash/toasts snippet manually (see README Setup step 2).`);
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, content);
      console.log(`Updated ${file} for the user module (pos-app class / common-styling init / notifications).`);
    } else {
      console.log(`${file} already has everything the user module needs — left untouched.`);
    }
  }

  _overridePermissions() {
    fs.mkdirSync(path.dirname(this.permissionsTarget), { recursive: true });
    fs.copyFileSync(this.permissionsSource, this.permissionsTarget);
    console.log(`Copied permissions.liquid to ${path.relative(this.destinationPath(), this.permissionsTarget)} — customize your roles there.`);
    this._ensureDeleteOnDeploy(['core', 'user']);
  }

  _ensureDeleteOnDeploy(modules) {
    const configPath = this.destinationPath('app/config.yml');
    let config = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '---\n';

    const keyMatch = config.match(/modules_that_allow_delete_on_deploy:\n/);
    if (keyMatch) {
      // Walk only indented `- item` lines following the key — a bare `---` front-matter
      // delimiter has no leading whitespace, so this stops there instead of swallowing it.
      const afterKeyIndex = keyMatch.index + keyMatch[0].length;
      const after = config.slice(afterKeyIndex);
      const itemLineRegex = /^[ \t]+-[ \t]*(\S+)\n?/;
      const existing = [];
      let consumed = 0;
      let rest = after;
      while (true) {
        const m = rest.match(itemLineRegex);
        if (!m) break;
        existing.push(m[1]);
        consumed += m[0].length;
        rest = rest.slice(m[0].length);
      }

      const missing = modules.filter((m) => !existing.includes(m));
      if (missing.length === 0) {
        console.log('app/config.yml already allows core+user to delete on deploy — left untouched');
        return;
      }
      const appended = missing.map((m) => `  - ${m}\n`).join('');
      config = config.slice(0, afterKeyIndex) + after.slice(0, consumed) + appended + after.slice(consumed);
    } else {
      const block = `modules_that_allow_delete_on_deploy:\n${modules.map((m) => `  - ${m}\n`).join('')}`;
      config = /^---\s*\n/.test(config) ? config.replace(/^---\s*\n/, `---\n${block}`) : `---\n${block}---\n\n${config}`;
    }

    fs.writeFileSync(configPath, config);
    console.log('Updated app/config.yml: modules_that_allow_delete_on_deploy now includes core, user');
  }

  end() {
    if (this.answers.setupDefaultRole) {
      try {
        this._setupDefaultRole(this.answers.environment.trim(), this.answers.defaultRole.trim());
      } catch (e) {
        console.error(`\nDefault role setup failed: ${e.message}`);
        console.log(`\n${MANUAL_DEFAULT_ROLE_STEP}`);
      }
    } else {
      console.log(`\nSkipped default role setup.\n\n${MANUAL_DEFAULT_ROLE_STEP}`);
    }

    if (this.answers.createSuperadmin) {
      try {
        this._createSuperadmin(this.answers.environment.trim(), this.answers.superadminEmail.trim(), this.answers.superadminPassword);
      } catch (e) {
        console.error(`\nSuperadmin creation failed: ${e.message}`);
        console.log(`\n${MANUAL_SUPERADMIN_STEP}`);
      }
    } else {
      console.log(`\nSkipped superadmin creation.\n\n${MANUAL_SUPERADMIN_STEP}`);
    }
  }

  _setupDefaultRole(env, role) {
    console.log(`Generating migration to set USER_DEFAULT_ROLE="${role}" on "${env}"...`);
    execFileSync('pos-cli', ['migrations', 'generate', env, 'setup_user_default_role'], { stdio: 'inherit' });

    const migrationsDir = this.destinationPath('app/migrations');
    const candidates = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('setup_user_default_role.liquid'));
    const latest = candidates.sort().pop();
    if (!latest) {
      throw new Error('could not locate the generated migration file in app/migrations');
    }

    const migrationPath = path.join(migrationsDir, latest);
    const body = `{% liquid
  function result = 'modules/core/commands/variable/set', name: 'USER_DEFAULT_ROLE', value: '${role}'
  log result, type: 'setup_user_default_role_result'
%}
`;
    fs.writeFileSync(migrationPath, body);
    console.log(`Wrote migration: app/migrations/${latest}`);

    console.log(`Deploying to "${env}"...`);
    execFileSync('pos-cli', ['deploy', env], { stdio: 'inherit' });
    console.log(`USER_DEFAULT_ROLE is now "${role}" on "${env}".`);
  }

  _createSuperadmin(env, email, password) {
    const userCreateFile = this.destinationPath('modules/user/public/graphql/user/create.graphql');
    const profileCreateFile = this.destinationPath('modules/user/public/graphql/profiles/create.graphql');

    if (!fs.existsSync(userCreateFile) || !fs.existsSync(profileCreateFile)) {
      throw new Error('could not find modules/user/public/graphql/{user/create,profiles/create}.graphql — is the user module installed here?');
    }

    console.log(`Creating user "${email}" on "${env}"...`);
    const userResultRaw = execFileSync(
      'pos-cli',
      ['exec', 'graphql', env, '-f', userCreateFile, '-p', JSON.stringify({ email, password })],
      { encoding: 'utf8' }
    );
    const userResult = JSON.parse(userResultRaw);
    const userId = userResult && userResult.data && userResult.data.user && userResult.data.user.id;
    if (!userId) {
      throw new Error(`unexpected response from user_create: ${userResultRaw}`);
    }

    console.log('Creating profile with the superadmin role...');
    const profileParams = {
      uuid: crypto.randomUUID(),
      user_id: userId,
      first_name: '',
      last_name: '',
      name: '',
      email,
      roles: ['superadmin'],
      c__names: ''
    };
    execFileSync(
      'pos-cli',
      ['exec', 'graphql', env, '-f', profileCreateFile, '-p', JSON.stringify(profileParams)],
      { stdio: 'inherit' }
    );

    console.log(`\nSuperadmin created: ${email} (user id ${userId}) on "${env}". The password was never written to a file — store it somewhere safe.`);
  }
};
