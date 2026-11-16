// Part of `npm run version`: pos-cli bumps pos-module.json; the distributed
// module's own package.json (modules/support/package.json, read by the
// install generator) gets the same version, so the two never disagree.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'pos-module.json'), 'utf8'));
const file = path.join(ROOT, 'modules/support/package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
if (pkg.version !== version) {
  pkg.version = version;
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}
console.log(`modules/support/package.json: ${version}`);
