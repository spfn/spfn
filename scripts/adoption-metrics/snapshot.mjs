#!/usr/bin/env node
// Adoption-metrics snapshot: fetches every external adoption signal the project
// tracks and appends one dated row to snapshots.jsonl, then prints the latest
// rows side by side so a weekly review is one command.
//
//   node scripts/adoption-metrics/snapshot.mjs            fetch, append, show
//   node scripts/adoption-metrics/snapshot.mjs --dry      fetch and show, no append
//   node scripts/adoption-metrics/snapshot.mjs --view     show the record only
//
// Signals PostHog and Search Console cannot be fetched without credentials;
// enter them by hand when known:
//
//   --posthog <n>            LLM-referral visits since the last snapshot
//   --gsc-impressions <n>    Search Console impressions
//   --gsc-clicks <n>         Search Console clicks
//   --probe cited|not-cited|not-run   latest citation-probe reading
//
// The record is append-only: a bad row is corrected by appending a new row.

import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RECORD = join(HERE, 'snapshots.jsonl');
const REPO = 'fxylabs/spfn';
// Accounts that belong to the project. GitHub's author_association alone cannot
// tell them apart: the maintainer authors from a personal account whose
// association is only CONTRIBUTOR, so it must be named here explicitly.
const INTERNAL_USERS = new Set(['tonite31']);

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const argOf = (name) =>
{
    const i = args.indexOf(name);
    return i === -1 ? null : args[i + 1];
};

async function getJson(url)
{
    const res = await fetch(url, { headers: { 'User-Agent': 'spfn-adoption-metrics' } });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
}

function packageNames()
{
    const pkgsDir = join(HERE, '..', '..', 'packages');
    return readdirSync(pkgsDir)
        .map((d) => join(pkgsDir, d, 'package.json'))
        .filter((p) => existsSync(p))
        .map((p) => JSON.parse(readFileSync(p, 'utf8')))
        .filter((pkg) => !pkg.private)
        .map((pkg) => pkg.name);
}

async function fetchGithub()
{
    const repo = await getJson(`https://api.github.com/repos/${REPO}`);
    const issues = await getJson(`https://api.github.com/repos/${REPO}/issues?state=all&per_page=100`);
    const internalAssoc = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
    const external = issues.filter((i) => !internalAssoc.has(i.author_association) && !INTERNAL_USERS.has(i.user.login));
    return {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        watchers: repo.subscribers_count,
        externalIssues: external.filter((i) => !i.pull_request).length,
        externalPRs: external.filter((i) => i.pull_request).length,
    };
}

async function fetchNpm(names)
{
    const downloads = {};
    for (const name of names)
    {
        const encoded = name.replace('/', '%2F');
        const d = await getJson(`https://api.npmjs.org/downloads/point/last-week/${encoded}`)
            .catch(() => ({ downloads: null }));
        downloads[name] = d.downloads ?? 0;
    }
    return downloads;
}

// PostHog: one project (513406) receives events from several products, so the
// host filter is what scopes the count to superfunction.xyz. The personal API
// key (query:read only) lives in the macOS keychain; its value never reaches
// stdout. Missing key or a failed query degrades to null, and the --posthog
// flag still overrides.
const POSTHOG_PROJECT = 513406;
const LLM_DOMAINS = "'chatgpt.com','chat.openai.com','perplexity.ai','www.perplexity.ai','claude.ai','gemini.google.com','copilot.microsoft.com'";

async function fetchPosthogLlmReferrals()
{
    let key;
    try
    {
        key = execFileSync('security', ['find-generic-password', '-s', 'posthog', '-a', 'personal-api-key', '-w'],
            { encoding: 'utf8' }).trim();
    }
    catch
    {
        return null;
    }
    const query = `select count() from events where event='$pageview' and properties.$host='superfunction.xyz' and properties.$referring_domain in (${LLM_DOMAINS}) and timestamp > now() - interval 7 day`;
    const res = await fetch(`https://us.posthog.com/api/projects/${POSTHOG_PROJECT}/query/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
    }).catch(() => null);
    if (!res || !res.ok) return null;
    const data = await res.json();
    return data.results?.[0]?.[0] ?? null;
}

function manualFields()
{
    const num = (name) => (argOf(name) === null ? null : Number(argOf(name)));
    return {
        posthogLlmReferrals: num('--posthog'),
        gscImpressions: num('--gsc-impressions'),
        gscClicks: num('--gsc-clicks'),
        probe: argOf('--probe'),
    };
}

function readRecord()
{
    if (!existsSync(RECORD)) return [];
    return readFileSync(RECORD, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function fmt(value)
{
    return value === null || value === undefined ? '—' : String(value);
}

function delta(curr, prev)
{
    if (typeof curr !== 'number' || typeof prev !== 'number') return '';
    const d = curr - prev;
    return d === 0 ? '' : d > 0 ? ` (+${d})` : ` (${d})`;
}

function printView(rows)
{
    if (rows.length === 0)
    {
        console.log('no snapshots recorded yet');
        return;
    }
    const curr = rows[rows.length - 1];
    const prev = rows.length > 1 ? rows[rows.length - 2] : null;
    console.log(`\nsnapshot ${curr.date}${prev ? ` (vs ${prev.date})` : ' (baseline)'}\n`);

    const line = (label, c, p) => console.log(`  ${label.padEnd(28)} ${fmt(c)}${p === undefined ? '' : delta(c, p)}`);
    line('GitHub stars', curr.github.stars, prev?.github.stars);
    line('GitHub forks', curr.github.forks, prev?.github.forks);
    line('GitHub watchers', curr.github.watchers, prev?.github.watchers);
    line('external issues (all time)', curr.github.externalIssues, prev?.github.externalIssues);
    line('external PRs (all time)', curr.github.externalPRs, prev?.github.externalPRs);
    console.log('');
    for (const [name, n] of Object.entries(curr.npm))
    {
        line(`npm ${name} /wk`, n, prev?.npm[name]);
    }
    console.log('');
    line('PostHog LLM referrals', curr.manual.posthogLlmReferrals, prev?.manual.posthogLlmReferrals);
    line('GSC impressions', curr.manual.gscImpressions, prev?.manual.gscImpressions);
    line('GSC clicks', curr.manual.gscClicks, prev?.manual.gscClicks);
    line('citation probe', curr.manual.probe ?? 'not-run');
    console.log('');
}

if (has('--view'))
{
    printView(readRecord());
    process.exit(0);
}

const manual = manualFields();
if (manual.posthogLlmReferrals === null)
{
    manual.posthogLlmReferrals = await fetchPosthogLlmReferrals();
}

const row = {
    date: new Date().toISOString().slice(0, 10),
    github: await fetchGithub(),
    npm: await fetchNpm(packageNames()),
    manual,
};

if (has('--dry'))
{
    printView([...readRecord(), row]);
    process.exit(0);
}

appendFileSync(RECORD, JSON.stringify(row) + '\n');
printView(readRecord());
