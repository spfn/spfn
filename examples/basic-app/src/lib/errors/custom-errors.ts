/**
 * Custom Application Errors
 *
 * Shared between server and client for type-safe error handling
 */

import { SerializableError } from '@spfn/core/errors';

/**
 * Custom Business Error: Insufficient Balance
 *
 * Example of creating a custom SerializableError for business logic
 */
export class InsufficientBalanceError extends SerializableError
{
    readonly statusCode = 400;
    readonly accountId: string;
    readonly requestedAmount: number;
    readonly availableBalance: number;

    constructor(data: {
        accountId: string;
        requestedAmount: number;
        availableBalance: number;
        message?: string;
    })
    {
        super(
            data.message ||
            `Insufficient balance: requested ${data.requestedAmount}, available ${data.availableBalance}`
        );
        this.name = 'InsufficientBalanceError';
        this.accountId = data.accountId;
        this.requestedAmount = data.requestedAmount;
        this.availableBalance = data.availableBalance;
    }
}