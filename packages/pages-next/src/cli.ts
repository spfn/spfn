#!/usr/bin/env node
import { syncSite, type SyncOptions } from './sync';

async function main(): Promise<void>
{
    const [command, ...rest] = process.argv.slice(2);
    if (command !== 'sync')
    {
        console.error('Usage: spfn-pages sync [--root <repo-root>] [--out <public-dir>]');
        process.exit(command ? 1 : 0);
    }

    const result = await syncSite(parseArgs(rest));

    for (const problem of result.problems)
    {
        console.warn(`warn: ${problem.path} — ${problem.message}`);
    }
    const stale = result.removedStale > 0 ? `, removed ${result.removedStale} stale output(s)` : '';
    const seo = result.seoFiles > 0 ? `, ${result.seoFiles} seo file(s)` : '';
    console.log(`synced ${result.htmlPages} html page(s), theme.css${result.copiedAssets ? ', site public/ assets' : ' (site has no public/ dir)'}${seo}${stale}`);
}

function parseArgs(argv: string[]): SyncOptions
{
    const args: SyncOptions = { root: '.', out: 'public' };

    for (let i = 0; i < argv.length; i += 2)
    {
        if (argv[i] === '--root' && argv[i + 1])
        {
            args.root = argv[i + 1];
        }
        else if (argv[i] === '--out' && argv[i + 1])
        {
            args.out = argv[i + 1];
        }
        else
        {
            console.error(`Unknown argument: ${argv[i]}`);
            process.exit(1);
        }
    }

    return args;
}

main().catch((error: Error) =>
{
    console.error(`spfn-pages: ${error.message}`);
    process.exit(1);
});
