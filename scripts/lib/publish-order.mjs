/**
 * The order packages/* has to be published in, and the check that the order
 * was enough.
 *
 * Registry versions are immutable. A package published while a workspace
 * sibling it depends on is still absent is a version that can never be made
 * installable — the only remedy is a new version number, and every consumer
 * who resolved the broken one in between keeps it. So this is not a
 * convenience: it is the difference between a failed pipeline and a permanent
 * hole in a registry.
 *
 * Two pure functions, so the tests need no registry:
 *
 * - `orderPackages()` puts a dependency before its dependents.
 * - `missingDependencies()` says whether that was actually enough, given what
 *   the registry has and what this run has published so far. Ordering alone is
 *   not enough — the dependency may simply not be published anywhere, at the
 *   version the dependent's manifest will name.
 *
 * Both take manifests (parsed `package.json` objects) and nothing else.
 */

/**
 * The dependency fields a consumer's install actually resolves.
 *
 * `devDependencies` is deliberately absent. Nobody downstream installs it, so
 * a dev dependency on a sibling says nothing about what has to be on the
 * registry first. Counting it would also invent constraints out of the
 * `workspace:*` dev dependency this repository pairs with every peer range —
 * the same edge twice, once as a fact about consumers and once as a fact about
 * this checkout, and only the first one is about publishing.
 */
export const INSTALLED_DEPENDENCY_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"];

const WORKSPACE_PROTOCOL = "workspace:";

/**
 * The dependencies of `manifest` that are other packages in this workspace,
 * as `{ name, range }`, alphabetical.
 *
 * Membership is decided by name: `workspace:*` and a literal range are both
 * ways of naming the same sibling, and both put it before this package. A
 * dependency on anything outside `internal` is somebody else's package and
 * somebody else's release.
 *
 * A sibling named in two fields is taken from the first, which is the order
 * above: what `dependencies` installs is what a consumer gets.
 */
export function internalDependencies(manifest, internal)
{
    const found = new Map();

    for (const field of INSTALLED_DEPENDENCY_FIELDS)
    {
        for (const [name, range] of Object.entries(manifest[field] ?? {}))
        {
            if (internal.has(name) && !found.has(name))
            {
                found.set(name, range);
            }
        }
    }

    return [...found]
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([name, range]) => ({ name, range }));
}

function cycleError(path, name)
{
    const cycle = [...path.slice(path.indexOf(name)), name].join(" -> ");

    return new Error(
        `Dependency cycle among packages/*: ${cycle}. `
        + "There is no order that publishes each of these after the one it needs; "
        + "break the cycle before releasing any of them.",
    );
}

/**
 * `manifests` in an order that publishes every package after the ones it
 * depends on.
 *
 * Depth-first over an alphabetical worklist, emitting in post-order: a
 * dependency lands before its dependents, and packages that constrain each
 * other in no way stay in the alphabetical order they came in. Stability is
 * worth having on its own — a publish log that reorders itself between runs is
 * a log nobody reads.
 *
 * Throws on a cycle, naming it. Publishing any member of a cycle first is a
 * guess, and the wrong guess is not recoverable.
 */
export function orderPackages(manifests)
{
    const internal = new Set(manifests.map((manifest) => manifest.name));
    const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]));
    const state = new Map();
    const ordered = [];

    function visit(manifest, path)
    {
        if (state.get(manifest.name) === "done")
        {
            return;
        }

        if (state.get(manifest.name) === "visiting")
        {
            throw cycleError(path, manifest.name);
        }

        state.set(manifest.name, "visiting");

        for (const { name } of internalDependencies(manifest, internal))
        {
            visit(byName.get(name), [...path, manifest.name]);
        }

        state.set(manifest.name, "done");
        ordered.push(manifest);
    }

    for (const manifest of [...manifests].sort((left, right) => (left.name < right.name ? -1 : 1)))
    {
        visit(manifest, []);
    }

    return ordered;
}

/**
 * The version specifier a published manifest will actually carry.
 *
 * `workspace:*`, `workspace:^` and `workspace:~` never reach a registry: the
 * pack step rewrites each of them from the dependency's CURRENT version, so
 * checking the literal would check a string no consumer ever sees. The exact
 * version is what all three resolve from, and asking for it is at least as
 * strict as the `^`/`~` range built out of it.
 *
 * Any other range is already what it says and is passed through unchanged.
 */
export function targetVersion(range, dependency)
{
    return range.startsWith(WORKSPACE_PROTOCOL) ? dependency.version : range;
}

/**
 * Why `manifest` cannot be published yet — one message per internal
 * dependency the registry cannot satisfy, empty when it can be.
 *
 * `isPublished(name, spec)` asks the registry whether anything answers to that
 * specifier; it must distinguish "not there" from "did not answer" and throw
 * on the second, because a lookup that fails quietly is a lookup that reports
 * every dependency as missing or as present, and one of those publishes the
 * hole this file exists to prevent.
 *
 * `publishedInThisRun` holds `name@version` for what this run has already put
 * on the registry — the registry may not serve it back immediately, and a run
 * that publishes a dependency and then refuses its dependent has ordered
 * itself correctly and failed anyway. Only an exact version can match it,
 * which is every `workspace:` dependency; a literal range names something that
 * was published before this run or was never published at all.
 */
export function missingDependencies(manifest, byName, isPublished, publishedInThisRun)
{
    const internal = new Set(byName.keys());

    return internalDependencies(manifest, internal).flatMap(({ name, range }) =>
    {
        const spec = targetVersion(range, byName.get(name));

        if (publishedInThisRun.has(`${name}@${spec}`) || isPublished(name, spec))
        {
            return [];
        }

        return [
            `${manifest.name}@${manifest.version} depends on ${name}@${spec}, `
            + "which is not on the registry and is not published earlier in this run. "
            + `Publishing ${manifest.name} now would put an uninstallable version on a `
            + `registry that cannot take it back — publish ${name} first.`,
        ];
    });
}
