import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import fse from 'fs-extra';
import { logger } from '../../../utils/logger.js';

const { writeFileSync } = fse;

/**
 * Setup configuration files:
 * - .env.local.example (environment variables template)
 * - .spfnrc.ts (codegen configuration)
 * - .gitignore (add .spfn directory)
 * - tsconfig.json (exclude src/server for Vercel)
 */
export async function setupConfigFiles(cwd: string): Promise<void>
{
    // Generate .env.local.example
    const envExamplePath = join(cwd, '.env.local.example');
    if (!existsSync(envExamplePath))
    {
        const envExampleContent = `# Environment
NODE_ENV=local

# Logging
SPFN_LOG_LEVEL=info

# Database (matches docker-compose.yml)
DATABASE_URL=postgresql://spfn:spfn@localhost:5432/spfn_dev

# Cache - Redis/Valkey (optional)
CACHE_URL=redis://localhost:6379

# SPFN API Server URL (for API Route Proxy and SSR)
SPFN_API_URL=http://localhost:8790
`;
        writeFileSync(envExamplePath, envExampleContent);
        logger.success('Created .env.local.example');
    }

    // Create .spfnrc.ts for codegen configuration
    const spfnrcPath = join(cwd, '.spfnrc.ts');
    if (!existsSync(spfnrcPath))
    {
        const spfnrcContent = `import { defineConfig, defineGenerator } from '@spfn/core/codegen';

const routerGen = defineGenerator({
    name: '@spfn/core:router',
    enabled: true,
});

export default defineConfig({
    generators: [routerGen]
});
`;
        writeFileSync(spfnrcPath, spfnrcContent);
        logger.success('Created .spfnrc.ts (codegen configuration)');
    }

    // Update .gitignore to include .spfn directory
    const gitignorePath = join(cwd, '.gitignore');
    if (existsSync(gitignorePath))
    {
        try
        {
            const gitignoreContent = readFileSync(gitignorePath, 'utf-8');

            // Check if .spfn is already in .gitignore
            if (!gitignoreContent.includes('.spfn'))
            {
                // Add .spfn to .gitignore after production build section
                const updatedContent = gitignoreContent.replace(
                    /# production\n\/build/,
                    '# production\n/build\n\n# spfn\n/.spfn/'
                );

                writeFileSync(gitignorePath, updatedContent);
                logger.success('Updated .gitignore with .spfn directory');
            }
        }
        catch (error)
        {
            // Not critical, continue
            logger.warn('Could not update .gitignore (you can add .spfn manually)');
        }
    }

    // Update tsconfig.json to exclude src/server
    const tsconfigPath = join(cwd, 'tsconfig.json');
    if (existsSync(tsconfigPath))
    {
        try
        {
            const tsconfigContent = readFileSync(tsconfigPath, 'utf-8');
            const tsconfig = JSON.parse(tsconfigContent);

            // Initialize exclude array if not exists
            if (!tsconfig.exclude)
            {
                tsconfig.exclude = [];
            }

            // Add src/server to exclude if not already present
            if (!tsconfig.exclude.includes('src/server'))
            {
                tsconfig.exclude.push('src/server');
                writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
                logger.success('Updated tsconfig.json (excluded src/server for Vercel compatibility)');
            }
        }
        catch (error)
        {
            // Not critical, continue
            logger.warn('Could not update tsconfig.json (you can add "src/server" to exclude manually)');
        }
    }
}