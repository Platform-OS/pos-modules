import { liquid } from './helpers';

// Sends email through the real provider again.
export default async function globalTeardown() {
  liquid(`{% liquid
  function _ = 'modules/support/commands/settings/set', key: 'email_api_base_url', value: null
  echo '{}'
%}`);
}
