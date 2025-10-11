import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import prompts from 'prompts';
import ora from 'ora';
import fse from 'fs-extra';
import chalk from 'chalk';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const { ensureDirSync, writeFileSync } = fse;

import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Find templates directory - works in both npm package and monorepo dev mode
 * - npm package: node_modules/@spfn/core/dist/scripts/templates/
 * - monorepo dev: packages/core/dist/scripts/templates/ (from packages/cli/dist/)
 */
function findScriptTemplatesPath(): string {
    // Case 1: monorepo dev - from cli/dist/ to core/dist/scripts/templates/
    const devPath = join(__dirname, '..', '..', 'core', 'dist', 'scripts', 'templates');
    if (existsSync(devPath)) {
        return devPath;
    }

    // Case 2: npm package - node_modules/@spfn/core/dist/scripts/templates
    const npmPath = join(__dirname, '..', '..', '..', 'core', 'dist', 'scripts', 'templates');
    if (existsSync(npmPath)) {
        return npmPath;
    }

    throw new Error('CRUD templates directory not found. Please rebuild the package.');
}

interface GenerateOptions {
    force?: boolean;
    interactive?: boolean;
    only?: string;
    dryRun?: boolean;
}

interface FileOperation {
    path: string;
    content: string;
    exists: boolean;
}

/**
 * Extract entity name from Drizzle entity file
 */
function extractEntityName(entityPath: string): string | null {
    try {
        const content = readFileSync(entityPath, 'utf-8');

        // Match: export const entityName = pgTable('table_name', ...)
        const match = content.match(/export\s+const\s+(\w+)\s*=\s*pgTable\(/);
        if (match) {
            return match[1];
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Generate variable transformations from entity name
 * Example: 'users' -> { pascal: 'Users', camel: 'users', singular: 'user', ... }
 */
function generateVariables(entityName: string): Record<string, string> {
    // Normalize entity name (lowercase)
    const normalized = entityName.toLowerCase();

    // Generate singular form (simple heuristic - can be improved)
    const singular = normalized.endsWith('s') ? normalized.slice(0, -1) : normalized;

    // Pascal case
    const toPascalCase = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
    const pascal = toPascalCase(normalized);
    const pascalSingular = toPascalCase(singular);

    // Camel case
    const camel = normalized;
    const camelSingular = singular;

    // Get current timestamp
    const timestamp = new Date().toISOString();

    // Get TypeScript type names from entity
    const typeSelect = `Select${pascal}`;
    const typeInsert = `Insert${pascal}`;

    return {
        'ENTITY_NAME': normalized,
        'ENTITY_NAME_PASCAL': pascal,
        'ENTITY_NAME_CAMEL': camel,
        'ENTITY_NAME_SINGULAR': camelSingular,
        'ENTITY_NAME_PASCAL_SINGULAR': pascalSingular,
        'TYPE_SELECT': typeSelect,
        'TYPE_INSERT': typeInsert,
        'TIMESTAMP': timestamp,
    };
}

/**
 * Render template with variable substitution
 */
function renderTemplate(template: string, variables: Record<string, string>): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, value);
    }

    return result;
}

/**
 * Plan file operations based on entity and options
 */
function planFileOperations(
    cwd: string,
    entityName: string,
    templatesDir: string,
    variables: Record<string, string>,
    options: GenerateOptions,
    entityExists: boolean
): FileOperation[] {
    const operations: FileOperation[] = [];

    const entityNameNormalized = entityName.toLowerCase();

    // Define target paths
    const entitiesBase = join(cwd, 'src', 'server', 'entities');
    const routesBase = join(cwd, 'src', 'server', 'routes', entityNameNormalized);
    const repositoriesBase = join(cwd, 'src', 'server', 'repositories');
    const routesIdBase = join(routesBase, '[id]');

    // Define file mappings: [templateName, targetPath]
    const fileMap: Array<[string, string]> = [
        ['entity.template.txt', join(entitiesBase, `${entityNameNormalized}.ts`)],
        ['contract.template.txt', join(routesBase, 'contract.ts')],
        ['routes-index.template.txt', join(routesBase, 'index.ts')],
        ['routes-id.template.txt', join(routesIdBase, 'index.ts')],
        ['repository.template.txt', join(repositoriesBase, `${entityNameNormalized}.repository.ts`)],
    ];

    // Apply --only filter if specified
    const onlyFilter = options.only?.split(',').map(f => f.trim()) || null;

    for (const [templateName, targetPath] of fileMap) {
        // Skip entity generation if entity already exists
        if (templateName === 'entity.template.txt' && entityExists) {
            continue;
        }

        // Check if this file should be generated based on --only option
        if (onlyFilter) {
            const fileType = templateName.replace('.template.txt', '').replace('routes-', '');
            if (!onlyFilter.includes(fileType) && !onlyFilter.includes('routes') && !onlyFilter.includes(fileType.replace('index', 'routes'))) {
                continue;
            }
        }

        const templatePath = join(templatesDir, templateName);

        if (!existsSync(templatePath)) {
            logger.warn(`Template not found: ${templateName}`);
            continue;
        }

        const templateContent = readFileSync(templatePath, 'utf-8');
        const renderedContent = renderTemplate(templateContent, variables);

        operations.push({
            path: targetPath,
            content: renderedContent,
            exists: existsSync(targetPath),
        });
    }

    return operations;
}

/**
 * Execute file operations with safety checks
 */
async function executeOperations(
    operations: FileOperation[],
    options: GenerateOptions
): Promise<void> {
    const { force, interactive, dryRun } = options;

    // Check for existing files
    const existingFiles = operations.filter(op => op.exists);

    if (existingFiles.length > 0 && !force) {
        logger.warn(`${existingFiles.length} file(s) already exist:`);
        existingFiles.forEach(op => {
            logger.warn(`  - ${op.path}`);
        });

        if (interactive) {
            const { proceed } = await prompts({
                type: 'confirm',
                name: 'proceed',
                message: 'Overwrite existing files?',
                initial: false,
            });

            if (!proceed) {
                logger.info('Cancelled.');
                return;
            }
        } else {
            logger.error('\nFiles already exist. Use --force to overwrite or --interactive for prompts.');
            process.exit(1);
        }
    }

    // Dry run mode
    if (dryRun) {
        logger.info('\n[DRY RUN] The following files would be created:');
        operations.forEach(op => {
            const status = op.exists ? chalk.yellow('[OVERWRITE]') : chalk.green('[CREATE]');
            logger.info(`  ${status} ${relative(process.cwd(), op.path)}`);
        });
        logger.info('\nRun without --dry-run to actually create files.');
        return;
    }

    // Execute operations
    const spinner = ora('Generating CRUD files...').start();

    try {
        for (const op of operations) {
            // Ensure directory exists
            ensureDirSync(dirname(op.path));

            // Write file
            writeFileSync(op.path, op.content, 'utf-8');

            const status = op.exists ? 'Updated' : 'Created';
            spinner.text = `${status}: ${relative(process.cwd(), op.path)}`;
        }

        spinner.succeed(`Generated ${operations.length} file(s)`);
    } catch (error) {
        spinner.fail('Failed to generate files');
        throw error;
    }
}

export const generateCommand = new Command('generate')
    .alias('g')
    .description('Generate CRUD routes and repository from entity')
    .argument('<entity>', 'Entity name or path to entity file (e.g., "users" or "src/server/entities/users.ts")')
    .option('-f, --force', 'Overwrite existing files without confirmation')
    .option('-i, --interactive', 'Prompt before overwriting each file')
    .option('--only <files>', 'Only generate specific files (comma-separated: contract,repository,routes)')
    .option('--dry-run', 'Show what would be generated without creating files')
    .action(async (entityArg: string, options: GenerateOptions) => {
        const cwd = process.cwd();

        // Check if SPFN is initialized
        if (!existsSync(join(cwd, 'src', 'server'))) {
            logger.error('SPFN not initialized. Run `spfn init` first.');
            process.exit(1);
        }

        // Resolve entity name
        let entityName: string;
        let entityPath: string | null = null;
        let entityExists = false;

        // Check if entityArg is a file path
        if (entityArg.includes('/') || entityArg.endsWith('.ts')) {
            entityPath = entityArg.startsWith('/') ? entityArg : join(cwd, entityArg);

            if (!existsSync(entityPath)) {
                logger.error(`Entity file not found: ${entityPath}`);
                process.exit(1);
            }

            // Extract entity name from file
            const extractedName = extractEntityName(entityPath);
            if (!extractedName) {
                logger.error('Could not extract entity name from file. Make sure it exports a pgTable.');
                process.exit(1);
            }

            entityName = extractedName;
            entityExists = true;
            logger.info(`Detected entity: ${chalk.cyan(entityName)}`);
        } else {
            // Entity name provided directly
            entityName = entityArg;

            // Try to find entity file
            const possiblePath = join(cwd, 'src', 'server', 'entities', `${entityName}.ts`);
            if (existsSync(possiblePath)) {
                entityPath = possiblePath;
                entityExists = true;
                logger.info(`Found entity file: ${chalk.cyan(relative(cwd, entityPath))}`);
            } else {
                logger.info(`Creating new entity: ${chalk.cyan(entityName)}`);
            }
        }

        // Generate variables
        const variables = generateVariables(entityName);

        // Find templates directory
        const templatesDir = findScriptTemplatesPath();

        // Plan operations
        const operations = planFileOperations(cwd, entityName, templatesDir, variables, options, entityExists);

        if (operations.length === 0) {
            logger.warn('No files to generate. Check your --only filter or templates directory.');
            process.exit(0);
        }

        // Execute operations
        await executeOperations(operations, options);

        // Success message
        if (!options.dryRun) {
            console.log('\n' + chalk.green.bold('✓ CRUD boilerplate generated successfully!\n'));
            console.log('Generated files:');
            operations.forEach(op => {
                console.log('  • ' + chalk.cyan(relative(cwd, op.path)));
            });

            if (!entityExists) {
                console.log('\n' + chalk.yellow('📝 Next steps:'));
                console.log('  1. ' + chalk.cyan(`Edit entities/${entityName}.ts`) + ' - Add your custom fields');
                console.log('  2. ' + chalk.cyan('spfn db generate') + ' - Generate database migration');
                console.log('  3. ' + chalk.cyan('spfn db migrate') + ' - Run migration');
                console.log('  4. Customize routes and test your API');
            } else {
                console.log('\n' + chalk.yellow('📝 Next steps:'));
                console.log('  1. Review and customize the generated routes');
                console.log('  2. Update repository with custom query methods if needed');
                console.log('  3. Test your API endpoints');
            }
        }
    });