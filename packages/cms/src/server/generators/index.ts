/**
 * SPFN CMS Generators Registry
 *
 * Exports generators for use with package-based naming convention
 * e.g., @spfn/cms:label-sync
 */

import { createLabelSyncGenerator } from '@/server/generators/label-sync-generator';

/**
 * Generators registry
 * Maps generator names to their factory functions
 */
export const generators = {
    'label-sync': createLabelSyncGenerator,
};

/**
 * Re-export individual generator factories
 */
export { createLabelSyncGenerator } from '@/server/generators/label-sync-generator';