'use client';

/**
 * Error Handling Test Page
 *
 * Tests type-safe error deserialization with instanceof checks
 */

import { useState } from 'react';
import { api } from '@/lib/api-client';
import {
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    UnprocessableEntityError,
    ValidationError,
} from '@spfn/core/errors';
import { InsufficientBalanceError } from '@/lib/errors/custom-errors';

export default function ErrorTestPage()
{
    const [result, setResult] = useState<string>('');
    const [loading, setLoading] = useState(false);

    async function testError(name: string, fn: () => Promise<any>)
    {
        setLoading(true);
        setResult(`Testing ${name}...`);

        try
        {
            await fn();
            setResult(`❌ ${name}: Expected error but got success`);
        }
        catch (error)
        {
            const results: string[] = [];
            results.push(`✅ ${name}: Error caught`);
            results.push(`   Type: ${error instanceof Error ? error.constructor.name : typeof error}`);
            results.push(`   Message: ${error instanceof Error ? error.message : String(error)}`);

            // Type checks
            if (error instanceof NotFoundError)
            {
                results.push(`   ✅ instanceof NotFoundError: true`);
                results.push(`   Details: ${JSON.stringify(error.details)}`);
            }
            else if (error instanceof UnauthorizedError)
            {
                results.push(`   ✅ instanceof UnauthorizedError: true`);
                results.push(`   Details: ${JSON.stringify(error.details)}`);
            }
            else if (error instanceof ForbiddenError)
            {
                results.push(`   ✅ instanceof ForbiddenError: true`);
                results.push(`   Details: ${JSON.stringify(error.details)}`);
            }
            else if (error instanceof ConflictError)
            {
                results.push(`   ✅ instanceof ConflictError: true`);
                results.push(`   Details: ${JSON.stringify(error.details)}`);
            }
            else if (error instanceof UnprocessableEntityError)
            {
                results.push(`   ✅ instanceof UnprocessableEntityError: true`);
                results.push(`   Details: ${JSON.stringify(error.details)}`);
            }
            else if (error instanceof InsufficientBalanceError)
            {
                results.push(`   ✅ instanceof InsufficientBalanceError: true`);
                results.push(`   Account ID: ${error.accountId}`);
                results.push(`   Requested: ${error.requestedAmount}`);
                results.push(`   Available: ${error.availableBalance}`);
            }
            else if (error instanceof ValidationError)
            {
                results.push(`   ✅ instanceof ValidationError: true`);
                results.push(`   Fields: ${JSON.stringify(error.fields)}`);
            }
            else
            {
                results.push(`   ❌ Unknown error type (deserialization may have failed)`);
            }

            console.error(`Error details:`, error);

            setResult(results.join('\n'));
        }
        finally
        {
            setLoading(false);
        }
    }

    const tests = [
        {
            name: 'NotFoundError',
            fn: () => api.errorNotFound.query({ resourceId: 'test-123' }).call(),
        },
        {
            name: 'UnauthorizedError',
            fn: () => api.errorUnauthorized.call(),
        },
        {
            name: 'ForbiddenError',
            fn: () => api.errorForbidden.query({ resource: 'admin' }).call(),
        },
        {
            name: 'ConflictError',
            fn: () => api.errorConflict.body({ email: 'test@example.com' }).call(),
        },
        {
            name: 'UnprocessableEntityError',
            fn: () => api.errorUnprocessable.body({ password: 'weak' }).call(),
        },
        {
            name: 'InsufficientBalanceError (Custom)',
            fn: () => api.errorCustom.body({ accountId: 'acc_123', amount: 999.99 }).call(),
        },
    ];

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold mb-8">Error Handling Type Safety Test</h1>

                <p className="text-zinc-600 dark:text-zinc-400 mb-8">
                    이 페이지는 SPFN의 type-safe error serialization 시스템을 테스트합니다.
                    각 버튼을 클릭하면 서버에서 에러가 발생하고, 클라이언트에서 자동으로 deserialize되어
                    instanceof 체크가 가능한지 확인합니다.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {tests.map((test) => (
                        <button
                            key={test.name}
                            onClick={() => testError(test.name, test.fn)}
                            disabled={loading}
                            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors text-left"
                        >
                            Test {test.name}
                        </button>
                    ))}
                </div>

                {result && (
                    <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 border border-zinc-200 dark:border-zinc-800">
                        <h2 className="text-xl font-semibold mb-4">Test Result:</h2>
                        <pre className="text-sm font-mono whitespace-pre-wrap overflow-x-auto">
                            {result}
                        </pre>
                    </div>
                )}

                <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <h3 className="font-semibold mb-2">Expected Behavior:</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                        <li>Each error should be caught by try/catch</li>
                        <li>instanceof checks should return true for the correct error type</li>
                        <li>Error properties (details, fields, etc.) should be accessible</li>
                        <li>Custom error properties (accountId, requestedAmount, etc.) should be preserved</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}