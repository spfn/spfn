import chalk from 'chalk';
import prompts from 'prompts';
import '@spfn/core/config';
import { loadEnv } from '@spfn/core/server';
import { sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { validateDatabasePrerequisites, loadSchemaImports, createPushConnection } from './utils/drizzle.js';
import { classifyStatements } from './utils/sql-classifier.js';
import { displayClassifiedStatements, displayDryRunSummary, displayApplySummary } from './utils/push-display.js';
import {
    discoverFunctionMigrations,
    loadFunctionMigrationPlans,
    executeFunctionMigrations,
    type FunctionMigrationPlan,
} from '../../utils/function-migrations.js';

export interface PushHint
{
    hint: string;
    statement?: string;
}

export interface PushPlan
{
    statements: string[];
    hints: PushHint[];
}

export async function resolvePushPlan(
    imports: Record<string, unknown>,
    db: Awaited<ReturnType<typeof createPushConnection>>['db'],
    schemaFilter: string[],
): Promise<PushPlan>
{
    const { pushSchema } = await import('drizzle-kit/api-postgres');
    const { sqlStatements, hints } = await pushSchema(
        imports,
        db,
        {
            schemas: schemaFilter,
            tables: [],
            entities: undefined,
            extensions: [],
        },
    );
    const pushHints = hints as PushHint[];
    const hintStatements = pushHints.flatMap(hint => hint.statement ? [hint.statement] : []);

    return {
        statements: [...hintStatements, ...sqlStatements],
        hints: pushHints,
    };
}

export async function applyStatements(
    db: Awaited<ReturnType<typeof createPushConnection>>['db'],
    statements: string[],
): Promise<void>
{
    await db.transaction(async (tx: typeof db) =>
    {
        for (const statement of statements)
        {
            await tx.execute(sql.raw(statement));
        }
    });
}

/**
 * Push schema changes to database with safe-mode protection.
 *
 * - Default: auto-applies safe + warning, prompts for destructive
 * - --force: applies everything without prompting
 * - --dry-run: shows classified SQL without applying
 */
export async function dbPush(options: { force?: boolean; dryRun?: boolean } = {}): Promise<void>
{
    // 1. Prerequisites
    validateDatabasePrerequisites();
    loadEnv();

    // 2. Get drizzle config (schema file list + schemaFilter)
    const { getDrizzleConfig } = await import('@spfn/core/db');
    const config = getDrizzleConfig({
        cwd: process.cwd(),
        expandGlobs: true,
        autoDetectSchemas: true,
        disablePackageDiscovery: true,
    });

    const schemaFiles = Array.isArray(config.schema) ? config.schema : [config.schema];

    if (schemaFiles.length === 0)
    {
        console.log(chalk.yellow('No schema files found.'));

        return;
    }

    console.log(chalk.dim(`Found ${schemaFiles.length} schema file(s)\n`));

    // 3. Load schema imports
    const imports = await loadSchemaImports(schemaFiles);

    // 3.5 Detect schemas from loaded table objects.
    //     config.schemaFilter misses schemas from re-exported packages
    //     (e.g., @spfn/ai entities re-exported in consumer project).
    const detectedSchemas = new Set<string>(config.schemaFilter ?? ['public']);
    for (const value of Object.values(imports))
    {
        try
        {
            const cfg = getTableConfig(value as any);
            if (cfg.schema)
            {
                detectedSchemas.add(cfg.schema);
            }
        }
        catch
        {
            // Not a drizzle table — skip
        }
    }
    const schemaFilter = Array.from(detectedSchemas);

    // 3.7 Preflight: parse function package migrations before touching the DB,
    //     so an incompatible package fails without applying the project schema.
    const functionPlans = loadFunctionPlansOrExit();

    // 4. Create DB connection
    const { db, close } = await createPushConnection();

    try
    {
        // 5. Compute diff via pushSchema (does NOT apply yet)
        const { statements, hints } = await resolvePushPlan(imports, db, schemaFilter);

        for (const hint of hints)
        {
            console.log(chalk.yellow(`⚠️  ${hint.hint}`));
        }

        // 6. Empty diff?
        if (statements.length === 0)
        {
            console.log(chalk.green('✅ No changes detected — database is up to date\n'));
            await applyFunctionMigrations(functionPlans);

            return;
        }

        // 7. Classify
        const result = classifyStatements(statements);

        // 8. Dry-run mode
        if (options.dryRun)
        {
            displayDryRunSummary(result);

            return;
        }

        // 9. Display what we found
        displayClassifiedStatements(result);

        // 10. Apply logic
        if (options.force)
        {
            // --force: apply everything
            console.log(chalk.dim('\n--force: applying all changes...'));
            await applyStatements(db, statements);
            displayApplySummary(statements.length, 0);
        }
        else if (result.destructive.length === 0)
        {
            // No destructive changes — safe to apply all
            await applyStatements(db, statements);
            displayApplySummary(statements.length, 0);
        }
        else
        {
            // Has destructive changes — prompt before applying anything so the
            // selected plan can run atomically in one transaction.
            const destructiveSet = new Set(result.destructive.map(s => s.sql));
            const nonDestructive = statements.filter(s => !destructiveSet.has(s));

            // Prompt for destructive
            console.log(chalk.red(`\n❌ ${result.destructive.length} destructive change(s) require confirmation:`));
            for (const stmt of result.destructive)
            {
                console.log(chalk.red(`   ${stmt.sql.replace(/\s+/g, ' ').trim()}`));
                console.log(chalk.dim(`   → ${stmt.reason}`));
            }

            const { confirm } = await prompts({
                type: 'confirm',
                name: 'confirm',
                message: 'Apply destructive changes?',
                initial: false,
            });

            if (confirm)
            {
                await applyStatements(db, statements);
                displayApplySummary(statements.length, 0);
            }
            else
            {
                if (nonDestructive.length > 0)
                {
                    await applyStatements(db, nonDestructive);
                }
                displayApplySummary(nonDestructive.length, result.destructive.length);
                console.log(chalk.dim('Tip: Use --force to apply all changes without prompting.\n'));
            }
        }

        // 11. Function package migrations
        await applyFunctionMigrations(functionPlans);
    }
    finally
    {
        await close();
    }
}

/**
 * Discover function packages and parse their migration folders.
 * Exits before any DB work when a package ships unreadable migrations.
 */
function loadFunctionPlansOrExit(): FunctionMigrationPlan[]
{
    const functions = discoverFunctionMigrations(process.cwd());

    try
    {
        return loadFunctionMigrationPlans(functions);
    }
    catch (error)
    {
        console.error(chalk.red('\n❌ Invalid function package migrations — nothing was applied'));
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}

/**
 * Run function package migrations (e.g., @spfn/cms)
 */
async function applyFunctionMigrations(plans: FunctionMigrationPlan[]): Promise<void>
{
    if (plans.length === 0)
    {
        return;
    }

    console.log(chalk.blue('\n📦 Applying function package migrations:'));
    plans.forEach(plan =>
    {
        console.log(chalk.dim(`  - ${plan.packageName}`));
    });

    try
    {
        await executeFunctionMigrations(plans);
        console.log(chalk.green('\n✅ All function migrations applied\n'));
    }
    catch (error)
    {
        console.error(chalk.red('\n❌ Failed to apply function package migrations'));
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        console.error(chalk.yellow('Project schema changes (if any) were already applied — only function package migrations failed.'));
        process.exit(1);
    }
}
