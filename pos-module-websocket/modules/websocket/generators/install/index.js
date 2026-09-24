import Generator from 'yeoman-generator';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const INIT_TAG = "{% render 'modules/websocket/init' %}";

const MANUAL_ROOM_STEP = `Rooms don't exist until something registers them (see README Setup step 2). Run
this yourself, e.g. from a migration:

  pos-cli migrations generate <env> register_websocket_room

Add this to the generated migration file:

  {% liquid
    function room = 'modules/websocket/commands/rooms/find_or_create',
      room_id: 'demo',
      public: true,
      created_by: USER_ID
    log room, type: 'register_websocket_room_result'
  %}

Then deploy:

  pos-cli deploy <env>`;

export default class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    this.description = 'Wire up the websocket init partial and (optionally) register a starter room';
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
        message: 'Add the websocket init partial to which layout(s)?',
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
        name: 'registerRoom',
        message: 'Register a starter room now via a migration? (rooms are otherwise unjoinable until registered)',
        default: false
      },
      {
        type: 'input',
        name: 'environment',
        message: 'Target environment (e.g. staging, production):',
        when: (answers) => answers.registerRoom,
        validate: (value) => (value && value.trim().length > 0) || 'Environment name is required'
      },
      {
        type: 'input',
        name: 'roomId',
        message: 'Room ID:',
        default: 'demo',
        when: (answers) => answers.registerRoom,
        validate: (value) => (value && value.trim().length > 0) || 'Room ID is required'
      },
      {
        type: 'confirm',
        name: 'roomPublic',
        message: 'Make this room public (joinable by any logged-in user)?',
        default: true,
        when: (answers) => answers.registerRoom
      },
      {
        type: 'input',
        name: 'createdByUserId',
        message: 'User ID to record as the room\'s creator (required by the module, e.g. from `modules/user/queries/user/find` or your instance admin):',
        when: (answers) => answers.registerRoom,
        validate: (value) => (value && value.trim().length > 0) || 'A creator user ID is required'
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

    if (content.includes('modules/websocket/init')) {
      console.log(`${file} already renders the websocket init partial — left untouched`);
      return;
    }

    if (content.includes('</head>')) {
      fs.writeFileSync(filePath, content.replace('</head>', `  ${INIT_TAG}\n</head>`));
      console.log(`Added the websocket init partial to ${file}`);
    } else {
      fs.writeFileSync(filePath, `${INIT_TAG}\n${content}`);
      console.log(`Could not find </head> in ${file} — prepended the init partial to the top instead; move it into <head> manually.`);
    }
  }

  end() {
    if (this.answers.registerRoom) {
      try {
        this._registerRoom(
          this.answers.environment.trim(),
          this.answers.roomId.trim(),
          this.answers.roomPublic,
          this.answers.createdByUserId.trim()
        );
      } catch (e) {
        console.error(`\nRoom registration failed: ${e.message}`);
        console.log(`\n${MANUAL_ROOM_STEP}`);
      }
    } else {
      console.log(`\nSkipped room registration.\n\n${MANUAL_ROOM_STEP}`);
    }
  }

  _registerRoom(env, roomId, isPublic, createdBy) {
    console.log(`Generating migration to register room "${roomId}" on "${env}"...`);
    execFileSync('pos-cli', ['migrations', 'generate', env, 'register_websocket_room'], { stdio: 'inherit' });

    const migrationsDir = this.destinationPath('app/migrations');
    const candidates = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('register_websocket_room.liquid'));
    const latest = candidates.sort().pop();
    if (!latest) {
      throw new Error('could not locate the generated migration file in app/migrations');
    }

    const migrationPath = path.join(migrationsDir, latest);
    const body = `{% liquid
  function room = 'modules/websocket/commands/rooms/find_or_create', room_id: '${roomId}', public: ${isPublic}, created_by: '${createdBy}'
  log room, type: 'register_websocket_room_result'
%}
`;
    fs.writeFileSync(migrationPath, body);
    console.log(`Wrote migration: app/migrations/${latest}`);

    console.log(`Deploying to "${env}"...`);
    execFileSync('pos-cli', ['deploy', env], { stdio: 'inherit' });
    console.log(`Room "${roomId}" is now registered on "${env}".`);
  }
};
