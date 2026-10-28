import fs from 'fs';
import path from 'path';
import { liquidFile, users } from './helpers';

// Routes every email of the run to the stub and prepares the E2E department.
export default async function globalSetup() {
  const out = liquidFile('setup.liquid', { AGENT_EMAIL: users.agent.email });
  fs.writeFileSync(path.join(__dirname, '.state.json'), JSON.stringify(out));
}
