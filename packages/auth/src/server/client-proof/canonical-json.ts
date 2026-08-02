/**
 * SPFN-CANON-JSON-1 — the canonical JSON form the mobile contract pins.
 *
 * The rules (contracts/mobile/spfn-mobile-contract.json `canonicalJson`):
 * - object keys sorted ascending by UTF-8 byte sequence
 * - no insignificant whitespace
 * - numbers are signed 64-bit integers only
 * - string escapes: `"` and `\` escaped; C0 controls use \b \f \n \r \t where
 *   defined and lowercase \u00XX otherwise; every other scalar is emitted
 *   literally as UTF-8
 * - absent optional fields are omitted, never null
 *
 * JSON.parse cannot implement this: it loses int64 precision, accepts duplicate
 * keys and (in V8) raw control characters, so both directions are hand-rolled.
 * A proof binds the received bytes — parse-then-re-encode equality is what makes
 * canonicity a rule a client can actually break.
 *
 * @module server/client-proof/canonical-json
 */

export type CanonicalObject = Map<string, CanonicalValue>;

export type CanonicalValue = null | boolean | bigint | string | CanonicalValue[] | CanonicalObject;

/**
 * Parse failures carry the code the mobile conformance fixtures name
 * (Contracts/fixtures/canonical/rejects.json), so the fixtures can assert on it.
 */
export type CanonicalJsonErrorCode =
    | 'DUPLICATE_KEY'
    | 'NON_INTEGER_NUMBER'
    | 'TRAILING_CONTENT'
    | 'UNEXPECTED_END'
    | 'INVALID_TOKEN'
    | 'INVALID_ESCAPE'
    | 'INTEGER_OUT_OF_RANGE'
    | 'INVALID_UTF8';

export class CanonicalJsonError extends Error
{
    constructor(readonly code: CanonicalJsonErrorCode)
    {
        super(`canonical JSON: ${code}`);
        this.name = 'CanonicalJsonError';
    }
}

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse bytes as SPFN-CANON-JSON-1.
 *
 * Arbitrary whitespace and key order are accepted here — parsing alone proves
 * nothing about canonicity. Callers that must enforce it re-encode the result
 * and compare bytes (see `isCanonicalBytes`).
 */
export function parseCanonicalJson(bytes: Uint8Array): CanonicalValue
{
    let text: string;
    try
    {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch
    {
        throw new CanonicalJsonError('INVALID_UTF8');
    }

    const parser = new Parser(text);
    const value = parser.parseValue();
    parser.skipWhitespace();
    if (!parser.atEnd())
    {
        throw new CanonicalJsonError('TRAILING_CONTENT');
    }

    return value;
}

/** True when `bytes` are exactly the canonical encoding of the value they parse to. */
export function isCanonicalBytes(bytes: Uint8Array, value: CanonicalValue): boolean
{
    const encoded = encodeCanonicalJson(value);
    if (encoded.length !== bytes.length)
    {
        return false;
    }
    for (let i = 0; i < encoded.length; i++)
    {
        if (encoded[i] !== bytes[i])
        {
            return false;
        }
    }

    return true;
}

class Parser
{
    private pos = 0;

    constructor(private readonly text: string) 
    {}

    atEnd(): boolean
    {
        return this.pos >= this.text.length;
    }

    skipWhitespace(): void
    {
        while (!this.atEnd())
        {
            const c = this.text[this.pos];
            if (c === ' ' || c === '\t' || c === '\n' || c === '\r')
            {
                this.pos++;
                continue;
            }
            break;
        }
    }

    parseValue(): CanonicalValue
    {
        this.skipWhitespace();
        if (this.atEnd())
        {
            throw new CanonicalJsonError('UNEXPECTED_END');
        }
        const c = this.text[this.pos];
        if (c === '{')
        {
            return this.parseObject();
        }
        if (c === '[')
        {
            return this.parseArray();
        }
        if (c === '"')
        {
            return this.parseString();
        }
        if (c === '-' || (c >= '0' && c <= '9'))
        {
            return this.parseNumber();
        }
        if (this.text.startsWith('null', this.pos))
        {
            this.pos += 4;

            return null;
        }
        if (this.text.startsWith('true', this.pos))
        {
            this.pos += 4;

            return true;
        }
        if (this.text.startsWith('false', this.pos))
        {
            this.pos += 5;

            return false;
        }
        throw new CanonicalJsonError('INVALID_TOKEN');
    }

    private parseObject(): CanonicalObject
    {
        this.pos++; // '{'
        const members: CanonicalObject = new Map();
        this.skipWhitespace();
        if (this.atEnd())
        {
            throw new CanonicalJsonError('UNEXPECTED_END');
        }
        if (this.text[this.pos] === '}')
        {
            this.pos++;

            return members;
        }
        for (;;)
        {
            this.skipWhitespace();
            if (this.atEnd())
            {
                throw new CanonicalJsonError('UNEXPECTED_END');
            }
            if (this.text[this.pos] !== '"')
            {
                throw new CanonicalJsonError('INVALID_TOKEN');
            }
            const key = this.parseString();
            if (members.has(key))
            {
                throw new CanonicalJsonError('DUPLICATE_KEY');
            }
            this.skipWhitespace();
            if (this.atEnd())
            {
                throw new CanonicalJsonError('UNEXPECTED_END');
            }
            if (this.text[this.pos] !== ':')
            {
                throw new CanonicalJsonError('INVALID_TOKEN');
            }
            this.pos++;
            members.set(key, this.parseValue());
            this.skipWhitespace();
            if (this.atEnd())
            {
                throw new CanonicalJsonError('UNEXPECTED_END');
            }
            const next = this.text[this.pos];
            if (next === ',')
            {
                this.pos++;
                continue;
            }
            if (next === '}')
            {
                this.pos++;

                return members;
            }
            throw new CanonicalJsonError('INVALID_TOKEN');
        }
    }

    private parseArray(): CanonicalValue[]
    {
        this.pos++; // '['
        const items: CanonicalValue[] = [];
        this.skipWhitespace();
        if (this.atEnd())
        {
            throw new CanonicalJsonError('UNEXPECTED_END');
        }
        if (this.text[this.pos] === ']')
        {
            this.pos++;

            return items;
        }
        for (;;)
        {
            items.push(this.parseValue());
            this.skipWhitespace();
            if (this.atEnd())
            {
                throw new CanonicalJsonError('UNEXPECTED_END');
            }
            const next = this.text[this.pos];
            if (next === ',')
            {
                this.pos++;
                continue;
            }
            if (next === ']')
            {
                this.pos++;

                return items;
            }
            throw new CanonicalJsonError('INVALID_TOKEN');
        }
    }

    private parseString(): string
    {
        this.pos++; // '"'
        let out = '';
        for (;;)
        {
            if (this.atEnd())
            {
                throw new CanonicalJsonError('UNEXPECTED_END');
            }
            const c = this.text[this.pos];
            const code = this.text.charCodeAt(this.pos);
            if (c === '"')
            {
                this.pos++;

                return out;
            }
            if (c === '\\')
            {
                out += this.parseEscape();
                continue;
            }
            if (code < 0x20)
            {
                throw new CanonicalJsonError('INVALID_TOKEN');
            }
            out += c;
            this.pos++;
        }
    }

    private parseEscape(): string
    {
        this.pos++; // '\'
        if (this.atEnd())
        {
            throw new CanonicalJsonError('UNEXPECTED_END');
        }
        const c = this.text[this.pos];
        this.pos++;
        switch (c)
        {
            case '"': return '"';
            case '\\': return '\\';
            case '/': return '/';
            case 'b': return '\b';
            case 'f': return '\f';
            case 'n': return '\n';
            case 'r': return '\r';
            case 't': return '\t';
            case 'u': return this.parseUnicodeEscape();
            default: throw new CanonicalJsonError('INVALID_ESCAPE');
        }
    }

    private parseUnicodeEscape(): string
    {
        const high = this.readHex4();
        if (high >= 0xdc00 && high <= 0xdfff)
        {
            // A low surrogate with no preceding high surrogate.
            throw new CanonicalJsonError('INVALID_ESCAPE');
        }
        if (high < 0xd800 || high > 0xdbff)
        {
            return String.fromCharCode(high);
        }
        // A high surrogate must be completed by an escaped low surrogate.
        if (this.text[this.pos] !== '\\' || this.text[this.pos + 1] !== 'u')
        {
            throw new CanonicalJsonError('INVALID_ESCAPE');
        }
        this.pos += 2;
        const low = this.readHex4();
        if (low < 0xdc00 || low > 0xdfff)
        {
            throw new CanonicalJsonError('INVALID_ESCAPE');
        }

        return String.fromCharCode(high, low);
    }

    private readHex4(): number
    {
        if (this.pos + 4 > this.text.length)
        {
            throw new CanonicalJsonError('UNEXPECTED_END');
        }
        const hex = this.text.slice(this.pos, this.pos + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex))
        {
            throw new CanonicalJsonError('INVALID_ESCAPE');
        }
        this.pos += 4;

        return parseInt(hex, 16);
    }

    private parseNumber(): bigint
    {
        const start = this.pos;
        if (this.text[this.pos] === '-')
        {
            this.pos++;
        }
        if (this.atEnd())
        {
            throw new CanonicalJsonError('UNEXPECTED_END');
        }
        const first = this.text[this.pos];
        if (first < '0' || first > '9')
        {
            throw new CanonicalJsonError('INVALID_TOKEN');
        }
        if (first === '0')
        {
            this.pos++;
        }
        else
        {
            while (!this.atEnd() && this.text[this.pos] >= '0' && this.text[this.pos] <= '9')
            {
                this.pos++;
            }
        }
        if (!this.atEnd())
        {
            const next = this.text[this.pos];
            if (next >= '0' && next <= '9')
            {
                // A leading zero followed by more digits.
                throw new CanonicalJsonError('INVALID_TOKEN');
            }
            if (next === '.' || next === 'e' || next === 'E')
            {
                throw new CanonicalJsonError('NON_INTEGER_NUMBER');
            }
        }
        const value = BigInt(this.text.slice(start, this.pos));
        if (value < INT64_MIN || value > INT64_MAX)
        {
            throw new CanonicalJsonError('INTEGER_OUT_OF_RANGE');
        }

        return value;
    }
}

// ============================================================================
// Encoding
// ============================================================================

/** Encode a value as SPFN-CANON-JSON-1 bytes. */
export function encodeCanonicalJson(value: CanonicalValue): Uint8Array
{
    return new TextEncoder().encode(encodeToString(value));
}

function encodeToString(value: CanonicalValue): string
{
    if (value === null)
    {
        return 'null';
    }
    if (typeof value === 'boolean')
    {
        return value ? 'true' : 'false';
    }
    if (typeof value === 'bigint')
    {
        return value.toString();
    }
    if (typeof value === 'string')
    {
        return encodeString(value);
    }
    if (Array.isArray(value))
    {
        return `[${value.map(encodeToString).join(',')}]`;
    }
    const keys = [...value.keys()].sort(compareByCodePoints);
    const members = keys.map((key) => `${encodeString(key)}:${encodeToString(value.get(key)!)}`);

    return `{${members.join(',')}}`;
}

/**
 * UTF-8 byte order equals code point order, so keys are compared by code
 * points rather than UTF-16 code units (which would misorder U+E000..U+FFFF
 * against supplementary-plane characters).
 */
function compareByCodePoints(a: string, b: string): number
{
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length)
    {
        const ca = a.codePointAt(i)!;
        const cb = b.codePointAt(j)!;
        if (ca !== cb)
        {
            return ca - cb;
        }
        i += ca > 0xffff ? 2 : 1;
        j += cb > 0xffff ? 2 : 1;
    }

    return (a.length - i) - (b.length - j);
}

function encodeString(value: string): string
{
    let out = '"';
    for (const ch of value)
    {
        const code = ch.codePointAt(0)!;
        if (ch === '"')
        {
            out += '\\"';
        }
        else if (ch === '\\')
        {
            out += '\\\\';
        }
        else if (code === 0x08)
        {
            out += '\\b';
        }
        else if (code === 0x0c)
        {
            out += '\\f';
        }
        else if (code === 0x0a)
        {
            out += '\\n';
        }
        else if (code === 0x0d)
        {
            out += '\\r';
        }
        else if (code === 0x09)
        {
            out += '\\t';
        }
        else if (code < 0x20)
        {
            out += `\\u00${code.toString(16).padStart(2, '0')}`;
        }
        else
        {
            out += ch;
        }
    }

    return out + '"';
}
