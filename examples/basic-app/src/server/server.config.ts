/**
 * Server Configuration
 *
 * SPFN server configuration with CMS label sync
 */

import type { ServerConfig } from '@spfn/core/server';
import { initLabelSync, configureCms } from '@spfn/cms';

export default {
    // Configure CMS before routes are initialized
    beforeRoutes: async (app) =>
    {
        // Configure CMS settings
        configureCms({
            defaultLocale: 'en',
            supportedLocales: ['en', 'ko'],
            detectBrowserLanguage: true,
        });

        // Sync labels from JSON files to database
        await initLabelSync({
            verbose: true,
            updateExisting: false, // Only create new labels, don't update existing ones
        });
    },

    // Server settings
    port: 8790,
    host: '0.0.0.0',

} satisfies ServerConfig;