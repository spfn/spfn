/**
 * A last line of defence: nothing a Kit operation writes or prints may carry a
 * secret (unit 06 table F).
 *
 * The first line of defence is the contract — the journal's schema is closed,
 * so a field for a token does not exist. This scanner catches what a closed
 * schema cannot: a secret smuggled inside a field that legitimately holds free
 * text, such as a failure summary quoting a command line.
 *
 * It is deliberately shape-based and short. A scanner that tries to recognise
 * every secret in the world reports on everything and is switched off; this one
 * knows the shapes this product actually mints, plus whatever literal values
 * the caller says it is holding at that moment.
 */

/** Secret shapes this product mints, by name so a report can say which. */
export const SECRET_SHAPES: readonly { name: string; pattern: RegExp }[] = [
    { name: 'license-key', pattern: /\bspfnl_[A-Za-z0-9_-]{4,}/ },
    { name: 'local-credential', pattern: /\blcc_[A-Za-z0-9]{8,}/ },
    { name: 'registry-session', pattern: /\bspfnr_[A-Za-z0-9_-]{4,}/ },
    { name: 'bearer-header', pattern: /\bBearer\s+[A-Za-z0-9._-]{8,}/i },
    { name: 'registry-token-env', pattern: /SPFN_REGISTRY_TOKEN\s*=\s*\S+/ },
    { name: 'npmrc-authtoken', pattern: /_authToken\s*=\s*\S+/ },
    { name: 'postgres-url', pattern: /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/ },
];

export interface SecretFinding
{
    /** Which shape matched, or `known-value` for a caller-supplied literal. */
    shape: string;
    /** Where it was found — a JSON pointer for structured input. */
    pointer: string;
}

export interface ScanOptions
{
    /** Exact secret values the caller is currently holding. */
    knownValues?: readonly string[];
}

/** Scan text. Returns every finding, so a report can say how many. */
export function scanTextForSecrets(text: string, options: ScanOptions = {}): SecretFinding[]
{
    const findings: SecretFinding[] = [];

    for (const shape of SECRET_SHAPES)
    {
        if (shape.pattern.test(text))
        {
            findings.push({ shape: shape.name, pointer: '' });
        }
    }
    for (const value of options.knownValues ?? [])
    {
        if (value.length >= 8 && text.includes(value))
        {
            findings.push({ shape: 'known-value', pointer: '' });
        }
    }

    return findings;
}

/** Scan a structured value, reporting the pointer of each string that matched. */
export function scanValueForSecrets(value: unknown, options: ScanOptions = {}): SecretFinding[]
{
    const findings: SecretFinding[] = [];

    walk(value, '', (text, pointer) =>
    {
        for (const finding of scanTextForSecrets(text, options))
        {
            findings.push({ ...finding, pointer });
        }
    });

    return findings;
}

function walk(value: unknown, pointer: string, visit: (text: string, pointer: string) => void): void
{
    if (typeof value === 'string')
    {
        visit(value, pointer);

        return;
    }
    if (Array.isArray(value))
    {
        value.forEach((item, index) => walk(item, `${pointer}/${index}`, visit));

        return;
    }
    if (typeof value === 'object' && value !== null)
    {
        for (const [key, item] of Object.entries(value as Record<string, unknown>))
        {
            // A key can be as telling as a value: `{"licenseKey": "…"}`.
            visit(key, `${pointer}/${key}`);
            walk(item, `${pointer}/${key}`, visit);
        }
    }
}

/** Replace anything that looks like a secret with `[redacted]`. */
export function redactSecrets(text: string, options: ScanOptions = {}): string
{
    let output = text;

    for (const value of options.knownValues ?? [])
    {
        if (value.length >= 8)
        {
            output = output.split(value).join('[redacted]');
        }
    }
    for (const shape of SECRET_SHAPES)
    {
        output = output.replace(new RegExp(shape.pattern.source, `g${shape.pattern.flags.replace('g', '')}`), '[redacted]');
    }

    return output;
}
