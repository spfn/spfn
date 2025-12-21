/**
 * @spfn/notification - SMS Utilities
 */

import { getSmsDefaultCountryCode } from '../../config';

/**
 * Normalize phone number to E.164 format
 *
 * @example
 * normalizePhoneNumber('010-1234-5678') // '+821012345678'
 * normalizePhoneNumber('+821012345678') // '+821012345678'
 * normalizePhoneNumber('01012345678')   // '+821012345678'
 */
export function normalizePhoneNumber(phone: string, defaultCountryCode?: string): string
{
    // Remove all non-digit characters except +
    let normalized = phone.replace(/[^\d+]/g, '');

    // If doesn't start with +, add default country code
    if (!normalized.startsWith('+'))
    {
        const countryCode = defaultCountryCode ?? getSmsDefaultCountryCode();

        // Remove leading 0 if present (Korean format)
        if (normalized.startsWith('0'))
        {
            normalized = normalized.slice(1);
        }

        normalized = countryCode + normalized;
    }

    return normalized;
}
