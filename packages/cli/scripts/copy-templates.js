import fsExtra from 'fs-extra';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const { copySync } = fsExtra;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Copy init templates
const templatesSource = join(__dirname, '..', 'templates');
const templatesDest = join(__dirname, '..', 'dist', 'templates');

console.log('📋 Copying templates...');
copySync(templatesSource, templatesDest);
console.log('✅ Templates copied to dist/templates');

// Copy generate templates
const generateTemplatesSource = join(__dirname, '..', 'src', 'commands', 'generate', 'templates');
const generateTemplatesDest = join(__dirname, '..', 'dist', 'commands', 'generate', 'templates');

console.log('📋 Copying generate templates...');
copySync(generateTemplatesSource, generateTemplatesDest);
console.log('✅ Generate templates copied to dist/commands/generate/templates');