/**
 * `node --test scripts/lib/` — no registry, no network, no npm.
 *
 * Both functions under test are pure, which is the reason they were split out
 * of `publish-changed.mjs` at all: the thing that must not be wrong is the
 * order and the check, and neither of those should need a package server to
 * exercise.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
    internalDependencies,
    missingDependencies,
    orderPackages,
    targetVersion,
} from "./publish-order.mjs";

/** A manifest, with the fields these functions read and nothing else. */
function pkg(name, version, fields = {})
{
    return { name, version, ...fields };
}

const names = (manifests) => manifests.map((manifest) => manifest.name);

const byName = (manifests) => new Map(manifests.map((manifest) => [manifest.name, manifest]));

const published = (...specs) => new Set(specs);

/** A registry that has exactly these `name@spec` pairs and answers about the rest. */
const registryWith = (...specs) => (name, spec) => specs.includes(`${name}@${spec}`);

test("independent packages keep alphabetical order", () =>
{
    const order = orderPackages([pkg("c", "1.0.0"), pkg("a", "1.0.0"), pkg("b", "1.0.0")]);

    assert.deepEqual(names(order), ["a", "b", "c"]);
});

test("a dependency is published before its dependent", () =>
{
    const order = orderPackages([
        pkg("a", "1.0.0", { dependencies: { b: "workspace:*" } }),
        pkg("b", "1.0.0"),
    ]);

    assert.deepEqual(names(order), ["b", "a"]);
});

test("a chain is published from its far end", () =>
{
    const order = orderPackages([
        pkg("a", "1.0.0", { dependencies: { b: "workspace:*" } }),
        pkg("b", "1.0.0", { dependencies: { c: "workspace:*" } }),
        pkg("c", "1.0.0"),
    ]);

    assert.deepEqual(names(order), ["c", "b", "a"]);
});

test("a diamond puts the shared dependency first and each package after its own", () =>
{
    const order = names(orderPackages([
        pkg("a", "1.0.0", { dependencies: { b: "workspace:*", c: "workspace:*" } }),
        pkg("b", "1.0.0", { dependencies: { d: "workspace:*" } }),
        pkg("c", "1.0.0", { dependencies: { d: "workspace:*" } }),
        pkg("d", "1.0.0"),
    ]));

    assert.equal(order[0], "d");
    assert.equal(order.at(-1), "a");
    assert.ok(order.indexOf("b") < order.indexOf("a"));
    assert.ok(order.indexOf("c") < order.indexOf("a"));
    assert.deepEqual([...order].sort(), ["a", "b", "c", "d"]);
});

test("a cycle is refused, and the error names it", () =>
{
    assert.throws(
        () => orderPackages([
            pkg("a", "1.0.0", { dependencies: { b: "workspace:*" } }),
            pkg("b", "1.0.0", { dependencies: { a: "workspace:*" } }),
        ]),
        (error) => /Dependency cycle among packages\/\*: a -> b -> a/.test(error.message),
    );
});

test("a peer dependency orders exactly like a runtime one", () =>
{
    const order = orderPackages([
        pkg("a", "1.0.0", { peerDependencies: { b: ">=1.0.0 <2.0.0" } }),
        pkg("b", "1.0.0"),
    ]);

    assert.deepEqual(names(order), ["b", "a"]);
});

test("an optional dependency orders too — an optional install is still an install", () =>
{
    const order = orderPackages([
        pkg("a", "1.0.0", { optionalDependencies: { b: "workspace:*" } }),
        pkg("b", "1.0.0"),
    ]);

    assert.deepEqual(names(order), ["b", "a"]);
});

test("a dev dependency does not constrain the order", () =>
{
    const order = orderPackages([
        pkg("a", "1.0.0", { devDependencies: { b: "workspace:*" } }),
        pkg("b", "1.0.0", { devDependencies: { a: "workspace:*" } }),
    ]);

    // Alphabetical, and no cycle: nobody downstream installs either edge.
    assert.deepEqual(names(order), ["a", "b"]);
});

test("a dependency on a package outside packages/* is ignored", () =>
{
    const manifests = [
        pkg("a", "1.0.0", { dependencies: { zod: "^3.0.0", b: "workspace:*" } }),
        pkg("b", "1.0.0", { dependencies: { react: "^19.0.0" } }),
    ];

    assert.deepEqual(
        internalDependencies(manifests[0], new Set(["a", "b"])),
        [{ name: "b", range: "workspace:*" }],
    );
    assert.deepEqual(names(orderPackages(manifests)), ["b", "a"]);
});

test("a sibling named in two fields is taken from the one that installs it", () =>
{
    const manifest = pkg("a", "1.0.0", {
        dependencies: { b: "workspace:*" },
        peerDependencies: { b: ">=1.0.0" },
    });

    assert.deepEqual(
        internalDependencies(manifest, new Set(["a", "b"])),
        [{ name: "b", range: "workspace:*" }],
    );
});

test("every workspace: range resolves to the dependency's current version", () =>
{
    const b = pkg("b", "2.3.4");

    assert.equal(targetVersion("workspace:*", b), "2.3.4");
    assert.equal(targetVersion("workspace:^", b), "2.3.4");
    assert.equal(targetVersion("workspace:~", b), "2.3.4");
    assert.equal(targetVersion("^1.0.0", b), "^1.0.0");
});

test("a target version the registry does not have is refused, naming both packages", () =>
{
    const manifests = [pkg("a", "1.0.0", { dependencies: { b: "workspace:^" } }), pkg("b", "2.0.0")];
    const problems = missingDependencies(
        manifests[0],
        byName(manifests),
        registryWith("b@1.9.0"),
        published(),
    );

    assert.equal(problems.length, 1);
    assert.match(problems[0], /^a@1\.0\.0 depends on b@2\.0\.0/);
    assert.match(problems[0], /publish b first/);
});

test("a target version already on the registry is fine", () =>
{
    const manifests = [pkg("a", "1.0.0", { dependencies: { b: "workspace:*" } }), pkg("b", "2.0.0")];

    assert.deepEqual(
        missingDependencies(manifests[0], byName(manifests), registryWith("b@2.0.0"), published()),
        [],
    );
});

test("a target version published earlier in this run is fine, registry or not", () =>
{
    const manifests = [pkg("a", "1.0.0", { dependencies: { b: "workspace:*" } }), pkg("b", "2.0.0")];

    assert.deepEqual(
        missingDependencies(
            manifests[0],
            byName(manifests),
            registryWith(),
            published("b@2.0.0"),
        ),
        [],
    );
});

test("a literal peer range is checked as written, and the registry resolves it", () =>
{
    const manifests = [
        pkg("a", "1.0.0", { peerDependencies: { b: ">=1.0.0 <2.0.0" } }),
        pkg("b", "2.0.0"),
    ];

    assert.deepEqual(
        missingDependencies(manifests[0], byName(manifests), registryWith("b@>=1.0.0 <2.0.0"), published()),
        [],
    );
    assert.equal(
        missingDependencies(manifests[0], byName(manifests), registryWith("b@2.0.0"), published()).length,
        1,
    );
});

test("every unsatisfied dependency is reported, not just the first", () =>
{
    const manifests = [
        pkg("a", "1.0.0", { dependencies: { b: "workspace:*" }, peerDependencies: { c: "workspace:*" } }),
        pkg("b", "2.0.0"),
        pkg("c", "3.0.0"),
    ];
    const problems = missingDependencies(manifests[0], byName(manifests), registryWith(), published());

    assert.equal(problems.length, 2);
    assert.match(problems[0], /depends on b@2\.0\.0/);
    assert.match(problems[1], /depends on c@3\.0\.0/);
});

test("a registry lookup that throws takes the run down with it", () =>
{
    const manifests = [pkg("a", "1.0.0", { dependencies: { b: "workspace:*" } }), pkg("b", "2.0.0")];
    const unreachable = () =>
    {
        throw new Error("registry did not answer");
    };

    assert.throws(
        () => missingDependencies(manifests[0], byName(manifests), unreachable, published()),
        /registry did not answer/,
    );
});

test("this repository's own packages order without a cycle, dependencies first", async () =>
{
    const { readdirSync, readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
    const manifests = readdirSync(join(root, "packages"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => JSON.parse(readFileSync(join(root, "packages", entry.name, "package.json"), "utf8")));

    const order = names(orderPackages(manifests));
    const internal = new Set(order);

    assert.equal(order.length, manifests.length);

    for (const manifest of manifests)
    {
        for (const { name } of internalDependencies(manifest, internal))
        {
            assert.ok(
                order.indexOf(name) < order.indexOf(manifest.name),
                `${name} must be published before ${manifest.name}`,
            );
        }
    }
});
