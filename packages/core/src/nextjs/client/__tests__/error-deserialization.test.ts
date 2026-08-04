/**
 * 클라이언트가 에러를 복원할 때 봉투는 에러 데이터가 아니다 (issue #58)
 *
 * 에러 응답은 이제 `error: { code, message, requestId }`를 함께 싣는다. 그것은 전송 계층의
 * 정보이지 에러의 필드가 아니다. 문서가 안내하는 Object.assign(this, data) 형태로 만든 에러
 * 클래스에 그대로 넘기면 인스턴스가 `error`라는 예약 필드를 갖게 되고, 그 인스턴스를 서버가
 * 다시 던지는 순간 직렬화가 거절된다.
 */

import { describe, it, expect } from 'vitest';

import { ErrorRegistry, SerializableError } from '../../../errors';
import { handleErrorResponse } from '../helpers';
import { logger } from '../../../logger';

class PaymentFailedError extends SerializableError
{
    readonly statusCode = 402;
    transactionId!: string;

    constructor(data: { message?: string; transactionId?: string } = {})
    {
        super(data.message ?? 'payment failed');
        this.name = 'PaymentFailedError';
        Object.assign(this, data);
    }
}

describe('handleErrorResponse', () =>
{
    const registry = new ErrorRegistry([PaymentFailedError]);

    const body = {
        __type: 'PaymentFailedError',
        message: 'card declined',
        transactionId: 'tx_88',
        error: { code: 'PaymentFailedError', message: 'card declined', requestId: 'abc' },
    };

    async function thrownBy(): Promise<any>
    {
        try
        {
            await handleErrorResponse(
                new Response(null, { status: 402 }),
                body,
                'https://example.test/pay',
                registry,
                false,
                logger,
            );
        }
        catch (error)
        {
            return error;
        }
    }

    it('restores the error class and its own fields', async () =>
    {
        const error = await thrownBy();

        expect(error).toBeInstanceOf(PaymentFailedError);
        expect(error.transactionId).toBe('tx_88');
        expect(error.message).toBe('card declined');
    });

    it('keeps the envelope out of the restored instance, so re-throwing it still serializes', async () =>
    {
        const error = await thrownBy();

        expect(error.error).toBeUndefined();
        expect(() => error.toJSON()).not.toThrow();
    });
});
