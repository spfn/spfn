/**
 * `spfn ops` - invoke an app's ops surface from the terminal
 *
 * Commands are discovered from the running app's `GET /_ops/_manifest`
 * (served by `createOpsRouter`), so the CLI needs neither the app's source
 * nor a generated artifact. The app develops its own ops routes; this
 * command is only the transport.
 *
 *   spfn ops list --app https://api.example.com
 *   spfn ops call listSignups --app https://api.example.com --query limit=50
 *   spfn ops token issue --name laptop --scopes 'waitlist:read'
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
    fetchOpsManifest,
    invokeOpsCommand,
    type OpsCommandDescriptor,
    type OpsManifest,
    type OpsModuleDescriptor,
} from '../../utils/ops/client.js';
import { plain, renderCommandUsage } from '../../utils/ops/describe.js';
import { collectKeyValue, resolveAppUrl, resolveToken, type OpsTargetOptions } from './resolve.js';
import { buildTokenCommand } from './token.js';

function inputSummary(command: OpsCommandDescriptor): string
{
    const sections: string[] = [];
    if (command.input.params)
    {
        sections.push('params');
    }
    if (command.input.query)
    {
        sections.push('query');
    }
    if (command.input.body)
    {
        sections.push('body');
    }

    return sections.length > 0 ? sections.join('+') : '-';
}

interface OpsListOptions extends OpsTargetOptions
{
    module?: string;
    json?: boolean;
}

interface OpsModulesOptions extends OpsTargetOptions
{
    json?: boolean;
}

interface OpsModuleView extends OpsModuleDescriptor
{
    commandCount: number;
    effects: string[];
}

function moduleViews(manifest: OpsManifest): OpsModuleView[]
{
    return (manifest.modules ?? []).map(module =>
    {
        const commands = manifest.commands.filter(command => command.module === module.id);

        return {
            ...module,
            commandCount: commands.length,
            effects: [...new Set(commands.map(command => command.effect).filter(Boolean) as string[])].sort(),
        };
    });
}

async function listModules(options: OpsModulesOptions): Promise<void>
{
    const appUrl = resolveAppUrl(options);
    const token = await resolveToken(options, appUrl);
    const modules = moduleViews(await fetchOpsManifest(appUrl, token));

    if (options.json)
    {
        console.log(JSON.stringify(modules, null, 2));

        return;
    }
    if (modules.length === 0)
    {
        console.log(chalk.yellow('The app exposes no capability ops modules.'));

        return;
    }

    console.log(chalk.bold(`Ops modules at ${appUrl}:\n`));
    for (const module of modules)
    {
        const effects = module.effects.length > 0 ? module.effects.join(',') : '-';
        console.log(
            `  ${chalk.cyan(plain(module.id))}  ${chalk.gray(plain(module.source))}`
            + `  contract: ${plain(module.contractVersion)}  commands: ${module.commandCount}  effects: ${effects}`,
        );
        console.log(chalk.gray(`    ${plain(module.summary)}`));
    }
}

async function listCommands(options: OpsListOptions): Promise<void>
{
    const appUrl = resolveAppUrl(options);
    const token = await resolveToken(options, appUrl);
    const manifest = await fetchOpsManifest(appUrl, token);
    const commands = options.module
        ? manifest.commands.filter(command => command.module === options.module)
        : manifest.commands;

    if (options.module && !(manifest.modules ?? []).some(module => module.id === options.module))
    {
        console.error(chalk.red(`❌ Unknown ops module "${plain(options.module)}".`));
        console.error(chalk.gray(
            `   Known: ${(manifest.modules ?? []).map(module => plain(module.id)).join(', ') || '(none)'}`,
        ));
        process.exit(1);
    }

    if (options.json)
    {
        console.log(JSON.stringify(commands, null, 2));

        return;
    }

    if (commands.length === 0)
    {
        console.log(chalk.yellow(options.module
            ? `The "${plain(options.module)}" module exposes no ops commands.`
            : 'The app exposes no ops commands.'));

        return;
    }

    console.log(chalk.bold(`Ops commands at ${appUrl}:\n`));
    for (const command of commands)
    {
        const effect = command.effect ? `  effect: ${command.effect}` : '';
        console.log(
            `  ${chalk.cyan(plain(command.name))}  ${chalk.gray(`${command.method} ${plain(command.path)}`)}`
            + `  input: ${inputSummary(command)}${effect}`,
        );
        if (command.summary)
        {
            console.log(chalk.gray(`    ${plain(command.summary)}`));
        }
    }
    console.log(chalk.gray('\n💡 Invoke: spfn ops call <name> [--param k=v] [--query k=v] [--data \'{"..."}\']'));
    console.log(chalk.gray('   Usage of one: spfn ops call <name> --describe'));
}

async function callCommand(
    name: string,
    options: OpsTargetOptions & {
        param: Record<string, string>;
        query: Record<string, string>;
        data?: string;
        describe?: boolean;
        json?: boolean;
        yes?: boolean;
    },
): Promise<void>
{
    const appUrl = resolveAppUrl(options);
    const token = await resolveToken(options, appUrl);
    const manifest = await fetchOpsManifest(appUrl, token);

    const command = manifest.commands.find(c => c.name === name);
    if (!command)
    {
        console.error(chalk.red(`❌ Unknown ops command "${plain(name)}".`));
        console.error(chalk.gray(`   Known: ${manifest.commands.map(c => plain(c.name)).join(', ') || '(none)'}`));
        process.exit(1);
    }

    if (options.describe)
    {
        console.log(options.json ? JSON.stringify(command, null, 2) : renderCommandUsage(command));

        return;
    }

    if (destructiveConfirmationRequired(command, options.yes))
    {
        console.error(chalk.red(`❌ "${plain(name)}" is destructive and was not called with --yes.`));
        console.error(chalk.gray(`   Review it first: spfn ops call ${plain(name)} --describe`));
        process.exit(1);
    }

    let body: unknown;
    if (options.data !== undefined)
    {
        if (command.method === 'GET')
        {
            // fetch throws a raw TypeError on a GET with a body; say which
            // flag was wrong instead of printing a stack trace.
            console.error(chalk.red(`❌ "${plain(name)}" is a ${command.method} command and takes no request body.`));
            console.error(chalk.gray('   Pass its input with --query k=v (or --param k=v for path segments).'));
            process.exit(1);
        }

        try
        {
            body = JSON.parse(options.data);
        }
        catch
        {
            console.error(chalk.red('❌ --data is not valid JSON.'));
            process.exit(1);
        }
    }

    const response = await invokeOpsCommand(appUrl, token, command, {
        params: options.param,
        query: options.query,
        body,
    });

    const rendered = typeof response.body === 'string'
        ? response.body
        : JSON.stringify(response.body, null, 2);

    if (response.status >= 200 && response.status < 300)
    {
        console.log(rendered);

        return;
    }

    console.error(chalk.red(`❌ ${command.method} ${plain(command.path)} answered ${response.status}`));
    console.error(rendered);
    process.exit(1);
}

export function destructiveConfirmationRequired(
    command: OpsCommandDescriptor,
    confirmed: boolean | undefined,
): boolean
{
    return command.effect === 'destructive' && confirmed !== true;
}

export const opsCommand = new Command('ops')
    .description("Invoke the app's ops surface (discovered from /_ops/_manifest)");

opsCommand.command('modules')
    .description('List explicitly mounted capability ops modules')
    .option('--app <url>', 'app URL (or SPFN_OPS_APP)')
    .option('--token <token>', 'ops token (or SPFN_OPS_TOKEN, or keychain)')
    .option('--json', 'print machine-readable JSON')
    .action(listModules);

opsCommand.command('list')
    .description('List the ops commands the app exposes')
    .option('--app <url>', 'app URL (or SPFN_OPS_APP)')
    .option('--token <token>', 'ops token (or SPFN_OPS_TOKEN, or keychain)')
    .option('--module <id>', 'show commands from one capability module')
    .option('--json', 'print machine-readable JSON')
    .action(listCommands);

opsCommand.command('call <name>')
    .description('Invoke one ops command')
    .option('--app <url>', 'app URL (or SPFN_OPS_APP)')
    .option('--token <token>', 'ops token (or SPFN_OPS_TOKEN, or keychain)')
    .option('--param <k=v>', 'path parameter (repeatable)', collectKeyValue, {})
    .option('--query <k=v>', 'query parameter (repeatable)', collectKeyValue, {})
    .option('--data <json>', 'JSON request body')
    .option('--describe', "print the command's usage instead of calling it")
    .option('--json', 'with --describe, print the raw JSON Schema')
    .option('--yes', 'confirm an effect=destructive command')
    .action(callCommand)
    // What a command takes is known only to the running app, so it cannot be
    // part of this static help — point at the flag that fetches it.
    .addHelpText('after', '\nA command\'s own inputs: spfn ops call <name> --describe');

opsCommand.addCommand(buildTokenCommand());
