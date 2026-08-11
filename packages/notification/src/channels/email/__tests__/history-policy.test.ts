/**
 * History storage policy tests — what a send writes into its history row,
 * with the DB layer mocked out.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../services/notification.service', () => ({
    createNotificationRecord: vi.fn(async () => ({ id: 1 })),
    createNotificationRecords: vi.fn(async () => [{ id: 1 }]),
    markNotificationSent: vi.fn(async () => undefined),
    markNotificationFailed: vi.fn(async () => undefined),
    markManySent: vi.fn(async () => undefined),
    markManyFailed: vi.fn(async () => undefined),
}));

import { sendEmail, registerEmailProvider } from '../index';
import { createNotificationRecord } from '../../../services/notification.service';
import { configureNotification } from '../../../config';
import { registerBuiltinTemplates } from '../../../templates';

registerBuiltinTemplates();
registerEmailProvider({
    name: 'aws-ses',
    send: async () => ({ success: true, messageId: 'mock-id' }),
});

const created = vi.mocked(createNotificationRecord);

// history merges deep in configureNotification, so resets list every key.
const HISTORY_RESET = { storeContent: true, storeRecipient: 'raw' as const, hashSecret: undefined };

beforeEach(() =>
{
    created.mockClear();
    configureNotification({ enableHistory: true, history: HISTORY_RESET });
});

afterEach(() =>
{
    configureNotification({ enableHistory: false, history: HISTORY_RESET });
});

describe('history storage policy', () =>
{
    it('stores content and template data for a normal send', async () =>
    {
        await sendEmail({ to: 'a@x.com', subject: 'Hi', text: 'Hello' });

        expect(created).toHaveBeenCalledWith(expect.objectContaining({
            recipient: 'a@x.com',
            content: 'Hello',
        }));
    });

    it('keeps content and template data out for a sensitive send', async () =>
    {
        await sendEmail({
            to: 'a@x.com',
            subject: 'Link',
            text: 'https://app.example.com/access#token=secret',
            sensitive: true,
        });

        const row = created.mock.calls[0][0];

        expect(row.content).toBeUndefined();
        expect(row.templateData).toBeUndefined();
    });

    it('treats a sensitive template as a sensitive send', async () =>
    {
        await sendEmail({
            to: 'a@x.com',
            template: 'verification-code',
            data: { code: '123456' },
        });

        const row = created.mock.calls[0][0];

        expect(row.content).toBeUndefined();
        expect(row.templateData).toBeUndefined();
        // The verification subject line carries the code itself.
        expect(row.subject).toBeUndefined();
        expect(row.templateName).toBe('verification-code');
    });

    it('lets a per-send override beat the template declaration', async () =>
    {
        await sendEmail({
            to: 'a@x.com',
            template: 'verification-code',
            data: { code: '123456' },
            sensitive: false,
        });

        const row = created.mock.calls[0][0];

        expect(row.content).toBeDefined();
        expect(row.templateData).toEqual({ code: '123456' });
    });

    it('honours history.storeContent = false for every send', async () =>
    {
        configureNotification({ history: { storeContent: false } });

        await sendEmail({ to: 'a@x.com', subject: 'Hi', text: 'Hello' });

        const row = created.mock.calls[0][0];

        expect(row.content).toBeUndefined();
        expect(row.templateData).toBeUndefined();
        expect(row.subject).toBe('Hi');
    });

    it('stores an HMAC recipient in hashed mode', async () =>
    {
        configureNotification({ history: { storeRecipient: 'hashed', hashSecret: 's3cret' } });

        await sendEmail({ to: 'a@x.com', subject: 'Hi', text: 'Hello' });

        const row = created.mock.calls[0][0];

        expect(row.recipient).not.toContain('a@x.com');
        expect(row.recipient).toMatch(/^[0-9a-f]{64}$/);
    });
});
