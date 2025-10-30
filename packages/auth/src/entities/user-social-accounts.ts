/**
 * @spfn/auth - User Social Accounts Entity
 *
 * Stores OAuth connections for social login providers
 */

import { text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey, createFunctionSchema } from '@spfn/core/db';
import { users } from './users';

const schema = createFunctionSchema('@spfn/auth');

export const userSocialAccounts = schema.table('user_social_accounts',
    {
        id: id(),

        // Foreign key to users
        userId: foreignKey('user', () => users.id),

        // Provider info
        provider: text(
            'provider',
            {
                enum: ['google', 'github', 'kakao', 'naver']
            }
        ).notNull(),

        providerUserId: text('provider_user_id').notNull(),
        providerEmail: text('provider_email'),

        // OAuth tokens (encrypted in production)
        accessToken: text('access_token'),
        refreshToken: text('refresh_token'),
        tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),

        ...timestamps(),
    },
    (table) => [
        // Unique constraint: one provider account per provider
        uniqueIndex('provider_user_unique_idx')
            .on(table.provider, table.providerUserId),
    ]
);

// Type exports
export type UserSocialAccount = typeof userSocialAccounts.$inferSelect;
export type NewUserSocialAccount = typeof userSocialAccounts.$inferInsert;
export type SocialProvider = 'google' | 'github' | 'kakao' | 'naver';