/**
 * Watch 모드 - 자동 재생성
 *
 * - entities 변경 → types 재생성
 * - routes 변경 → API client 재생성
 */
import chokidar from 'chokidar';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entitiesDir = join(__dirname, '..', 'entities');
const routesDir = join(__dirname, '..', 'routes');

console.log('👀 Watching for changes...\n');

// Entities 감시
chokidar.watch(`${entitiesDir}/**/*.ts`).on('change', (path) =>
{
    console.log(`\n⚠️  Entity changed: ${path}`);
    console.log('\n🚨 DATABASE MIGRATION REQUIRED!\n');
    console.log('📋 Required steps:');
    console.log('   1. Review your schema changes carefully');
    console.log('   2. Generate migration: npm run db:generate (optional)');
    console.log('   3. Apply schema to DB: npm run db:push');
    console.log('   → Types will be auto-generated after db:push');
    console.log('\n⛔ Type generation blocked until migration is applied.\n');
});

// Routes 감시
chokidar.watch(`${routesDir}/**/*.ts`).on('change', (path) =>
{
    console.log(`\n🔄 Route changed: ${path}`);
    console.log('🔄 Regenerating API client...');

    try
    {
        execSync('npm run generate:api', { stdio: 'inherit' });
        console.log('✅ API client regenerated\n');
    }
    catch (error)
    {
        console.error('❌ Failed to regenerate API client\n');
    }
});

console.log(`📁 Watching entities: ${entitiesDir}`);
console.log(`📁 Watching routes: ${routesDir}`);
console.log('\\n✨ Ready for changes...\\n');