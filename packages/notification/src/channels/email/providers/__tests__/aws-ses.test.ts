/**
 * SES provider failure path — a rejection that quotes the recipient must not
 * put that address into the log line or into the returned SendResult.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const ADDRESS = 'learner@example.com';
const REJECTION = 'Email address is not verified. The following identities '
    + `failed the check in region US-EAST-1: ${ADDRESS}`;

// Hoisted: vi.mock factories run before module-level consts are initialised.
const { send, errorLog } = vi.hoisted(() => ({ send: vi.fn(), errorLog: vi.fn() }));

vi.mock('@aws-sdk/client-sesv2', () => ({
    SESv2Client: class
    {
        send = send;
    },
    SendEmailCommand: class
    {
        input: unknown;

        constructor(input: unknown)
        {
            this.input = input;
        }
    },
}));

vi.mock('@spfn/core/logger', () => ({
    logger: {
        child: () => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: errorLog,
        }),
    },
}));

import { awsSesProvider } from '../aws-ses';

const PARAMS = { to: [ADDRESS], from: 'noreply@app.example.com', subject: 'Hi', text: 'Hello' };

beforeEach(() =>
{
    send.mockReset();
    errorLog.mockClear();
});

describe('awsSesProvider failure', () =>
{
    it('scrubs the address out of the returned error and the log', async () =>
    {
        const rejection = Object.assign(new Error(REJECTION), {
            name: 'MessageRejected',
            $metadata: { httpStatusCode: 400 },
        });
        send.mockRejectedValue(rejection);

        const result = await awsSesProvider.send(PARAMS);

        expect(result.success).toBe(false);
        expect(result.error).not.toContain(ADDRESS);
        expect(result.error).toContain('le***@example.com');
        expect(result.error).toContain('US-EAST-1');

        expect(errorLog).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(errorLog.mock.calls[0])).not.toContain(ADDRESS);
    });

    it('logs the error name and status as context, not the Error object', async () =>
    {
        send.mockRejectedValue(Object.assign(new Error(REJECTION), {
            name: 'MessageRejected',
            $metadata: { httpStatusCode: 400 },
        }));

        await awsSesProvider.send(PARAMS);

        const [message, context] = errorLog.mock.calls[0];

        expect(message).toBe('SES send failed');
        expect(context).toMatchObject({ provider: 'aws-ses', name: 'MessageRejected', status: 400 });
        // A plain object, so the logger treats it as context and never prints a
        // stack whose first line would repeat the address.
        expect(context).not.toBeInstanceOf(Error);
        expect('stack' in context).toBe(false);
        expect(errorLog.mock.calls[0]).toHaveLength(2);
        expect(context.to).toEqual(['le***@example.com']);
    });

    it('falls back to "Unknown error" when a non-Error is thrown', async () =>
    {
        send.mockRejectedValue('boom');

        const result = await awsSesProvider.send(PARAMS);

        expect(result).toEqual({ success: false, error: 'Unknown error' });
    });
});
