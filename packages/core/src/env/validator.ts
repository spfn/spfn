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

        if (protocol === 'https' && url.protocol !== 'https:')
        {
            return false;
        }

        return true;
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

    if (max !== undefined && num > max)
    {
        return false;
    }

    return true;
}

/**
 * Create a number validator with specific constraints
 *
 * @param options - Validation constraints
 * @returns Validator function
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