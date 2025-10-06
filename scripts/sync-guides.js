#!/usr/bin/env node
/**
 * Sync package README.md files to .guide/ directory
 *
 * Converts:
 * - packages/core/README.md → packages/core/.guide/spfn-core.md
 * - packages/auth/README.md → packages/auth/.guide/spfn-auth.md
 * - packages/cli/README.md → packages/cli/.guide/spfn-cli.md
 *
 * This allows Claude Code to reference package documentation
 * without duplicating content.
 */

import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const packagesDir = join(rootDir, 'packages');

const packageMapping = {
  'core': 'spfn-core.md',
  'auth': 'spfn-auth.md',
  'cli': 'spfn-cli.md',
};

console.log('📚 Syncing README.md files to .guide/ directories...\n');

// Get all package directories
const packages = readdirSync(packagesDir).filter(name => {
  const packagePath = join(packagesDir, name);
  return statSync(packagePath).isDirectory();
});

let syncedCount = 0;

for (const pkg of packages) {
  const packagePath = join(packagesDir, pkg);
  const readmePath = join(packagePath, 'README.md');

  if (!existsSync(readmePath)) {
    console.log(`⚠️  Skipping ${pkg}: No README.md found`);
    continue;
  }

  const guideDir = join(packagePath, '.guide');
  const guideName = packageMapping[pkg] || `spfn-${pkg}.md`;
  const guidePath = join(guideDir, guideName);

  // Create .guide directory if it doesn't exist
  if (!existsSync(guideDir)) {
    mkdirSync(guideDir, { recursive: true });
  }

  // Copy README.md to .guide/
  try {
    copyFileSync(readmePath, guidePath);
    console.log(`✅ ${pkg}/README.md → .guide/${guideName}`);
    syncedCount++;
  } catch (error) {
    console.error(`❌ Failed to sync ${pkg}: ${error.message}`);
  }
}

console.log(`\n✨ Synced ${syncedCount} package documentation files to .guide/\n`);