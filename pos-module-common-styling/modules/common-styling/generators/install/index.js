import Generator from 'yeoman-generator';
import fs from 'fs';
import path from 'path';

const TRUE_VALUES = ['true', '1', 'yes', 'y'];
const toBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return TRUE_VALUES.includes(String(value).toLowerCase());
};

export default class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    this.description = 'Generate a default layout configured with common-styling';

    this.argument('layoutName', {
      type: String,
      required: false,
      default: 'application',
      description: 'name of the layout to generate (default: application)'
    });

    this.option('reset', {
      type: Boolean,
      default: true,
      description: 'enable the common-styling CSS reset'
    });
    this.option('dark-mode', {
      type: Boolean,
      default: false,
      description: 'enable automatic dark mode based on system preference'
    });
    this.option('title', {
      type: String,
      default: 'platformOS',
      description: 'default <title> used by the layout'
    });

    const layoutName = (this.options.layoutName || 'application').replace(/\.liquid$/, '');

    this.props = {
      layoutName: layoutName,
      reset: toBool(this.options.reset, true),
      darkMode: toBool(this.options['dark-mode'], false),
      title: this.options.title || 'platformOS',
      configCss: 'config-overrides.css'
    };
  }

  writing() {
    try {
      this.fs.copyTpl(
        this.templatePath('./views/layouts/application.liquid'),
        this.destinationPath(`app/views/layouts/${this.props.layoutName}.liquid`),
        this.props
      );

      this.fs.copyTpl(
        this.templatePath('./assets/config-overrides.css'),
        this.destinationPath(`app/assets/${this.props.configCss}`),
        this.props
      );
    } catch (e) {
      console.error(e);
    }
  }

  // common-styling requires the instance to escape output instead of sanitizing it.
  // Done in end() with plain fs (after the mem-fs commit) so we can update an
  // existing app/config.yml in place without triggering Yeoman's overwrite prompt.
  _ensureConfig() {
    const configPath = this.destinationPath('app/config.yml');
    const flag = 'escape_output_instead_of_sanitize: true';

    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, `---\n${flag}\n---\n`);
      return true;
    }

    const content = fs.readFileSync(configPath, 'utf8');
    if (/escape_output_instead_of_sanitize\s*:/.test(content)) {
      return false;
    }

    // Insert the flag right after the opening `---` front matter delimiter when
    // present; otherwise wrap the file in a front matter block.
    if (/^---\s*\n/.test(content)) {
      fs.writeFileSync(configPath, content.replace(/^---\s*\n/, `---\n${flag}\n`));
    } else {
      fs.writeFileSync(configPath, `---\n${flag}\n---\n\n${content}`);
    }
    return true;
  }

  end() {
    const configChanged = this._ensureConfig();

    console.log(`Layout generated: app/views/layouts/${this.props.layoutName}.liquid`);
    console.log(`Overrides stylesheet generated: app/assets/${this.props.configCss}`);
    if (configChanged) {
      console.log('Ensured escape_output_instead_of_sanitize: true in app/config.yml');
    } else {
      console.log('app/config.yml already escapes output — left untouched');
    }
    console.log(`\nDeploy with \`pos-cli deploy <env>\``);
  }
};
