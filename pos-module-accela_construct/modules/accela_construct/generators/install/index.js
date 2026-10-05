import Generator from 'yeoman-generator';
import { execFileSync } from 'child_process';

const CONSTANTS = [
  {
    name: 'ACCELA_CONSTRUCT_BASE_URL',
    message: 'Accela API base URL',
    default: 'https://apis.accela.com/v4'
  },
  {
    name: 'ACCELA_CONSTRUCT_AUTH_URL',
    message: 'Accela OAuth token endpoint',
    default: 'https://auth.accela.com/oauth2/token'
  },
  {
    name: 'ACCELA_CONSTRUCT_APP_ID',
    message: 'Accela App ID (sent as x-accela-appid on every call)',
    required: true
  },
  {
    name: 'ACCELA_CONSTRUCT_CLIENT_ID',
    message: 'Accela OAuth client_id',
    required: true
  },
  {
    name: 'ACCELA_CONSTRUCT_CLIENT_SECRET',
    message: 'Accela OAuth client_secret',
    required: true,
    type: 'password'
  },
  {
    name: 'ACCELA_CONSTRUCT_USERNAME',
    message: 'Civic ID / Accela Automation username',
    required: true
  },
  {
    name: 'ACCELA_CONSTRUCT_PASSWORD',
    message: 'Civic ID / Accela Automation password',
    required: true,
    type: 'password'
  },
  {
    name: 'ACCELA_CONSTRUCT_AGENCY',
    message: 'Agency name',
    default: 'Nullisland'
  },
  {
    name: 'ACCELA_CONSTRUCT_ENVIRONMENT',
    message: "Agency environment ('TEST' or 'PROD') - must match the agency's configured environments",
    default: 'TEST'
  },
  {
    name: 'ACCELA_CONSTRUCT_SCOPE',
    message: 'Space-delimited OAuth scope, per endpoint you plan to call',
    default: 'records search_records search_owners run_emse_script get_settings_inspection_types get_parcel_conditions get_address_parcels get_inspections get_inspection get_inspection_histories get_inspection_available_dates schedule_inspection schedule_pending_inspection reschedule_inspection update_inspection result_inspection assign_inspections cancel_inspection delete_inspections get_inspection_related create_inspection_related delete_inspection_related get_inspection_checklists create_inspection_checklists delete_inspection_checklists get_inspection_conditions get_inspection_condition get_inspection_condition_histories create_inspection_conditions update_inspection_condition delete_inspection_conditions download_document global_search search_addresses search_assessments search_contacts search_costs search_inspections search_parts search_professionals'
  },
  {
    name: 'ACCELA_CONSTRUCT_MAX_RETRIES',
    message: 'Max background retries per call when with_retries: true is passed (0 disables retrying)',
    default: '3'
  },
  {
    name: 'ACCELA_CONSTRUCT_RETRY_DELAY_MINUTES',
    message: 'Base retry delay in minutes, multiplied by the retry number for linear backoff',
    default: '1'
  }
];

const manualConstantsStep = (env) => {
  const target = env || '<env>';
  const lines = CONSTANTS.map((c) => {
    const value = c.default !== undefined ? c.default : `<${c.name}>`;
    return `  pos-cli constants set ${target} --name ${c.name} --value "${value}"`;
  });

  return `Run this yourself for every environment (including local dev) before using the module —
lib/accela_client/get_valid_token.liquid fails if any of the required constants are missing:

${lines.join('\n')}

See the module README, "Required constants", for details on each value.`;
};

export default class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    this.description = 'Set up the ACCELA_CONSTRUCT_* constants required by the accela_construct module';
  }

  async prompting() {
    const questions = [
      {
        type: 'confirm',
        name: 'setupConstants',
        message: 'Set the ACCELA_CONSTRUCT_* constants now via `pos-cli constants set`?',
        default: true
      },
      {
        type: 'input',
        name: 'targetEnvironment',
        message: 'Target environment for `pos-cli constants set` (e.g. staging, production):',
        when: (answers) => answers.setupConstants,
        validate: (value) => (value && value.trim().length > 0) || 'Environment name is required'
      }
    ];

    CONSTANTS.forEach((c) => {
      questions.push({
        type: c.type === 'password' ? 'password' : 'input',
        name: c.name,
        message: c.message,
        default: c.default,
        when: (answers) => answers.setupConstants,
        validate: (value) => {
          if (c.required && (!value || !value.trim().length)) {
            return `${c.name} is required`;
          }
          return true;
        }
      });
    });

    this.answers = await this.prompt(questions);
  }

  end() {
    if (!this.answers.setupConstants) {
      console.log(`\nSkipped constants setup.\n\n${manualConstantsStep()}`);
      return;
    }

    const env = this.answers.targetEnvironment.trim();

    try {
      CONSTANTS.forEach((c) => {
        const value = this.answers[c.name];
        console.log(`Setting ${c.name} on "${env}"...`);
        execFileSync(
          'pos-cli',
          ['constants', 'set', env, '--name', c.name, '--value', value],
          { stdio: 'inherit' }
        );
      });

      console.log(`\nAll ${CONSTANTS.length} constants are set on "${env}". Re-run this generator for any other environment.`);
    } catch (e) {
      console.error(`\nConstants setup failed: ${e.message}`);
      console.log(`\n${manualConstantsStep(env)}`);
    }
  }
};
