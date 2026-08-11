/**
 * @spfn/notification - Privacy helpers
 *
 * A recipient value (email address, phone number) identifies a person, and a
 * rendered body can carry a live credential (magic link, OTP code). These
 * helpers keep both out of places the sending application does not control:
 * logs always get a masked recipient, and history rows can store an HMAC of
 * the recipient and skip the payload columns entirely.
 */

import { createHmac } from 'node:crypto';
import { getHistoryRecipientMode, getHistoryHashSecret } from './config';

/**
 * Mask an email address for logging: `jo***@example.com`.
 * The domain stays visible — it identifies the provider, not the person,
 * and is what an operator needs to spot a bad domain in a failure log.
 */
export function maskEmail(address: string): string
{
    const at = address.indexOf('@');

    if (at <= 0)
    {
        return maskOpaque(address);
    }

    const local = address.slice(0, at);
    const domain = address.slice(at + 1);
    const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);

    return `${visible}***@${domain}`;
}

/**
 * Mask a phone number for logging: `+8210******78`.
 */
export function maskPhone(phone: string): string
{
    // Below 8 characters the 5-char head and 2-char tail would overlap
    // (or leave nothing masked), so fall back to opaque masking.
    if (phone.length < 8)
    {
        return maskOpaque(phone);
    }

    const head = phone.slice(0, 5);
    const tail = phone.slice(-2);

    return `${head}${'*'.repeat(phone.length - 7)}${tail}`;
}

/**
 * Mask a value whose shape is unknown or too short to partially reveal.
 */
function maskOpaque(value: string): string
{
    return value.length === 0 ? '' : `${value.slice(0, 1)}***`;
}

/**
 * Mask a recipient of either kind by shape.
 */
export function maskRecipient(value: string): string
{
    return value.includes('@') ? maskEmail(value) : maskPhone(value);
}

/**
 * Mask a recipient list for logging.
 */
export function maskRecipients(values: string[]): string[]
{
    return values.map(maskRecipient);
}

/**
 * HMAC a recipient value. A plain hash of an email address is reversible by
 * dictionary — the input space is small — so a keyed HMAC is required.
 * Input is lowercased so lookups are case-insensitive, matching how email
 * addresses compare.
 */
function hmacRecipient(value: string, secret: string): string
{
    return createHmac('sha256', secret).update(value.trim().toLowerCase()).digest('hex');
}

/**
 * Produce the recipient value a history row stores, honouring the configured
 * mode. Multi-recipient sends store per-recipient HMACs joined with ',' so a
 * single-address lookup keeps working the same way it does for raw values.
 *
 * Throws when hashed mode is configured without a secret — the caller's
 * try/catch around history creation turns that into a logged warning and a
 * skipped row, never a stored raw value or a failed send.
 */
export function historyRecipient(recipients: string[]): string
{
    if (getHistoryRecipientMode() !== 'hashed')
    {
        return recipients.join(',');
    }

    const secret = requireHashSecret();

    return recipients.map(r => hmacRecipient(r, secret)).join(',');
}

/**
 * Transform a recipient filter value the same way stored values were
 * transformed, so exact-match history queries work in either mode.
 */
export function historyRecipientFilter(value: string): string
{
    if (getHistoryRecipientMode() !== 'hashed')
    {
        return value;
    }

    const secret = requireHashSecret();

    return value.split(',').map(r => hmacRecipient(r, secret)).join(',');
}

function requireHashSecret(): string
{
    const secret = getHistoryHashSecret();

    if (!secret)
    {
        throw new Error(
            'history.storeRecipient is "hashed" but no hash secret is configured '
            + '(set history.hashSecret or SPFN_NOTIFICATION_HISTORY_HASH_SECRET)',
        );
    }

    return secret;
}
