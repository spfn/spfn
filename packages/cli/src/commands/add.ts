/**
 * Add SPFN Ecosystem Packages
 *
 * Installs and sets up SPFN packages with database migrations
 */

import { Command } from 'commander'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import chalk from 'chalk'
import ora from 'ora'

const execAsync = promisify(exec)

/**
 * Add and set up an SPFN ecosystem package
 */
async function addPackage(packageName: string): Promise<void>
{
    // Validate package name format
    if (!packageName.includes('/'))
    {
        console.error(chalk.red('❌ Please specify full package name'))
        console.log(chalk.yellow('\n💡 Examples:'))
        console.log(chalk.gray('  pnpm spfn add @spfn/cms'))
        console.log(chalk.gray('  pnpm spfn add @mycompany/spfn-analytics'))
        process.exit(1)
    }

    console.log(chalk.blue(`\n📦 Setting up ${packageName}...\n`))

    try
    {
        // Step 1: Check if package is already installed (for local development)
        const pkgPath = join(process.cwd(), 'node_modules', ...packageName.split('/'))
        const pkgJsonPath = join(pkgPath, 'package.json')

        if (!existsSync(pkgJsonPath))
        {
            // Package not installed, try to install from npm
            const installSpinner = ora('Installing package...').start()

            try
            {
                await execAsync(`pnpm add ${packageName}`)
                installSpinner.succeed('Package installed')
            }
            catch (error)
            {
                installSpinner.fail('Failed to install package')
                throw error
            }
        }
        else
        {
            console.log(chalk.gray('✓ Package already installed (using local version)\n'))
        }

        // Step 2: Check if package has schemas
        if (!existsSync(pkgJsonPath))
        {
            throw new Error(`Package ${packageName} not found after installation`)
        }

        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))

        // Step 3: Set up database if package has migrations
        if (pkgJson.spfn?.migrations)
        {
            console.log(chalk.blue(`\n🗄️  Setting up database for ${packageName}...\n`))

            // Load environment first
            const { loadEnvironment } = await import('@spfn/core/env')
            loadEnvironment({ debug: false })

            if (!process.env.DATABASE_URL)
            {
                console.log(chalk.yellow('⚠️  DATABASE_URL not found'))
                console.log(chalk.gray('Skipping database setup. Run migrations manually when ready:\n'))
                console.log(chalk.gray(`  pnpm spfn db push\n`))
            }
            else
            {
                // Apply pre-generated function migrations
                const { discoverFunctionMigrations, executeFunctionMigrations } =
                    await import('../utils/function-migrations.js')

                const functions = discoverFunctionMigrations(process.cwd())
                const targetFunction = functions.find(f => f.packageName === packageName)

                if (targetFunction)
                {
                    const spinner = ora('Applying migrations...').start()
                    try
                    {
                        await executeFunctionMigrations([targetFunction])
                        spinner.succeed('Migrations applied')
                    }
                    catch (error)
                    {
                        spinner.fail('Failed to apply migrations')
                        throw error
                    }
                }
                else
                {
                    console.log(chalk.gray('ℹ️  No migrations found for this package'))
                }
            }
        }
        else
        {
            console.log(chalk.gray('\nℹ️  No database migrations to apply'))
        }

        // Step 4: Show success message and setup guide
        console.log(chalk.green(`\n✅ ${packageName} installed successfully!\n`))

        // Show package-specific setup message if available
        if (pkgJson.spfn?.setupMessage)
        {
            console.log(chalk.cyan('📚 Setup Guide:'))
            console.log(pkgJson.spfn.setupMessage)
            console.log()
        }
    }
    catch (error)
    {
        console.error(chalk.red(`\n❌ Failed to install ${packageName}\n`))
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'))
        process.exit(1)
    }
}

/**
 * Add command group
 */
export const addCommand = new Command('add')
    .description('Install and set up SPFN ecosystem packages')
    .argument('<package>', 'Package name (e.g., @spfn/cms, @mycompany/spfn-analytics)')
    .action(addPackage)