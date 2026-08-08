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
} from '../../utils/ops/client.js';
import { renderCommandUsage } from '../../utils/ops/describe.js';
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

async function listCommands(options: OpsTargetOptions): Promise<void>
{
    const appUrl = resolveAppUrl(options);
    const token = await resolveToken(options, appUrl);
    const manifest = await fetchOpsManifest(appUrl, token);

    if (manifest.commands.length === 0)
    {
        console.log(chalk.yellow('The app exposes no ops commands.'));

        return;
    }

    console.log(chalk.bold(`Ops commands at ${appUrl}:\n`));
    for (const command of manifest.commands)
    {
        console.log(`  ${chalk.cyan(command.name)}  ${chalk.gray(`${command.method} ${command.path}`)}  input: ${inputSummary(command)}`);
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
    },
): Promise<void>
{
    const appUrl = resolveAppUrl(options);
    const token = await resolveToken(options, appUrl);
    const manifest = await fetchOpsManifest(appUrl, token);

    const command = manifest.commands.find(c => c.name === name);
    if (!command)
    {
        console.error(chalk.red(`❌ Unknown ops command "${name}".`));
        console.error(chalk.gray(`   Known: ${manifest.commands.map(c => c.name).join(', ') || '(none)'}`));
        process.exit(1);
    }

    if (options.describe)
    {
        console.log(options.json ? JSON.stringify(command, null, 2) : renderCommandUsage(command));

        return;
    }

    let body: unknown;
    if (options.data !== undefined)
    {
        if (command.method === 'GET')
        {
            // fetch throws a raw TypeError on a GET with a body; say which
            // flag was wrong instead of printing a stack trace.
            console.error(chalk.red(`❌ "${name}" is a ${command.method} command and takes no request body.`));
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

    console.error(chalk.red(`❌ ${command.method} ${command.path} answered ${response.status}`));
    console.error(rendered);
    process.exit(1);
}

export const opsCommand = new Command('ops')
    .description("Invoke the app's ops surface (discovered from /_ops/_manifest)");

opsCommand.command('list')
    .description('List the ops commands the app exposes')
    .option('--app <url>', 'app URL (or SPFN_OPS_APP)')
    .option('--token <token>', 'ops token (or SPFN_OPS_TOKEN, or keychain)')
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
    .action(callCommand)
    // What a command takes is known only to the running app, so it cannot be
    // part of this static help — point at the flag that fetches it.
    .addHelpText('after', '\nA command\'s own inputs: spfn ops call <name> --describe');

opsCommand.addCommand(buildTokenCommand());
