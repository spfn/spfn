/**
 * The version arithmetic `spfn kit` needs, and no more.
 *
 * A Kit release names the exact public CLI it was built against, so the CLI has
 * to answer two questions before it touches anything: is the running CLI at
 * least the descriptor's `minimumVersion`, and does it fall inside the
 * manifest's `spfnCli` range. Both are asked about versions this project
 * publishes — `0.3.0-beta.5` — so prerelease ordering matters and is
 * implemented, while build metadata is ignored the way semver says.
 */

export interface ParsedVersion
{
    major: number;
    minor: number;
    patch: number;
    prerelease: readonly (string | number)[];
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

export function parseVersion(value: string): ParsedVersion | null
{
    const match = VERSION_PATTERN.exec(value.trim());

    if (!match)
    {
        return null;
    }

    const prerelease = match[4] === undefined
        ? []
        : match[4].split('.').map(part => (/^\d+$/.test(part) ? Number(part) : part));

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease,
    };
}

/** -1, 0 or 1. Throws when either side is not a version. */
export function compareVersions(left: string, right: string): number
{
    const a = parseVersion(left);
    const b = parseVersion(right);

    if (!a || !b)
    {
        throw new TypeError(`Not a version: ${!a ? left : right}`);
    }

    for (const key of ['major', 'minor', 'patch'] as const)
    {
        if (a[key] !== b[key])
        {
            return a[key] < b[key] ? -1 : 1;
        }
    }

    return comparePrerelease(a.prerelease, b.prerelease);
}

function comparePrerelease(
    left: readonly (string | number)[],
    right: readonly (string | number)[],
): number
{
    // A release outranks any prerelease of the same triple.
    if (left.length === 0 || right.length === 0)
    {
        if (left.length === right.length)
        {
            return 0;
        }

        return left.length === 0 ? 1 : -1;
    }

    for (let index = 0; index < Math.max(left.length, right.length); index += 1)
    {
        const a = left[index];
        const b = right[index];

        if (a === undefined)
        {
            return -1;
        }
        if (b === undefined)
        {
            return 1;
        }
        if (a === b)
        {
            continue;
        }
        if (typeof a === 'number' && typeof b === 'number')
        {
            return a < b ? -1 : 1;
        }
        if (typeof a === 'number')
        {
            return -1;
        }
        if (typeof b === 'number')
        {
            return 1;
        }

        return a < b ? -1 : 1;
    }

    return 0;
}

/** Whether `current` is at least `minimum`. */
export function atLeast(current: string, minimum: string): boolean
{
    return compareVersions(current, minimum) >= 0;
}

type Comparator = { operator: '>=' | '>' | '<=' | '<' | '='; version: string };

/**
 * Whether a version satisfies a space-separated comparator range such as
 * `>=0.3.0-beta.5 <0.4.0`. This is the exact shape a Kit manifest writes; a
 * range this parser does not understand is refused rather than guessed at,
 * because "I could not read the range" must never read as "compatible".
 */
export function satisfiesRange(version: string, range: string): boolean
{
    const comparators = parseRange(range);

    if (comparators === null)
    {
        return false;
    }

    return comparators.every(comparator => matches(version, comparator));
}

function parseRange(range: string): Comparator[] | null
{
    const parts = range.trim().split(/\s+/).filter(part => part.length > 0);

    if (parts.length === 0)
    {
        return null;
    }

    const comparators: Comparator[] = [];

    for (const part of parts)
    {
        const match = /^(>=|<=|>|<|=)?(.+)$/.exec(part);

        if (!match || parseVersion(match[2]) === null)
        {
            return null;
        }

        comparators.push({
            operator: (match[1] ?? '=') as Comparator['operator'],
            version: match[2],
        });
    }

    return comparators;
}

function matches(version: string, comparator: Comparator): boolean
{
    let order: number;

    try
    {
        order = compareVersions(version, comparator.version);
    }
    catch
    {
        return false;
    }

    switch (comparator.operator)
    {
        case '>=':
            return order >= 0;
        case '>':
            return order > 0;
        case '<=':
            return order <= 0;
        case '<':
            return order < 0;
        default:
            return order === 0;
    }
}
