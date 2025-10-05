import fsExtra from 'fs-extra';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const { copySync } = fsExtra;

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesSource = join(__dirname, '..', 'templates');
const templatesDest = join(__dirname, '..', 'dist', 'templates');

console.log('📋 Copying templates...');
copySync(templatesSource, templatesDest);
console.log('✅ Templates copied to dist/templates');