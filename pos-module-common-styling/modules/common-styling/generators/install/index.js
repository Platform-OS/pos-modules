import Generator from 'yeoman-generator';
import fs from 'fs';
import path from 'path';

const ESCAPE_FLAG = 'escape_output_instead_of_sanitize: true';
const ESCAPE_FLAG_CONFIGURED_REGEX = /escape_output_instead_of_sanitize\s*:\s*true\b/;

const MANUAL_ESCAPE_STEP = `Add this to app/config.yml yourself (see README Setup step 4):

---
${ESCAPE_FLAG}
---`;

export default class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    this.description = 'Wire up common-styling in your layout (pos-app class, init partial) and the required instance setting';
  }

  initializing() {
    const layoutsDir = this.destinationPath('app/views/layouts');
    this.layoutFiles = fs.existsSync(layoutsDir)
      ? fs.readdirSync(layoutsDir).filter((f) => f.endsWith('.liquid'))
      : [];

    const configPath = this.destinationPath('app/config.yml');
    this.configContent = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;
    this.escapeAlreadyConfigured = this.configContent !== null && ESCAPE_FLAG_CONFIGURED_REGEX.test(this.configContent);
  }

  async prompting() {
    const questions = [];

    if (this.layoutFiles.length > 0) {
      questions.push({
        type: 'checkbox',
        name: 'layoutsToPatch',
        message: 'Wire up common-styling (pos-app class, init partial) in which layout(s)?',
        choices: this.layoutFiles,
        default: this.layoutFiles
      });
    } else {
      questions.push({
        type: 'confirm',
        name: 'createLayout',
        message: 'No layouts found in app/views/layouts. Generate a starter app/views/layouts/application.liquid wired up for common-styling?',
        default: true
      });
    }

    questions.push({
      type: 'confirm',
      name: 'reset',
      message: 'Enable the common-styling CSS reset (recommended for a fresh app)?',
      default: true
    });

    if (!this.escapeAlreadyConfigured) {
      questions.push({
        type: 'confirm',
        name: 'ensureEscapeConfig',
        message: 'Set escape_output_instead_of_sanitize: true in app/config.yml (required by common-styling)?',
        default: true
      });
    }

    this.answers = await this.prompt(questions);
  }

  writing() {
    let layoutSetupDone = false;

    if (this.layoutFiles.length > 0) {
      const selected = this.answers.layoutsToPatch || [];
      selected.forEach((file) => this._patchLayout(file));
      layoutSetupDone = selected.length > 0;
    } else if (this.answers.createLayout) {
      this.fs.copyTpl(
        this.templatePath('./views/layouts/application.liquid'),
        this.destinationPath('app/views/layouts/application.liquid'),
        { reset: this.answers.reset }
      );
      console.log('Layout generated: app/views/layouts/application.liquid');
      layoutSetupDone = true;
    }

    if (!layoutSetupDone) {
      console.log('Skipped layout setup — see README Setup steps 2-3 for the manual snippet.');
    }

    if (this.escapeAlreadyConfigured) {
      console.log('app/config.yml already sets escape_output_instead_of_sanitize — left untouched');
    } else if (this.answers.ensureEscapeConfig) {
      this._ensureEscapeConfig();
    } else {
      console.log(`\nSkipped instance setting.\n\n${MANUAL_ESCAPE_STEP}`);
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
      let newAttrs;
      if (classMatch) {
        const quote = classMatch[1];
        newAttrs = attrs.replace(classMatch[0], `class=${quote}${classMatch[2]} pos-app${quote}`);
      } else {
        newAttrs = `${attrs} class="pos-app"`;
      }
      content = content.replace(htmlTagMatch[0], `<html${newAttrs}>`);
      changed = true;
    }

    if (!content.includes('modules/common-styling/init')) {
      if (content.includes('</head>')) {
        content = content.replace('</head>', `  {% render 'modules/common-styling/init', reset: ${this.answers.reset} %}\n</head>`);
        changed = true;
      } else {
        console.log(`Could not find </head> in ${file} — add {% render 'modules/common-styling/init' %} manually.`);
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, content);
      console.log(`Updated ${file} for common-styling (pos-app class / init partial).`);
    } else {
      console.log(`${file} already has everything common-styling needs — left untouched.`);
    }
  }

  _ensureEscapeConfig() {
    const configPath = this.destinationPath('app/config.yml');

    if (this.configContent === null) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, `---\n${ESCAPE_FLAG}\n---\n`);
      console.log('Created app/config.yml with escape_output_instead_of_sanitize: true');
      return;
    }

    const updated = /^---\s*\n/.test(this.configContent)
      ? this.configContent.replace(/^---\s*\n/, `---\n${ESCAPE_FLAG}\n`)
      : `---\n${ESCAPE_FLAG}\n${this.configContent}`;

    fs.writeFileSync(configPath, updated);
    console.log('Updated app/config.yml: escape_output_instead_of_sanitize is now true');
  }
};
