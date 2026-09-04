/**
 * The channel scrubs at the provider boundary, so a custom adopter provider
 * gets the same guarantee as the built-in ones: neither the log line nor the
 * history row sees the address the provider quoted back.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/notification.service', () => ({
    createNotificationRecord: vi.fn(async () => ({ id: 1 })),
    createNotificationRecords: vi.fn(async () => [{ id: 1 }]),
    markNotificationSent: vi.fn(async () => undefined),
    markNotificationFailed: vi.fn(async () => undefined),
    markManySent: vi.fn(async () => undefined),
    markManyFailed: vi.fn(async () => undefined),
}));

import { sendEmail, registerEmailProvider } from '../index';
import { markNotificationFailed } from '../../../services/notification.service';
import { configureNotification } from '../../../config';
import { registerBuiltinTemplates } from '../../../templates';

const ADDRESS = 'learner@example.com';
const REJECTION = `Email address is not verified. The following identities failed the check in region US-EAST-1: ${ADDRESS}`;
const SCRUBBED = 'Email address is not verified. The following identities failed the check in region US-EAST-1: le***@example.com';

registerBuiltinTemplates();
registerEmailProvider({
    name: 'aws-ses',
    send: async () => ({ success: false, error: REJECTION }),
});

const failed = vi.mocked(markNotificationFailed);

beforeEach(() =>
{
    failed.mockClear();
    configureNotification({ enableHistory: true, history: { storeContent: true, storeRecipient: 'raw', hashSecret: undefined } });
});

describe('provider error scrubbing at the channel boundary', () =>
{
    it('returns the scrubbed message and writes it to history', async () =>
    {
        const result = await sendEmail({ to: ADDRESS, subject: 'Hi', text: 'Hello' });

        expect(result.error).toBe(SCRUBBED);

        // History update is fire-and-forget, so let the microtask queue drain.
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(failed).toHaveBeenCalledWith(1, SCRUBBED);
    });
});
