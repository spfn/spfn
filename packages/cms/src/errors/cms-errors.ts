/**
 * CMS Error Classes
 *
 * Custom error classes for CMS-specific scenarios
 */

import {
    ValidationError,
    NotFoundError,
    ConflictError,
    ForbiddenError,
    InternalServerError,
} from '@spfn/core/errors';

/**
 * Label Not Found Error (404)
 *
 * Thrown when a CMS label does not exist
 */
export class LabelNotFoundError extends NotFoundError
{
    constructor(data: { labelKey?: string; labelId?: number; message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'Label not found',
            details: {
                labelKey: data.labelKey,
                labelId: data.labelId,
                ...data.details,
            },
        });
        this.name = 'LabelNotFoundError';
    }
}

/**
 * Label Value Not Found Error (404)
 *
 * Thrown when a CMS label value does not exist
 */
export class LabelValueNotFoundError extends NotFoundError
{
    constructor(data: { labelKey?: string; locale?: string; valueId?: number; message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'Label value not found',
            details: {
                labelKey: data.labelKey,
                locale: data.locale,
                valueId: data.valueId,
                ...data.details,
            },
        });
        this.name = 'LabelValueNotFoundError';
    }
}

/**
 * Locale Not Found Error (404)
 *
 * Thrown when requested locale does not exist in the system
 */
export class LocaleNotFoundError extends NotFoundError
{
    constructor(data: { locale?: string; message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'Locale not found',
            details: {
                locale: data.locale,
                ...data.details,
            },
        });
        this.name = 'LocaleNotFoundError';
    }
}

/**
 * Published Cache Not Found Error (404)
 *
 * Thrown when published cache does not exist
 */
export class PublishedCacheNotFoundError extends NotFoundError
{
    constructor(data: { locale?: string; message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'Published cache not found',
            details: {
                locale: data.locale,
                ...data.details,
            },
        });
        this.name = 'PublishedCacheNotFoundError';
    }
}

/**
 * Duplicate Label Error (409)
 *
 * Thrown when trying to create a label with existing key
 */
export class DuplicateLabelError extends ConflictError
{
    constructor(data: { labelKey?: string; message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'Label already exists',
            details: {
                labelKey: data.labelKey,
                ...data.details,
            },
        });
        this.name = 'DuplicateLabelError';
    }
}

/**
 * Duplicate Label Value Error (409)
 *
 * Thrown when trying to create a label value that already exists
 */
export class DuplicateLabelValueError extends ConflictError
{
    constructor(data: { labelKey?: string; locale?: string; message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'Label value already exists for this locale',
            details: {
                labelKey: data.labelKey,
                locale: data.locale,
                ...data.details,
            },
        });
        this.name = 'DuplicateLabelValueError';
    }
}

/**
 * Invalid Locale Error (400)
 *
 * Thrown when locale format is invalid or not supported
 */
export class InvalidLocaleError extends ValidationError
{
    constructor(data: { locale?: string; message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'Invalid locale',
            details: {
                locale: data.locale,
                ...data.details,
            },
        });
        this.name = 'InvalidLocaleError';
    }
}

/**
 * Invalid Label Key Error (400)
 *
 * Thrown when label key format is invalid
 */
export class InvalidLabelKeyError extends ValidationError
{
    constructor(data: { labelKey?: string; message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'Invalid label key format',
            details: {
                labelKey: data.labelKey,
                ...data.details,
            },
        });
        this.name = 'InvalidLabelKeyError';
    }
}

/**
 * Invalid Published Cache Error (400)
 *
 * Thrown when published cache data is malformed or corrupted
 */
export class InvalidPublishedCacheError extends ValidationError
{
    constructor(data: { locale?: string; reason?: string; message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'Invalid published cache data',
            details: {
                locale: data.locale,
                reason: data.reason,
                ...data.details,
            },
        });
        this.name = 'InvalidPublishedCacheError';
    }
}

/**
 * CMS Operation Failed Error (500)
 *
 * Thrown when CMS operation fails unexpectedly
 */
export class CMSOperationFailedError extends InternalServerError
{
    constructor(data: { operation?: string; resource?: string; message?: string; details?: Record<string, any> } = {})
    {
        const operation = data.operation || 'operation';
        const resource = data.resource || 'resource';
        super({
            message: data.message || `Failed to ${operation} ${resource}`,
            details: {
                operation,
                resource,
                ...data.details,
            },
        });
        this.name = 'CMSOperationFailedError';
    }
}

/**
 * Insufficient CMS Permissions Error (403)
 *
 * Thrown when user lacks required CMS permissions
 */
export class InsufficientCMSPermissionsError extends ForbiddenError
{
    constructor(data: { requiredPermissions?: string[]; resource?: string; message?: string; details?: Record<string, any> } = {})
    {
        const requiredPermissions = data.requiredPermissions || [];
        super({
            message: data.message || `Missing required CMS permissions: ${requiredPermissions.join(', ')}`,
            details: {
                requiredPermissions,
                resource: data.resource,
                ...data.details,
            },
        });
        this.name = 'InsufficientCMSPermissionsError';
    }
}
