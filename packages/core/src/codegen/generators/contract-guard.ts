/**
 * Router registration guard
 *
 * A contract has to describe what production serves. When a route is registered
 * only under a feature flag or an environment check, the generated contract
 * describes whichever way the generator happened to run — and the gate then
 * compares a promise nobody made.
 *
 * Object spread is the one way a key can be conditionally present in the object
 * `defineRouter()` receives, so that is what this reads. A spread of a plain
 * identifier (`...baseRoutes`) is unconditional and passes; anything computed
 * inside the spread does not.
 */

/** Thrown when the router registers contracted routes conditionally. */
export class ConditionalRegistrationError extends Error
{
    constructor(message: string)
    {
        super(message);
        this.name = 'ConditionalRegistrationError';
    }
}

/** Text inside the object literal passed to `defineRouter()`, comments stripped. */
function defineRouterBlock(source: string): string | undefined
{
    const start = source.indexOf('defineRouter(');

    if (start === -1)
    {
        return undefined;
    }

    const open = source.indexOf('{', start);

    if (open === -1)
    {
        return undefined;
    }

    let depth = 1;
    let cursor = open + 1;

    while (depth > 0 && cursor < source.length)
    {
        if (source[cursor] === '{') depth++;
        else if (source[cursor] === '}') depth--;
        cursor++;
    }

    return source.slice(open + 1, cursor - 1).replace(/\/\/[^\n]*/g, '');
}

const PLAIN_REFERENCE = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*\s*$/;

/**
 * Refuse a router whose route set depends on a condition.
 *
 * @param routerPath - path named in the error message
 * @param source - contents of the router file
 */
export function assertUnconditionalRegistration(routerPath: string, source: string): void
{
    const block = defineRouterBlock(source);

    if (!block)
    {
        return;
    }

    for (const [, expression] of block.matchAll(/\.\.\.\s*([^,\n]+)/g))
    {
        if (PLAIN_REFERENCE.test(expression))
        {
            continue;
        }

        throw new ConditionalRegistrationError(
            `${routerPath} registers routes conditionally: "...${expression.trim()}".\n\n`
            + 'A contract has to describe what production serves. When the route set depends on a flag or an '
            + 'environment, the generated contract describes whichever way the generator happened to run.\n'
            + 'Register contracted routes unconditionally, and gate behaviour inside the handler instead.',
        );
    }
}
