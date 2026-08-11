/**
 * Privacy helper tests — masking and history recipient hashing, no DB.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { configureNotification } from '../config';
import {
    maskEmail,
    maskPhone,
    maskRecipient,
    maskRecipients,
    historyRecipient,
    historyRecipientFilter,
} from '../privacy';

const SECRET = 'test-history-secret';

function hmac(value: string): string
{
    return createHmac('sha256', SECRET).update(value.trim().toLowerCase()).digest('hex');
}

afterEach(() =>
{
    // history merges deep, so the reset lists every key explicitly.
    configureNotification({ history: { storeContent: true, storeRecipient: 'raw', hashSecret: undefined } });
});

describe('maskEmail', () =>
{
    it('keeps two leading characters and the domain', () =>
    {
        expect(maskEmail('jordan@example.com')).toBe('jo***@example.com');
    });

    it('keeps a single character for short local parts', () =>
    {
        expect(maskEmail('ab@example.com')).toBe('a***@example.com');
        expect(maskEmail('a@example.com')).toBe('a***@example.com');
    });

    it('falls back to opaque masking for non-address values', () =>
    {
        expect(maskEmail('not-an-email')).toBe('n***');
    });
});

describe('maskPhone', () =>
{
    it('keeps the prefix and last two digits', () =>
    {
        const masked = maskPhone('+821012345678');

        expect(masked.startsWith('+8210')).toBe(true);
        expect(masked.endsWith('78')).toBe(true);
        expect(masked).not.toContain('123456');
    });

    it('masks short values opaquely', () =>
    {
        expect(maskPhone('12345')).toBe('1***');
    });

    it('never throws or passes a value through unmasked at boundary lengths', () =>
    {
        // 6 chars used to hit '*'.repeat(-1); 7 chars used to return the input unchanged.
        expect(maskPhone('+82100')).toBe('+***');
        expect(maskPhone('1234567')).toBe('1***');
        expect(maskPhone('12345678')).toBe('12345*78');
    });
});

describe('maskRecipient / maskRecipients', () =>
{
    it('picks the mask by value shape', () =>
    {
        expect(maskRecipient('jordan@example.com')).toContain('@example.com');
        expect(maskRecipient('+821012345678')).not.toContain('@');
    });

    it('masks every entry in a list', () =>
    {
        const masked = maskRecipients(['jordan@example.com', 'casey@example.org']);

        expect(masked).toEqual(['jo***@example.com', 'ca***@example.org']);
    });
});

describe('historyRecipient', () =>
{
    it('joins raw values by default', () =>
    {
        expect(historyRecipient(['a@x.com', 'b@x.com'])).toBe('a@x.com,b@x.com');
    });

    it('stores per-recipient HMACs in hashed mode', () =>
    {
        configureNotification({ history: { storeRecipient: 'hashed', hashSecret: SECRET } });

        expect(historyRecipient(['a@x.com', 'b@x.com'])).toBe(`${hmac('a@x.com')},${hmac('b@x.com')}`);
    });

    it('hashes case-insensitively so lookups match how addresses compare', () =>
    {
        configureNotification({ history: { storeRecipient: 'hashed', hashSecret: SECRET } });

        expect(historyRecipient(['A@X.com'])).toBe(historyRecipient(['a@x.com']));
    });

    it('never stores a raw value when the secret is missing', () =>
    {
        // configureNotification refuses this combination up front…
        expect(() => configureNotification({ history: { storeRecipient: 'hashed', hashSecret: undefined } })).toThrow(/hash secret/);
        // …and the failed call must not have changed the active config.
        expect(historyRecipient(['a@x.com'])).toBe('a@x.com');
    });

    it('keeps hashed mode across a later partial configure call', () =>
    {
        configureNotification({ history: { storeRecipient: 'hashed', hashSecret: SECRET } });
        configureNotification({ history: { storeContent: false } });

        expect(historyRecipient(['a@x.com'])).toBe(hmac('a@x.com'));
    });
});

describe('historyRecipientFilter', () =>
{
    it('passes values through in raw mode', () =>
    {
        expect(historyRecipientFilter('a@x.com')).toBe('a@x.com');
    });

    it('transforms filters exactly like stored values', () =>
    {
        configureNotification({ history: { storeRecipient: 'hashed', hashSecret: SECRET } });

        expect(historyRecipientFilter('a@x.com,b@x.com')).toBe(historyRecipient(['a@x.com', 'b@x.com']));
    });
});
