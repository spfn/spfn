import fsExtra from 'fs-extra';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const { copySync, emptyDirSync } = fsExtra;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Copy init templates
// emptyDir first so files removed from the source (e.g. old .guide/) don't
// linger in dist as stale artifacts — copySync merges, it does not prune.
const templatesSource = join(__dirname, '..', 'templates');
const templatesDest = join(__dirname, '..', 'dist', 'templates');

console.log('📋 Copying templates...');
emptyDirSync(templatesDest);
copySync(templatesSource, templatesDest);
console.log('✅ Templates copied to dist/templates');