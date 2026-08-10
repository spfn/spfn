/**
 * @spfn/auth - Email address normalization
 *
 * One canonical form for an address, applied on the way in AND on the way out,
 * so `Foo@Example.com` and `foo@example.com` are the same account everywhere.
 *
 * Both sides have to agree or normalization makes things worse rather than
 * better: normalizing only the lookup means an address stored in mixed case can
 * no longer be found, and normalizing only the write means an old row stays
 * unreachable. `UsersRepository` therefore applies this to every read and every
 * write of `users.email`, which is what keeps a call site from forgetting.
 */

/**
 * Trim and lower-case an address.
 *
 * Nothing else. Two normalizations that look tempting are deliberately absent:
 * stripping dots and cutting at `+` are Gmail delivery rules, not internet ones,
 * and applying them would merge addresses that other providers treat as
 * genuinely different people.
 *
 * The local part is technically case-sensitive per RFC 5321, but no mail
 * provider in practice treats it that way, while users routinely retype their
 * address with different capitalization. Matching the practice avoids duplicate
 * accounts; honouring the RFC creates them.
 *
 * @param email - Address as supplied
 * @returns The canonical form used for storage and lookup
 */
export function normalizeEmail(email: string): string
{
    return email.trim().toLowerCase();
}

/**
 * Normalize when there is an address, pass null/undefined through untouched.
 *
 * Accounts registered by phone have no email, and `null` is meaningfully
 * different from `''` in that column.
 */
export function normalizeOptionalEmail<T extends string | null | undefined>(email: T): T
{
    return (typeof email === 'string' ? normalizeEmail(email) : email) as T;
}
