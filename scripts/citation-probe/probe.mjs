#!/usr/bin/env node
// Ask a search-grounded LLM the question set in questions.json and save each
// answer verbatim, so runs months apart can be compared.
//
// Signed out, in a throwaway Chrome profile driven over the DevTools protocol:
// the operator's own browser sessions are never touched, and no account
// personalises the answer.
//
//   node scripts/citation-probe/probe.mjs [--out <dir>] [--settle <ms>] [--only <id,id>]
//
// See README.md in this directory for what to read in the output.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = process.argv.slice(2);
const argOf = (name, fallback) =>
{
    const i = args.indexOf(name);
    return i === -1 ? fallback : args[i + 1];
};

const OUT_DIR = argOf('--out', join(HERE, 'results', new Date().toISOString().slice(0, 10)));
const SETTLE_MS = Number(argOf('--settle', 32000));
const ONLY = argOf('--only', '')?.split(',').filter(Boolean) ?? [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launchChrome(profileDir)
{
    const child = spawn(CHROME, [
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1280,900',
        'about:blank',
    ], { detached: true, stdio: 'ignore' });
    child.unref();
    return child;
}

async function waitForChrome(timeoutMs = 20000)
{
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline)
    {
        try
        {
            const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
            if (res.ok) return true;
        }
        catch {}
        await sleep(500);
    }
    throw new Error('Chrome did not open its debugging port');
}

function connect(wsUrl)
{
    return new Promise((resolve, reject) =>
    {
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => resolve(ws);
        ws.onerror = reject;
    });
}

function evaluate(ws, id, expression)
{
    return new Promise((resolve) =>
    {
        const onMsg = (ev) =>
        {
            const msg = JSON.parse(ev.data);
            if (msg.id !== id) return;
            ws.removeEventListener('message', onMsg);
            resolve(msg.result?.result?.value ?? '');
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression, returnByValue: true },
        }));
    });
}

async function ask(question, index)
{
    const url = `https://www.perplexity.ai/search?q=${encodeURIComponent(question.text)}`;
    const tab = await (await fetch(
        `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`,
        { method: 'PUT' },
    )).json();

    const ws = await connect(tab.webSocketDebuggerUrl);
    await sleep(SETTLE_MS);
    const text = await evaluate(ws, index + 1, 'document.body.innerText');

    await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`);
    ws.close();
    return text;
}

const { questions } = JSON.parse(readFileSync(join(HERE, 'questions.json'), 'utf8'));
const selected = ONLY.length ? questions.filter((q) => ONLY.includes(q.id)) : questions;

mkdirSync(OUT_DIR, { recursive: true });
const profileDir = join(OUT_DIR, '.chrome-throwaway');
mkdirSync(profileDir, { recursive: true });

const chrome = launchChrome(profileDir);
await waitForChrome();

for (const [i, question] of selected.entries())
{
    const text = await ask(question, i);
    writeFileSync(join(OUT_DIR, `${question.id}.txt`), text);
    console.log(`${question.id}: ${text.length} chars`);
}

try { process.kill(chrome.pid); } catch {}
console.log(`\nwritten to ${OUT_DIR}`);
