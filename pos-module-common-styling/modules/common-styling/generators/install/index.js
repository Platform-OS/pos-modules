import Generator from 'yeoman-generator';
import fs from 'fs';
import path from 'path';

const MANUAL_ESCAPE_STEP = `Add this to app/config.yml yourself (see README Setup step 4):

---
escape_output_instead_of_sanitize: true
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
    this.escapeAlreadyConfigured = fs.existsSync(configPath)
      && /escape_output_instead_of_sanitize\s*:/.test(fs.readFileSync(configPath, 'utf8'));
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
    if (this.layoutFiles.length > 0) {
      const selected = this.answers.layoutsToPatch || [];
      if (selected.length === 0) {
        console.log('Skipped layout setup — see README Setup steps 2-3 for the manual snippet.');
      }
      selected.forEach((file) => this._patchLayout(file));
    } else if (this.answers.createLayout) {
      this.fs.copyTpl(
        this.templatePath('./views/layouts/application.liquid'),
        this.destinationPath('app/views/layouts/application.liquid'),
        { reset: this.answers.reset }
      );
      console.log('Layout generated: app/views/layouts/application.liquid');
    } else {
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
      const newAttrs = classMatch
        ? attrs.replace(classMatch[0], `class=${classMatch[1]}${classMatch[2]} pos-app${classMatch[1]}`)
        : `${attrs} class="pos-app"`;
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
    const flag = 'escape_output_instead_of_sanitize: true';

    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, `---\n${flag}\n---\n`);
      console.log('Created app/config.yml with escape_output_instead_of_sanitize: true');
      return;
    }

    const content = fs.readFileSync(configPath, 'utf8');
    const updated = /^---\s*\n/.test(content)
      ? content.replace(/^---\s*\n/, `---\n${flag}\n`)
      : `---\n${flag}\n---\n\n${content}`;

    fs.writeFileSync(configPath, updated);
    console.log('Updated app/config.yml: escape_output_instead_of_sanitize is now true');
  }
};
