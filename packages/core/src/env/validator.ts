/**
 * Environment Variable Management - Validators
 *
 * Common validation functions for environment variables
 */

/**
 * Validate that a value is a valid URL
 *
 * @param value - Value to validate
 * @param options - Validation options
 * @returns True if valid URL, false otherwise
 * @deprecated Use parseUrl instead for better type safety and error messages
 *
 * @example
 * ```typescript
 * const apiUrl = getEnvVar('API_URL', {
 *   validator: validateUrl,
 * });
 * ```
 */
export function validateUrl(
    value: string,
    options: { protocol?: 'http' | 'https' | 'any' } = {}
): boolean
{
    const { protocol = 'any' } = options;

    try
    {
        const url = new URL(value);

        if (protocol === 'http' && url.protocol !== 'http:')
        {
            return false;
        }

        return !(protocol === 'https' && url.protocol !== 'https:');
    }
    catch
    {
        return false;
    }
}

/**
 * Create a URL validator with specific protocol requirement
 *
 * @param protocol - Required protocol ('http', 'https', or 'any')
 * @returns Validator function
 * @deprecated Use createUrlParser instead for better type safety and error messages
 *
 * @example
 * ```typescript
 * const apiUrl = getEnvVar('API_URL', {
 *   validator: createUrlValidator('https'),
 *   validationError: 'API_URL must use HTTPS',
 * });
 * ```
 */
export function createUrlValidator(protocol: 'http' | 'https' | 'any' = 'any')
{
    return (value: string) => validateUrl(value, { protocol });
}

/**
 * Validate that a value is a valid number
 *
 * @param value - Value to validate
 * @param options - Validation options
 * @returns True if valid number, false otherwise
 * @deprecated Use parseNumber instead for better type safety and error messages
 *
 * @example
 * ```typescript
 * const port = getEnvVar('PORT', {
 *   validator: (val) => validateNumber(val, { min: 1, max: 65535 }),
 * });
 * ```
 */
export function validateNumber(
    value: string,
    options: { min?: number; max?: number; integer?: boolean } = {}
): boolean
{
    const { min, max, integer = false } = options;

    // Reject empty strings (Number('') returns 0 which is misleading)
    if (value.trim() === '')
    {
        return false;
    }

    const num = Number(value);

    if (isNaN(num))
    {
        return false;
    }

    if (integer && !Number.isInteger(num))
    {
        return false;
    }

    if (min !== undefined && num < min)
    {
        return false;
    }

    return !(max !== undefined && num > max);
}

/**
 * Create a number validator with specific constraints
 *
 * @param options - Validation constraints
 * @returns Validator function
 * @deprecated Use createNumberParser instead for better type safety and error messages
 *
 * @example
 * ```typescript
 * const port = getEnvVar('PORT', {
 *   validator: createNumberValidator({ min: 1, max: 65535, integer: true }),
 *   validationError: 'PORT must be an integer between 1 and 65535',
 * });
 * ```
 */
export function createNumberValidator(
    options: { min?: number; max?: number; integer?: boolean } = {}
)
{
    return (value: string) => validateNumber(value, options);
}

/**
 * Validate that a value is a valid boolean string
 *
 * @param value - Value to validate
 * @returns True if valid boolean string, false otherwise
 *
 * @example
 * ```typescript
 * const debugMode = getEnvVar('DEBUG', {
 *   validator: validateBoolean,
 * });
 * ```
 */
export function validateBoolean(value: string): boolean
{
    const normalized = value.toLowerCase().trim();
    return ['true', 'false', '1', '0', 'yes', 'no'].includes(normalized);
}

/**
 * Parse a boolean environment variable
 *
 * @param value - Value to parse
 * @returns Boolean value
 *
 * @example
 * ```typescript
 * const debug = parseBoolean(getEnvVar('DEBUG', { default: 'false' })!);
 * ```
 */
export function parseBoolean(value: string): boolean
{
    const normalized = value.toLowerCase().trim();
    return ['true', '1', 'yes'].includes(normalized);
}

/**
 * Validate that a value is one of allowed options
 *
 * @param value - Value to validate
 * @param allowed - Array of allowed values
 * @param caseInsensitive - Whether to perform case-insensitive comparison
 * @returns True if value is in allowed list, false otherwise
 * @deprecated Use parseEnum instead for better type safety and error messages
 *
 * @example
 * ```typescript
 * const env = getEnvVar('NODE_ENV', {
 *   validator: (val) => validateEnum(val, ['development', 'production', 'test']),
 * });
 * ```
 */
export function validateEnum(
    value: string,
    allowed: string[],
    caseInsensitive = false
): boolean
{
    if (caseInsensitive)
    {
        const normalizedValue = value.toLowerCase();
        const normalizedAllowed = allowed.map((v) => v.toLowerCase());
        return normalizedAllowed.includes(normalizedValue);
    }

    return allowed.includes(value);
}

/**
 * Create an enum validator with specific allowed values
 *
 * @param allowed - Array of allowed values
 * @param caseInsensitive - Whether to perform case-insensitive comparison
 * @returns Validator function
 * @deprecated Use createEnumParser instead for better type safety and error messages
 *
 * @example
 * ```typescript
 * const logLevel = getEnvVar('LOG_LEVEL', {
 *   validator: createEnumValidator(['debug', 'info', 'warn', 'error']),
 *   validationError: 'LOG_LEVEL must be one of: debug, info, warn, error',
 * });
 * ```
 */
export function createEnumValidator(allowed: string[], caseInsensitive = false)
{
    return (value: string) => validateEnum(value, allowed, caseInsensitive);
}

/**
 * Validate that a value matches a regular expression
 *
 * @param value - Value to validate
 * @param pattern - Regular expression pattern
 * @returns True if value matches pattern, false otherwise
 *
 * @example
 * ```typescript
 * const apiKey = getEnvVar('API_KEY', {
 *   validator: (val) => validatePattern(val, /^[A-Za-z0-9_-]{32}$/),
 * });
 * ```
 */
export function validatePattern(value: string, pattern: RegExp): boolean
{
    return pattern.test(value);
}

/**
 * Create a pattern validator with specific regex
 *
 * @param pattern - Regular expression pattern
 * @returns Validator function
 *
 * @example
 * ```typescript
 * const apiKey = getEnvVar('API_KEY', {
 *   validator: createPatternValidator(/^[A-Za-z0-9_-]{32}$/),
 *   validationError: 'API_KEY must be 32 alphanumeric characters',
 * });
 * ```
 */
export function createPatternValidator(pattern: RegExp)
{
    return (value: string) => validatePattern(value, pattern);
}

/**
 * Validate that a value is not empty
 *
 * @param value - Value to validate
 * @returns True if not empty, false otherwise
 *
 * @example
 * ```typescript
 * const name = getEnvVar('APP_NAME', {
 *   validator: validateNotEmpty,
 * });
 * ```
 */
export function validateNotEmpty(value: string): boolean
{
    return value.trim().length > 0;
}

/**
 * Validate that a value has minimum length
 *
 * @param value - Value to validate
 * @param minLength - Minimum required length
 * @returns True if meets minimum length, false otherwise
 *
 * @example
 * ```typescript
 * const password = getEnvVar('DB_PASSWORD', {
 *   validator: (val) => validateMinLength(val, 8),
 * });
 * ```
 */
export function validateMinLength(value: string, minLength: number): boolean
{
    return value.length >= minLength;
}

/**
 * Create a minimum length validator
 *
 * @param minLength - Minimum required length
 * @returns Validator function
 *
 * @example
 * ```typescript
 * const password = getEnvVar('DB_PASSWORD', {
 *   validator: createMinLengthValidator(8),
 *   validationError: 'DB_PASSWORD must be at least 8 characters',
 * });
 * ```
 */
export function createMinLengthValidator(minLength: number)
{
    return (value: string) => validateMinLength(value, minLength);
}

/**
 * Combine multiple validators with AND logic
 *
 * @param validators - Array of validator functions
 * @returns Combined validator function
 *
 * @example
 * ```typescript
 * const port = getEnvVar('PORT', {
 *   validator: combineValidators([
 *     validateNotEmpty,
 *     createNumberValidator({ min: 1, max: 65535, integer: true }),
 *   ]),
 * });
 * ```
 */
export function combineValidators(validators: Array<(value: string) => boolean>)
{
    return (value: string) => validators.every((validator) => validator(value));
}

/**
 * Validate PostgreSQL connection string
 *
 * @param value - Value to validate
 * @returns True if valid PostgreSQL URL, false otherwise
 * @deprecated Use parsePostgresUrl instead for better type safety and error messages
 *
 * @example
 * ```typescript
 * const dbUrl = getEnvVar('DATABASE_URL', {
 *   validator: validatePostgresUrl,
 * });
 * ```
 */
export function validatePostgresUrl(value: string): boolean
{
    try
    {
        const url = new URL(value);
        return url.protocol === 'postgres:' || url.protocol === 'postgresql:';
    }
    catch
    {
        return false;
    }
}

/**
 * Validate Redis connection string
 *
 * @param value - Value to validate
 * @returns True if valid Redis URL, false otherwise
 * @deprecated Use parseRedisUrl instead for better type safety and error messages
 *
 * @example
 * ```typescript
 * const redisUrl = getEnvVar('REDIS_URL', {
 *   validator: validateRedisUrl,
 * });
 * ```
 */
export function validateRedisUrl(value: string): boolean
{
    try
    {
        const url = new URL(value);
        return url.protocol === 'redis:' || url.protocol === 'rediss:';
    }
    catch
    {
        return false;
    }
}

// ============================================================================
// Parser Functions (Transform + Validate)
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
 *   validator: parseUrl({ protocol: 'https' }),
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
export function createUrlParser(protocol: 'http' | 'https' | 'any' = 'any')
{
    return (value: string) => parseUrl(value, { protocol });
}

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
 *   validator: parseNumber({ min: 1, max: 65535, integer: true }),
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
)
{
    return (value: string) => parseNumber(value, options);
}

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
 *   validator: parseEnum(['development', 'production', 'test']),
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
export function createEnumParser(allowed: string[], caseInsensitive = false)
{
    return (value: string) => parseEnum(value, allowed, caseInsensitive);
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