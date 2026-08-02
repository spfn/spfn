#!/usr/bin/env node
/**
 * Publish the package in the current working directory to the configured
 * registry and keep its `latest` dist-tag pointing at the version just
 * published.
 *
 * `npm publish --tag beta` only moves the `beta` tag, so on a registry that
 * never sees a stable release (the private Gitea one) `latest` freezes at
 * whatever version happened to claim it first. A bare `npm install <pkg>`
 * then serves a stale build. Publishing and re-pointing `latest` in one step
 * keeps both tags on the same version.
 *
 * Usage: node ../../scripts/publish-package.mjs <alpha|beta|latest>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CHANNELS = ["alpha", "beta", "latest"];

function run(args)
{
    execFileSync("npm", args, { stdio: "inherit" });
}

function readPackage()
{
    const path = resolve(process.cwd(), "package.json");
    return JSON.parse(readFileSync(path, "utf8"));
}

const channel = process.argv[2];

if (!CHANNELS.includes(channel))
{
    console.error(`Usage: publish-package.mjs <${CHANNELS.join("|")}>`);
    process.exit(1);
}

const pkg = readPackage();
const spec = `${pkg.name}@${pkg.version}`;

// publishConfig.registry only steers `npm publish`. Pass it to `dist-tag`
// explicitly so both commands act on the same registry.
const registry = pkg.publishConfig?.registry;
const registryArgs = registry ? ["--registry", registry] : [];

run(["publish", "--access", "public", "--tag", channel]);

if (channel !== "latest")
{
    run(["dist-tag", "add", spec, "latest", ...registryArgs]);
}

console.log(`published ${spec} on '${channel}' (latest -> ${pkg.version})`);
