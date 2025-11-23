/**
 * Environment Variable Management - Parsers
 *
 * Parser functions that transform and validate environment variable strings.
 * All parsers follow the pattern: (value: string) => T or throw Error
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Parser function that transforms and validates a string value
 * @throws Error if validation fails
 */
export type Parser<T> = (value: string) => T;

// ============================================================================
// String Parsers
// ============================================================================

/**
 * Parse a non-empty string
 *
 * @param value - Value to parse
 * @returns Trimmed string
 * @throws Error if string is empty after trimming
 *
 * @example
 * ```typescript
 * const name = getEnvVar('APP_NAME', {
 *   validator: parseString,
 * });
 * ```
 */
export function parseString(value: string): string
{
    const trimmed = value.trim();

    if (trimmed.length === 0)
    {
        throw new Error('Value cannot be empty');
    }

    return trimmed;
}

/**
 * Create a string parser with validation rules
 *
 * @param options - Validation options
 * @returns Parser function
 *
 * @example
 * ```typescript
 * const apiKey = getEnvVar('API_KEY', {
 *   validator: createStringParser({
 *     minLength: 32,
 *     pattern: /^[A-Za-z0-9_-]+$/,
 *   }),
 * });
 * ```
 */
export function createStringParser(
    options: {
        minLength?: number;
        maxLength?: number;
        pattern?: RegExp;
        trim?: boolean;
    } = {}
): Parser<string>
{
    return (value: string): string =>
    {
        const { minLength, maxLength, pattern, trim = true } = options;

        let result = trim ? value.trim() : value;

        // Empty check
        if (result.length === 0)
        {
            throw new Error('Value cannot be empty');
        }

        // Length validation
        if (minLength !== undefined && result.length < minLength)
        {
            throw new Error(`Must be at least ${minLength} characters long (current: ${result.length})`);
        }

        if (maxLength !== undefined && result.length > maxLength)
        {
            throw new Error(`Must be at most ${maxLength} characters long (current: ${result.length})`);
        }

        // Pattern validation
        if (pattern && !pattern.test(result))
        {
            throw new Error(`Must match pattern ${pattern}`);
        }

        return result;
    };
}

// ============================================================================
// Boolean Parser
// ============================================================================

/**
 * Parse a boolean environment variable
 *
 * Accepts: 'true', '1', 'yes' (case-insensitive) → true
 *          'false', '0', 'no' (case-insensitive) → false
 *
 * @param value - Value to parse
 * @returns Boolean value
 * @throws Error if value is not a valid boolean string
 *
 * @example
 * ```typescript
 * const debug = getEnvVar('DEBUG', {
 *   default: 'false',
 *   validator: parseBoolean,
 * });
 * ```
 */
export function parseBoolean(value: string): boolean
{
    const normalized = value.toLowerCase().trim();

    if (['true', '1', 'yes'].includes(normalized))
    {
        return true;
    }

    if (['false', '0', 'no'].includes(normalized))
    {
        return false;
    }

    throw new Error(
        `Must be a boolean value (true/false, 1/0, yes/no), got: ${value}`
    );
}

// ============================================================================
// Number Parsers
// ============================================================================

/**
 * Parse and validate number
 *
 * @param value - Value to parse
 * @param options - Validation options
 * @returns Parsed number
 * @throws Error if invalid number or constraint violation
 *
 * @example
 * ```typescript
 * const port = getEnvVar('PORT', {
 *   default: '3000',
 *   validator: (val) => parseNumber(val, { min: 1, max: 65535, integer: true }),
 * });
 * ```
 */
export function parseNumber(
    value: string,
    options: { min?: number; max?: number; integer?: boolean } = {}
): number
{
    const { min, max, integer = false } = options;

    // Reject empty strings
    if (value.trim() === '')
    {
        throw new Error('Value cannot be empty');
    }

    const num = Number(value);

    if (isNaN(num))
    {
        throw new Error(`Must be a valid number, got: ${value}`);
    }

    if (integer && !Number.isInteger(num))
    {
        throw new Error(`Must be an integer, got: ${value}`);
    }

    if (min !== undefined && num < min)
    {
        throw new Error(`Must be at least ${min}, got: ${num}`);
    }

    if (max !== undefined && num > max)
    {
        throw new Error(`Must be at most ${max}, got: ${num}`);
    }

    return num;
}

/**
 * Create a number parser with specific constraints
 *
 * @param options - Validation constraints
 * @returns Parser function
 *
 * @example
 * ```typescript
 * const port = getEnvVar('PORT', {
 *   default: '3000',
 *   validator: createNumberParser({ min: 1, max: 65535, integer: true }),
 * });
 * ```
 */
export function createNumberParser(
    options: { min?: number; max?: number; integer?: boolean } = {}
): Parser<number>
{
    return (value: string) => parseNumber(value, options);
}

/**
 * Parse integer with optional constraints
 *
 * @param value - Value to parse
 * @param options - Min/max constraints
 * @returns Parsed integer
 * @throws Error if invalid or out of range
 *
 * @example
 * ```typescript
 * const retries = getEnvVar('MAX_RETRIES', {
 *   default: '3',
 *   validator: (val) => parseInteger(val, { min: 1, max: 10 }),
 * });
 * ```
 */
export function parseInteger(
    value: string,
    options: { min?: number; max?: number } = {}
): number
{
    return parseNumber(value, { ...options, integer: true });
}

/**
 * Parse float/decimal number with optional constraints
 *
 * @param value - Value to parse
 * @param options - Min/max constraints
 * @returns Parsed float
 * @throws Error if invalid or out of range
 *
 * @example
 * ```typescript
 * const ratio = getEnvVar('CACHE_RATIO', {
 *   default: '0.75',
 *   validator: (val) => parseFloat(val, { min: 0, max: 1 }),
 * });
 * ```
 */
export function parseFloat(
    value: string,
    options: { min?: number; max?: number } = {}
): number
{
    return parseNumber(value, { ...options, integer: false });
}

// ============================================================================
// URL Parsers
// ============================================================================

/**
 * Parse and validate URL
 *
 * @param value - Value to parse
 * @param options - Validation options
 * @returns Validated URL string
 * @throws Error if invalid URL or protocol mismatch
 *
 * @example
 * ```typescript
 * const apiUrl = getEnvVar('API_URL', {
 *   validator: (val) => parseUrl(val, { protocol: 'https' }),
 * });
 * ```
 */
export function parseUrl(
    value: string,
    options: { protocol?: 'http' | 'https' | 'any' } = {}
): string
{
    const { protocol = 'any' } = options;

    // Parse URL (may throw TypeError)
    let url: URL;
    try
    {
        url = new URL(value);
    }
    catch (error)
    {
        if (error instanceof TypeError)
        {
            throw new Error(`Invalid URL: ${value}`);
        }
        throw error;
    }

    // Validate protocol
    if (protocol === 'http' && url.protocol !== 'http:')
    {
        throw new Error(`URL must use HTTP protocol, got ${url.protocol}`);
    }

    if (protocol === 'https' && url.protocol !== 'https:')
    {
        throw new Error(`URL must use HTTPS protocol, got ${url.protocol}`);
    }

    return value;
}

/**
 * Create a URL parser with specific protocol requirement
 *
 * @param protocol - Required protocol ('http', 'https', or 'any')
 * @returns Parser function
 *
 * @example
 * ```typescript
 * const apiUrl = getEnvVar('API_URL', {
 *   validator: createUrlParser('https'),
 * });
 * ```
 */
export function createUrlParser(protocol: 'http' | 'https' | 'any' = 'any'): Parser<string>
{
    return (value: string) => parseUrl(value, { protocol });
}

/**
 * Parse PostgreSQL connection string
 *
 * @param value - Value to parse
 * @returns Validated PostgreSQL URL string
 * @throws Error if invalid PostgreSQL URL
 *
 * @example
 * ```typescript
 * const dbUrl = getEnvVar('DATABASE_URL', {
 *   required: true,
 *   validator: parsePostgresUrl,
 * });
 * ```
 */
export function parsePostgresUrl(value: string): string
{
    // Parse URL (may throw TypeError)
    let url: URL;
    try
    {
        url = new URL(value);
    }
    catch (error)
    {
        if (error instanceof TypeError)
        {
            throw new Error(`Invalid PostgreSQL URL: ${value}`);
        }
        throw error;
    }

    // Validate protocol
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:')
    {
        throw new Error(
            `Must be a PostgreSQL URL (postgres:// or postgresql://), got ${url.protocol}`
        );
    }

    return value;
}

/**
 * Parse Redis connection string
 *
 * @param value - Value to parse
 * @returns Validated Redis URL string
 * @throws Error if invalid Redis URL
 *
 * @example
 * ```typescript
 * const redisUrl = getEnvVar('REDIS_URL', {
 *   required: true,
 *   validator: parseRedisUrl,
 * });
 * ```
 */
export function parseRedisUrl(value: string): string
{
    // Parse URL (may throw TypeError)
    let url: URL;
    try
    {
        url = new URL(value);
    }
    catch (error)
    {
        if (error instanceof TypeError)
        {
            throw new Error(`Invalid Redis URL: ${value}`);
        }
        throw error;
    }

    // Validate protocol
    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:')
    {
        throw new Error(
            `Must be a Redis URL (redis:// or rediss://), got ${url.protocol}`
        );
    }

    return value;
}

// ============================================================================
// Enum Parser
// ============================================================================

/**
 * Parse and validate enum value
 *
 * @param value - Value to parse
 * @param allowed - Array of allowed values
 * @param caseInsensitive - Whether to perform case-insensitive comparison
 * @returns Validated enum value
 * @throws Error if value not in allowed list
 *
 * @example
 * ```typescript
 * const env = getEnvVar('NODE_ENV', {
 *   validator: (val) => parseEnum(val, ['development', 'production', 'test']),
 * });
 * ```
 */
export function parseEnum(
    value: string,
    allowed: string[],
    caseInsensitive = false
): string
{
    if (caseInsensitive)
    {
        const normalizedValue = value.toLowerCase();
        const normalizedAllowed = allowed.map((v) => v.toLowerCase());
        const index = normalizedAllowed.indexOf(normalizedValue);

        if (index === -1)
        {
            throw new Error(
                `Must be one of [${allowed.join(', ')}], got: ${value}`
            );
        }

        return allowed[index]; // Return original case from allowed list
    }

    if (!allowed.includes(value))
    {
        throw new Error(
            `Must be one of [${allowed.join(', ')}], got: ${value}`
        );
    }

    return value;
}

/**
 * Create an enum parser with specific allowed values
 *
 * @param allowed - Array of allowed values
 * @param caseInsensitive - Whether to perform case-insensitive comparison
 * @returns Parser function
 *
 * @example
 * ```typescript
 * const logLevel = getEnvVar('LOG_LEVEL', {
 *   default: 'info',
 *   validator: createEnumParser(['debug', 'info', 'warn', 'error']),
 * });
 * ```
 */
export function createEnumParser(allowed: string[], caseInsensitive = false): Parser<string>
{
    return (value: string) => parseEnum(value, allowed, caseInsensitive);
}

// ============================================================================
// JSON Parser
// ============================================================================

/**
 * Parse JSON string
 *
 * @param value - JSON string to parse
 * @returns Parsed JSON value
 * @throws Error if invalid JSON
 *
 * @example
 * ```typescript
 * const config = getEnvVar('CONFIG_JSON', {
 *   validator: parseJson,
 * });
 * ```
 */
export function parseJson<T = any>(value: string): T
{
    try
    {
        return JSON.parse(value) as T;
    }
    catch (error)
    {
        throw new Error(
            `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

/**
 * Create a typed JSON parser
 *
 * @returns Parser function
 *
 * @example
 * ```typescript
 * interface Config {
 *   host: string;
 *   port: number;
 * }
 *
 * const config = getEnvVar('CONFIG_JSON', {
 *   validator: createJsonParser<Config>(),
 * });
 * ```
 */
export function createJsonParser<T>(): Parser<T>
{
    return (value: string) => parseJson<T>(value);
}

// ============================================================================
// Array Parser
// ============================================================================

/**
 * Parse comma-separated values into array
 *
 * @param value - Comma-separated string
 * @param options - Parser options
 * @returns Array of strings
 *
 * @example
 * ```typescript
 * const hosts = getEnvVar('ALLOWED_HOSTS', {
 *   validator: parseArray,
 * });
 * // "localhost,example.com,api.example.com" → ['localhost', 'example.com', 'api.example.com']
 * ```
 */
export function parseArray(
    value: string,
    options: {
        separator?: string;
        trim?: boolean;
        filter?: (item: string) => boolean;
    } = {}
): string[]
{
    const { separator = ',', trim = true, filter } = options;

    if (value.trim() === '')
    {
        return [];
    }

    let items = value.split(separator);

    if (trim)
    {
        items = items.map((item) => item.trim());
    }

    if (filter)
    {
        items = items.filter(filter);
    }

    return items;
}

/**
 * Create an array parser with item parser
 *
 * @param itemParser - Parser to apply to each array item
 * @param options - Array parsing options
 * @returns Parser function
 *
 * @example
 * ```typescript
 * // Parse comma-separated ports
 * const ports = getEnvVar('PORTS', {
 *   validator: createArrayParser(
 *     createNumberParser({ min: 1, max: 65535, integer: true })
 *   ),
 * });
 * // "3000,4000,5000" → [3000, 4000, 5000]
 * ```
 */
export function createArrayParser<T>(
    itemParser: Parser<T>,
    options: { separator?: string } = {}
): Parser<T[]>
{
    return (value: string): T[] =>
    {
        const items = parseArray(value, options);

        return items.map((item, index) =>
        {
            try
            {
                return itemParser(item);
            }
            catch (error)
            {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Invalid item at index ${index}: ${message}`);
            }
        });
    };
}

// ============================================================================
// Parser Composition
// ============================================================================

/**
 * Chain multiple parsers sequentially
 *
 * Each parser receives the output of the previous parser.
 * Useful for multi-step validation/transformation.
 *
 * @param parsers - Array of parser functions
 * @returns Combined parser function
 *
 * @example
 * ```typescript
 * const apiKey = getEnvVar('API_KEY', {
 *   validator: chain(
 *     parseString,
 *     createStringParser({ minLength: 32, pattern: /^[A-Za-z0-9_-]+$/ }),
 *   ),
 * });
 * ```
 */
export function chain<T>(...parsers: Array<Parser<T>>): Parser<T>
{
    return (value: string): T =>
    {
        let result = value as any;

        for (const parser of parsers)
        {
            result = parser(result);
        }

        return result;
    };
}

/**
 * Apply parser with fallback value
 *
 * If parser throws, returns fallback instead.
 * Useful for optional environment variables with complex parsing.
 *
 * @param parser - Parser to attempt
 * @param fallback - Fallback value if parsing fails
 * @returns Parser function
 *
 * @example
 * ```typescript
 * const config = getEnvVar('CONFIG_JSON', {
 *   validator: withFallback(parseJson, { host: 'localhost', port: 3000 }),
 * });
 * ```
 */
export function withFallback<T>(parser: Parser<T>, fallback: T): Parser<T>
{
    return (value: string): T =>
    {
        try
        {
            return parser(value);
        }
        catch
        {
            return fallback;
        }
    };
}

/**
 * Make parser optional
 *
 * Returns undefined for empty strings instead of throwing.
 *
 * @param parser - Parser to make optional
 * @returns Parser function that returns T | undefined
 *
 * @example
 * ```typescript
 * const redisUrl = getEnvVar('REDIS_URL', {
 *   validator: optional(parseRedisUrl),
 * });
 * // Empty string → undefined
 * // Valid URL → parsed URL
 * // Invalid URL → throws
 * ```
 */
export function optional<T>(parser: Parser<T>): Parser<T | undefined>
{
    return (value: string): T | undefined =>
    {
        if (value.trim() === '')
        {
            return undefined;
        }

        return parser(value);
    };
}