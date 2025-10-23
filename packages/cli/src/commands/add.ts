/**
 * Add SPFN Ecosystem Packages
 *
 * Installs and sets up SPFN packages with database migrations
 */

import { Command } from 'commander'
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs'
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

        // Step 3: Set up database if package has schemas
        if (pkgJson.spfn?.schemas)
        {
            console.log(chalk.blue(`\n🗄️  Setting up database for ${packageName}...\n`))

            // Load environment first
            const { loadEnvironment } = await import('@spfn/core/env')
            loadEnvironment({ debug: false })

            if (!process.env.DATABASE_URL)
            {
                console.log(chalk.yellow('⚠️  DATABASE_URL not found'))
                console.log(chalk.gray('Skipping database setup. Run migrations manually when ready:\n'))
                console.log(chalk.gray(`  pnpm spfn db generate`))
                console.log(chalk.gray(`  pnpm spfn db migrate\n`))
            }
            else
            {
                const tempConfigPath = `./drizzle.config.${Date.now()}.temp.ts`

                try
                {
                    // Generate temporary config for this package only
                    const { generateDrizzleConfigFile } = await import('@spfn/core')
                    const configContent = generateDrizzleConfigFile({
                        cwd: process.cwd(),
                        packageFilter: packageName
                    })

                    writeFileSync(tempConfigPath, configContent)

                    // Generate migration
                    const generateSpinner = ora('Generating migration...').start()
                    try
                    {
                        const { stdout: generateOutput } = await execAsync(
                            `drizzle-kit generate --config=${tempConfigPath}`
                        )
                        generateSpinner.succeed('Migration generated')

                        // Show table info from output
                        if (generateOutput.includes('tables'))
                        {
                            const lines = generateOutput.split('\n')
                            const tableLines = lines.filter(line =>
                                line.trim() && !line.includes('Reading') && !line.includes('Your SQL')
                            )
                            if (tableLines.length > 0)
                            {
                                console.log(chalk.dim('\n' + tableLines.slice(0, -1).join('\n') + '\n'))
                            }
                        }
                    }
                    catch (error)
                    {
                        generateSpinner.fail('Failed to generate migration')
                        throw error
                    }

                    // Run migration
                    const migrateSpinner = ora('Running migration...').start()
                    try
                    {
                        await execAsync(`drizzle-kit migrate --config=${tempConfigPath}`)
                        migrateSpinner.succeed('Migration applied')
                    }
                    catch (error)
                    {
                        // Check if it's just "table already exists" error
                        const errorMessage = error instanceof Error ? error.message : String(error)
                        if (errorMessage.includes('already exists'))
                        {
                            migrateSpinner.warn('Tables already exist (skipped)')
                        }
                        else
                        {
                            migrateSpinner.fail('Failed to run migration')
                            throw error
                        }
                    }
                }
                finally
                {
                    // Clean up temp config
                    if (existsSync(tempConfigPath))
                    {
                        unlinkSync(tempConfigPath)
                    }
                }
            }
        }
        else
        {
            console.log(chalk.gray('\nℹ️  No database schemas to set up'))
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