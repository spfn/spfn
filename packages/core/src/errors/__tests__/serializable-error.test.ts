/**
 * SerializableError 직렬화 테스트
 *
 * 응답 본문의 자리를 두고 다투는 필드 이름을 예약어로 막는 규칙을 고정한다.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { SerializableError } from '../serializable-error';

class PaymentFailedError extends SerializableError
{
    readonly statusCode = 402;
    transactionId!: string;

    constructor(data: { message: string; transactionId: string })
    {
        super(data.message);
        this.name = 'PaymentFailedError';
        Object.assign(this, data);
    }
}

class ErrorFieldError extends SerializableError
{
    readonly statusCode = 400;
    error!: { vendorCode: string };

    constructor()
    {
        super('vendor refused');
        this.name = 'ErrorFieldError';
        this.error = { vendorCode: 'V1' };
    }
}

class TypeFieldError extends SerializableError
{
    readonly statusCode = 400;
    __type!: string;

    constructor()
    {
        super('spoofed');
        this.name = 'TypeFieldError';
        this.__type = 'SomethingElse';
    }
}

describe('SerializableError.toJSON', () =>
{
    const originalEnv = process.env.NODE_ENV;

    afterEach(() =>
    {
        process.env.NODE_ENV = originalEnv;
        vi.restoreAllMocks();
    });

    it('serializes public fields next to __type and message', () =>
    {
        const json = new PaymentFailedError({ message: 'card declined', transactionId: 'tx_88' }).toJSON();

        expect(json).toEqual({
            __type: 'PaymentFailedError',
            message: 'card declined',
            transactionId: 'tx_88',
        });
    });

    it('throws while authoring on a field named error, while it can still be renamed', () =>
    {
        process.env.NODE_ENV = 'test';

        expect(() => new ErrorFieldError().toJSON()).toThrow(/reserved field "error"/);
    });

    it('throws while authoring on a field named __type', () =>
    {
        process.env.NODE_ENV = 'test';

        expect(() => new TypeFieldError().toJSON()).toThrow(/reserved field "__type"/);
    });

    it('drops the field in staging too — a deployment must not answer with a bare 500', () =>
    {
        process.env.NODE_ENV = 'staging';

        const json = new ErrorFieldError().toJSON();

        expect(json).toEqual({ __type: 'ErrorFieldError', message: 'vendor refused' });
    });

    it('drops the field in production instead of replacing the real failure with this one', () =>
    {
        process.env.NODE_ENV = 'production';

        const json = new ErrorFieldError().toJSON();

        expect(json).toEqual({ __type: 'ErrorFieldError', message: 'vendor refused' });
    });

    it('never lets a reserved field overwrite the discriminator in production', () =>
    {
        process.env.NODE_ENV = 'production';

        expect(new TypeFieldError().toJSON().__type).toBe('TypeFieldError');
    });
});
