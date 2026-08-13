/**
 * `spfn cloud` — free-tier management for course deployments on the student's own
 * Vercel Hobby + Supabase Free accounts: link, limits, usage, status, keepalive,
 * and env sync. Tokens and key values live in the OS keychain and never appear in
 * command output.
 */

import { Command } from 'commander';
import { cloudLink } from './link.js';
import { cloudLimits } from './limits.js';
import { cloudUsage } from './usage.js';
import { cloudStatus } from './status.js';
import { cloudKeepalive } from './keepalive.js';
import { cloudEnvPull, cloudEnvPush } from './env.js';

export const cloudCommand = new Command('cloud')
    .description('Manage the free-tier cloud accounts this app deploys to (Vercel + Supabase)');

cloudCommand
    .command('link')
    .description('Connect your Vercel and Supabase accounts (tokens go to the OS keychain)')
    .option('--vercel-project <nameOrId>', 'Pick the Vercel project without prompting')
    .option('--supabase-project <refOrName>', 'Pick the Supabase project without prompting')
    .action(cloudLink);

cloudCommand
    .command('limits')
    .description('Show the free-plan limits (Vercel Hobby, Supabase Free)')
    .action(cloudLimits);

cloudCommand
    .command('usage')
    .description('Show current usage from the provider APIs')
    .action(cloudUsage);

cloudCommand
    .command('status')
    .description('Usage measured against the free-plan limits, with warnings from 80%')
    .action(cloudStatus);

cloudCommand
    .command('keepalive')
    .description('Keep the Supabase project from pausing (daily health-check cron)')
    .option('--path <path>', 'Health endpoint path the cron should hit')
    .option('--github-actions', 'Generate a GitHub Actions workflow instead of a Vercel cron')
    .option('--url <url>', 'Deployed app URL (required with --github-actions)')
    .action(cloudKeepalive);

const envGroup = cloudCommand
    .command('env')
    .description('Sync env vars and API keys between the providers and this app');

envGroup
    .command('pull')
    .description('Fetch Supabase keys into .env.local / the keychain (values never displayed)')
    .option('--db-url', 'Also compose DATABASE_URL (prompts for the database password)')
    .action(cloudEnvPull);

envGroup
    .command('push')
    .description('Push local env values to the Vercel project env by key name')
    .argument('[keys...]', 'Env var names to push (values resolve locally)')
    .action(cloudEnvPush);
