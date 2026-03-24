#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const useLocal = process.argv.includes('--local');
const testDir = path.join(__dirname, '..', 'tests', 'post_import');
const modulesDir = path.join(testDir, 'modules');

console.log(`\nSetting up E2E test environment (${useLocal ? 'LOCAL' : 'MARKETPLACE'} mode)\n`);

// Step 1: Ensure test directory structure exists
console.log('Creating directory structure...');
if (!fs.existsSync(modulesDir)) {
  fs.mkdirSync(modulesDir, { recursive: true });
}

// Step 2: Copy .pos config to test directory
console.log('Copying .pos configuration...');
const posSource = path.join(__dirname, '..', '.pos');
const posDest = path.join(testDir, '.pos');
if (fs.existsSync(posSource)) {
  fs.copyFileSync(posSource, posDest);
  console.log('   .pos copied');
} else {
  console.warn('   Warning: .pos file not found at root');
}

// Step 3: Install/copy dependency modules
console.log(`\nInstalling dependency modules (${useLocal ? 'from monorepo' : 'from marketplace'})...`);

if (useLocal) {
  // Local mode: Copy from monorepo
  const coreSource = path.join(__dirname, '..', '..', 'pos-module-core', 'modules', 'core');
  const paymentsSource = path.join(__dirname, '..', '..', 'pos-module-payments', 'modules', 'payments');

  if (fs.existsSync(coreSource)) {
    console.log('   Copying core module...');
    execSync(`cp -r "${coreSource}" "${path.join(modulesDir, 'core')}"`, { stdio: 'inherit' });
    console.log('   core copied');
  } else {
    console.error('   Error: pos-module-core not found in monorepo');
    process.exit(1);
  }

  if (fs.existsSync(paymentsSource)) {
    console.log('   Copying payments module...');
    execSync(`cp -r "${paymentsSource}" "${path.join(modulesDir, 'payments')}"`, { stdio: 'inherit' });
    console.log('   payments copied');
  } else {
    console.error('   Error: pos-module-payments not found in monorepo');
    process.exit(1);
  }
} else {
  // Marketplace mode: Download via pos-cli
  process.chdir(testDir);

  console.log('   Installing core module...');
  try {
    execSync('pos-cli modules install core', { stdio: 'inherit' });
    console.log('   core installed');
  } catch (error) {
    console.error('   Failed to install core module');
    process.exit(1);
  }

  console.log('   Installing payments module...');
  try {
    execSync('pos-cli modules install payments', { stdio: 'inherit' });
    console.log('   payments installed');
  } catch (error) {
    console.error('   Failed to install payments module');
    process.exit(1);
  }

  process.chdir(path.join(__dirname, '..'));
}

// Step 4: Copy source module (always from root)
console.log('\nCopying source module under test...');
const sourceModule = path.join(__dirname, '..', 'modules', 'payments_example_gateway');
const destModule = path.join(modulesDir, 'payments_example_gateway');

if (fs.existsSync(sourceModule)) {
  execSync(`cp -r "${sourceModule}" "${destModule}"`, { stdio: 'inherit' });
  console.log('   payments_example_gateway copied');
} else {
  console.error('   Error: Source module not found at modules/payments_example_gateway');
  process.exit(1);
}

// Step 5: Verify structure
console.log('\nSetup complete! Test environment ready:');
console.log(`   Test app: tests/post_import/app/`);
console.log(`   Modules: tests/post_import/modules/`);
console.log(`     - core (${useLocal ? 'local' : 'marketplace'})`);
console.log(`     - payments (${useLocal ? 'local' : 'marketplace'})`);
console.log(`     - payments_example_gateway (source)`);
console.log('\nRun tests with: npm run pw-tests\n');
