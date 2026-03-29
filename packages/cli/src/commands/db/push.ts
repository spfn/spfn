import chalk from 'chalk';
import prompts from 'prompts';
import '@spfn/core/config';
import { loadEnv } from '@spfn/core/server';
import { sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { validateDatabasePrerequisites, loadSchemaImports, createPushConnection } from './utils/drizzle.js';
import { classifyStatements } from './utils/sql-classifier.js';
import { displayClassifiedStatements, displayDryRunSummary, displayApplySummary } from './utils/push-display.js';

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

    // 4. Create DB connection
    const { db, close } = await createPushConnection();

    try
    {
        // 5. Compute diff via pushSchema (does NOT apply yet)
        const { pushSchema } = await import('drizzle-kit/api');
        const { statementsToExecute } = await pushSchema(
            imports,
            db,
            schemaFilter,
        );

        // 5.5 Patch drizzle-kit statement bugs:
        //     - CREATE SCHEMA without IF NOT EXISTS → fails on existing schemas
        //     - DROP SCHEMA for schemas we actively manage → false positive
        const managedSchemaSet = new Set(schemaFilter);
        const statements = statementsToExecute
            .filter(s =>
            {
                const dropMatch = s.match(/^\s*DROP\s+SCHEMA\s+"?([^"\s;]+)"?/i);
                if (dropMatch && managedSchemaSet.has(dropMatch[1]))
                {
                    console.log(chalk.dim(`  [skip] DROP SCHEMA "${dropMatch[1]}" — managed schema, ignoring`));
                    return false;
                }
                return true;
            })
            .map(s =>
                s.replace(/^CREATE SCHEMA(?!\s+IF\s+NOT\s+EXISTS)/i, 'CREATE SCHEMA IF NOT EXISTS')
            );

        // 6. Empty diff?
        if (statements.length === 0)
        {
            console.log(chalk.green('✅ No changes detected — database is up to date\n'));
            await applyFunctionMigrations();
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
            for (const stmt of statements)
            {
                await db.execute(sql.raw(stmt));
            }
            displayApplySummary(statements.length, 0);
        }
        else if (result.destructive.length === 0)
        {
            // No destructive changes — safe to apply all
            for (const stmt of statements)
            {
                await db.execute(sql.raw(stmt));
            }
            displayApplySummary(statements.length, 0);
        }
        else
        {
            // Has destructive changes — apply safe+warning individually, prompt for destructive
            const safeCount = result.safe.length + result.warning.length;

            if (safeCount > 0)
            {
                for (const stmt of [...result.safe, ...result.warning])
                {
                    await db.execute(sql.raw(stmt.sql));
                }
                console.log(chalk.green(`\n✅ Applied ${safeCount} safe statement(s)`));
            }

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
                for (const stmt of result.destructive)
                {
                    await db.execute(sql.raw(stmt.sql));
                }
                displayApplySummary(statements.length, 0);
            }
            else
            {
                displayApplySummary(safeCount, result.destructive.length);
                console.log(chalk.dim('Tip: Use --force to apply all changes without prompting.\n'));
            }
        }

        // 11. Function package migrations
        await applyFunctionMigrations();
    }
    finally
    {
        await close();
    }
}

/**
 * Discover and run function package migrations (e.g., @spfn/cms)
 */
async function applyFunctionMigrations(): Promise<void>
{
    const { discoverFunctionMigrations, executeFunctionMigrations } = await import('../../utils/function-migrations.js');
    const functions = discoverFunctionMigrations(process.cwd());

    if (functions.length === 0)
    {
        return;
    }

    console.log(chalk.blue('\n📦 Applying function package migrations:'));
    functions.forEach(func =>
    {
        console.log(chalk.dim(`  - ${func.packageName}`));
    });

    try
    {
        await executeFunctionMigrations(functions);
        console.log(chalk.green('\n✅ All function migrations applied\n'));
    }
    catch (error)
    {
        console.error(chalk.red('\n❌ Failed to apply function migrations'));
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}
