#!/usr/bin/env node
/**
 * Publish every packages/* version the private Gitea registry does not have yet.
 *
 * Runs in Woodpecker on a main push that touched a packages/star/package.json
 * (see .woodpecker.yml). The registry itself is the idempotency guard: a version
 * already published is skipped, so re-running the pipeline is safe and a push
 * that changed a package.json without bumping the version publishes nothing.
 *
 * The channel comes from the version string the same way the GitHub npmjs
 * workflows derive it: `-alpha` -> alpha, `-beta` -> beta, otherwise latest.
 * The actual publish goes through scripts/publish-package.mjs, which also moves
 * the `latest` dist-tag onto the published version.
 *
 * Auth is the caller's job: an .npmrc mapping the @spfn scope to the Gitea
 * registry with a token must exist before this runs.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGES_DIR = join(ROOT, "packages");

function channelOf(version)
{
    if (version.includes("-alpha"))
    {
        return "alpha";
    }
    if (version.includes("-beta"))
    {
        return "beta";
    }
    return "latest";
}

/**
 * Whether the registry already has this exact version. `npm view` of a missing
 * version can exit 0 with empty output on some npm versions, so the check is
 * on the output, not the exit code.
 */
function isPublished(pkg)
{
    const registryArgs = pkg.publishConfig?.registry
        ? ["--registry", pkg.publishConfig.registry]
        : [];

    try
    {
        const out = execFileSync(
            "npm",
            ["view", `${pkg.name}@${pkg.version}`, "version", ...registryArgs],
            { stdio: ["ignore", "pipe", "pipe"] },
        );
        return out.toString().trim().length > 0;
    }
    catch
    {
        return false;
    }
}

function readPackages()
{
    return readdirSync(PACKAGES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
            const dir = join(PACKAGES_DIR, entry.name);
            const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
            return { dir, pkg };
        })
        .filter(({ pkg }) => !pkg.private);
}

const pending = readPackages().filter(({ pkg }) => !isPublished(pkg));

if (pending.length === 0)
{
    console.log("every package version is already on the registry — nothing to publish");
    process.exit(0);
}

for (const { pkg } of pending)
{
    console.log(`pending: ${pkg.name}@${pkg.version} (${channelOf(pkg.version)})`);
}

// One build for the whole graph: turbo orders dependencies, and a single pass
// is simpler than per-package filters when more than one version bumped.
execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: ROOT, stdio: "inherit" });
execFileSync("pnpm", ["build"], { cwd: ROOT, stdio: "inherit" });

const failed = [];

for (const { dir, pkg } of pending)
{
    try
    {
        execFileSync(
            "node",
            [join(ROOT, "scripts", "publish-package.mjs"), channelOf(pkg.version)],
            { cwd: dir, stdio: "inherit" },
        );
    }
    catch
    {
        failed.push(`${pkg.name}@${pkg.version}`);
    }
}

if (failed.length > 0)
{
    console.error(`failed to publish: ${failed.join(", ")}`);
    process.exit(1);
}
