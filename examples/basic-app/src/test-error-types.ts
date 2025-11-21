/**
 * Error Type Safety Test
 *
 * This file tests TypeScript type checking for error handling
 * Run: pnpm tsc --noEmit src/test-error-types.ts
 */

import { api } from '@/lib/api-client';
import {
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    UnprocessableEntityError,
    ValidationError,
} from '@spfn/core/errors';
import { ApiError } from '@spfn/core/client/nextjs';
import { InsufficientBalanceError } from '@/lib/errors/custom-errors';

async function testErrorTypeChecking()
{
    // Test 1: NotFoundError
    try
    {
        await api.errorNotFound.query({ resourceId: 'test' }).call();
    }
    catch (error)
    {
        if (error instanceof NotFoundError)
        {
            // ✅ Type narrowing works
            console.log(error.message);
            console.log(error.statusCode); // Should be 404
            console.log(error.details); // Should be accessible

            // @ts-expect-error - This property doesn't exist on NotFoundError
            console.log(error.accountId);
        }
    }

    // Test 2: Custom InsufficientBalanceError
    try
    {
        await api.errorCustom.body({ accountId: 'acc_123', amount: 999 }).call();
    }
    catch (error)
    {
        if (error instanceof InsufficientBalanceError)
        {
            // ✅ Custom error properties should be accessible
            console.log(error.accountId); // string
            console.log(error.requestedAmount); // number
            console.log(error.availableBalance); // number
            console.log(error.statusCode); // 400

            // @ts-expect-error - This property doesn't exist on InsufficientBalanceError
            console.log(error.fields);
        }
    }

    // Test 3: ValidationError
    try
    {
        await api.errorUnprocessable.body({ password: 'weak' }).call();
    }
    catch (error)
    {
        if (error instanceof ValidationError)
        {
            // ✅ fields property should be accessible
            console.log(error.fields); // Array<{ path: string; message: string; value?: any }>

            // Type-safe field access
            error.fields?.forEach(field =>
            {
                console.log(field.path); // string
                console.log(field.message); // string
                console.log(field.value); // any
            });
        }
    }

    // Test 4: Union type handling
    try
    {
        await api.errorNotFound.call();
    }
    catch (error)
    {
        // ✅ Type-safe error discrimination
        if (error instanceof NotFoundError)
        {
            console.log('Not found:', error.details);
        }
        else if (error instanceof UnauthorizedError)
        {
            console.log('Unauthorized:', error.details);
        }
        else if (error instanceof ForbiddenError)
        {
            console.log('Forbidden:', error.details);
        }
        else if (error instanceof ConflictError)
        {
            console.log('Conflict:', error.details);
        }
        else if (error instanceof InsufficientBalanceError)
        {
            console.log('Insufficient balance:', error.availableBalance);
        }
        else if (error instanceof ValidationError)
        {
            console.log('Validation failed:', error.fields);
        }
        else if (error instanceof ApiError)
        {
            // Fallback to generic ApiError
            console.log('API Error:', error.status, error.url);
        }
        else
        {
            // Unknown error
            console.log('Unknown error:', error);
        }
    }

    // Test 5: Verify toJSON serialization format
    try
    {
        await api.errorCustom.body({ accountId: 'test', amount: 1000 }).call();
    }
    catch (error)
    {
        if (error instanceof InsufficientBalanceError)
        {
            // Verify error can be serialized
            const serialized = JSON.parse(JSON.stringify(error));

            // Should have __type field
            console.log(serialized.__type); // 'InsufficientBalanceError'
            console.log(serialized.message);
            console.log(serialized.accountId);
            console.log(serialized.requestedAmount);
            console.log(serialized.availableBalance);
        }
    }
}

// Test 6: Verify error registry exports
import { errorRegistry } from '@/lib/api-client';

// ✅ errorRegistry should be exported
console.log(errorRegistry.getRegisteredTypes());

// Can register custom errors
class CustomBusinessError extends NotFoundError
{
    constructor(data: any)
    {
        super(data);
        this.name = 'CustomBusinessError';
    }
}

errorRegistry.register(CustomBusinessError);

console.log('✅ All type checks passed!');

export {};