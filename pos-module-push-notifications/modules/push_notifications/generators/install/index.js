import Generator from 'yeoman-generator';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

const INIT_TAG = "{% render 'modules/push_notifications/init' %}";

const MANUAL_CONSTANTS_STEP = `Run this yourself for every environment (including local dev) before testing —
commands/notifications/send fails fast with a "configuration" error if any of the five constants are missing:

  VAPID_KEYS=$(npx web-push generate-vapid-keys)
  VAPID_PUBLIC=$(echo "$VAPID_KEYS" | grep -A1 "Public Key:" | tail -1)
  VAPID_PRIVATE=$(echo "$VAPID_KEYS" | grep -A1 "Private Key:" | tail -1)

  pos-cli constants set <env> --name "modules/push_notifications/VAPID_PUBLIC_KEY" --value "$VAPID_PUBLIC"
  pos-cli constants set <env> --name "modules/push_notifications/VAPID_PRIVATE_KEY" --value "$VAPID_PRIVATE"
  pos-cli constants set <env> --name "modules/push_notifications/VAPID_SUBJECT" --value "mailto:admin@yoursite.com"

  openssl ecparam -name prime256v1 -genkey -noout -out sender_private.pem
  pos-cli constants set <env> --name "modules/push_notifications/PUSH_SENDER_PRIVATE_KEY_PEM" --value "$(cat sender_private.pem)"

  PUSH_SENDER_PUBLIC=$(openssl ec -in sender_private.pem -pubout -conv_form uncompressed -outform DER | tail -c 65 | base64 | tr -d '\\n' | tr '+/' '-_' | tr -d '=')
  pos-cli constants set <env> --name "modules/push_notifications/PUSH_SENDER_PUBLIC_KEY" --value "$PUSH_SENDER_PUBLIC"

See the module README, Setup step 1, for full details.`;

export default class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    this.description = 'Wire up the push_notifications init partial and (optionally) generate & store the required constants';
  }

  initializing() {
    const layoutsDir = this.destinationPath('app/views/layouts');
    this.layoutFiles = fs.existsSync(layoutsDir)
      ? fs.readdirSync(layoutsDir).filter((f) => f.endsWith('.liquid'))
      : [];
  }

  async prompting() {
    const questions = [];

    if (this.layoutFiles.length > 0) {
      questions.push({
        type: 'checkbox',
        name: 'layoutsToPatch',
        message: 'Add the push_notifications init partial to which layout(s)?',
        choices: this.layoutFiles,
        default: this.layoutFiles
      });
    } else {
      questions.push({
        type: 'confirm',
        name: 'createLayout',
        message: 'No layouts found in app/views/layouts. Generate a starter app/views/layouts/application.liquid with the init partial wired up?',
        default: true
      });
    }

    questions.push(
      {
        type: 'confirm',
        name: 'setupConstants',
        message: 'Generate VAPID + sender keys now and store them as constants on an environment? (requires pos-cli, openssl and network access)',
        default: true
      },
      {
        type: 'input',
        name: 'environment',
        message: 'Target environment for `pos-cli constants set` (e.g. staging, production):',
        when: (answers) => answers.setupConstants,
        validate: (value) => (value && value.trim().length > 0) || 'Environment name is required'
      },
      {
        type: 'input',
        name: 'vapidSubject',
        message: 'Contact URI for VAPID_SUBJECT (mailto: or https:):',
        default: 'mailto:admin@yoursite.com',
        when: (answers) => answers.setupConstants
      }
    );

    this.answers = await this.prompt(questions);
  }

  writing() {
    if (this.layoutFiles.length > 0) {
      const selected = this.answers.layoutsToPatch || [];
      if (selected.length === 0) {
        console.log(`Skipped layout setup. Add this to your layout's <head> manually:\n\n  ${INIT_TAG}\n`);
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
      console.log(`Skipped layout setup. Add this to your layout's <head> manually:\n\n  ${INIT_TAG}\n`);
    }
  }

  _patchLayout(file) {
    const filePath = this.destinationPath(path.join('app/views/layouts', file));
    const content = fs.readFileSync(filePath, 'utf8');

    if (content.includes('modules/push_notifications/init')) {
      console.log(`${file} already renders the push_notifications init partial — left untouched`);
      return;
    }

    if (content.includes('</head>')) {
      fs.writeFileSync(filePath, content.replace('</head>', `  ${INIT_TAG}\n</head>`));
      console.log(`Added the push_notifications init partial to ${file}`);
    } else {
      fs.writeFileSync(filePath, `${INIT_TAG}\n${content}`);
      console.log(`Could not find </head> in ${file} — prepended the init partial to the top instead; move it into <head> manually.`);
    }
  }

  end() {
    if (this.answers.setupConstants) {
      try {
        this._setupConstants(this.answers.environment.trim(), this.answers.vapidSubject);
      } catch (e) {
        console.error(`\nConstants setup failed: ${e.message}`);
        console.log(`\n${MANUAL_CONSTANTS_STEP}`);
      }
    } else {
      console.log(`\nSkipped constants setup.\n\n${MANUAL_CONSTANTS_STEP}`);
    }
  }

  _setupConstants(env, subject) {
    const setConstant = (name, value) => {
      console.log(`Setting modules/push_notifications/${name} on "${env}"...`);
      execFileSync(
        'pos-cli',
        ['constants', 'set', env, '--name', `modules/push_notifications/${name}`, '--value', value],
        { stdio: 'inherit' }
      );
    };

    console.log('Generating VAPID keypair...');
    const vapidOutput = execFileSync('npx', ['web-push', 'generate-vapid-keys'], { encoding: 'utf8' });
    const publicMatch = vapidOutput.match(/Public Key:\s*\n(\S+)/);
    const privateMatch = vapidOutput.match(/Private Key:\s*\n(\S+)/);
    if (!publicMatch || !privateMatch) {
      throw new Error('could not parse VAPID keys from `web-push generate-vapid-keys` output');
    }

    setConstant('VAPID_PUBLIC_KEY', publicMatch[1]);
    setConstant('VAPID_PRIVATE_KEY', privateMatch[1]);
    setConstant('VAPID_SUBJECT', subject);

    console.log('Generating sender EC keypair...');
    const tmpFile = path.join(os.tmpdir(), `push-notifications-sender-${process.pid}.pem`);
    try {
      execFileSync('openssl', ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', tmpFile]);
      const privatePem = fs.readFileSync(tmpFile, 'utf8');
      setConstant('PUSH_SENDER_PRIVATE_KEY_PEM', privatePem);

      const der = execFileSync('openssl', ['ec', '-in', tmpFile, '-pubout', '-conv_form', 'uncompressed', '-outform', 'DER']);
      const rawPoint = der.subarray(der.length - 65);
      const publicKeyB64Url = rawPoint.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      setConstant('PUSH_SENDER_PUBLIC_KEY', publicKeyB64Url);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }

    console.log(`\nAll five constants are set on "${env}". Re-run this generator for any other environment.`);
  }
};
