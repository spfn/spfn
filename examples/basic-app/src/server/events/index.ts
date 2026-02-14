/**
 * Event Router
 *
 * Combines all event definitions for SSE subscription
 */

import { defineEventRouter } from '@spfn/core/event';
import { exampleCreated, exampleUpdated, exampleDeleted } from './example.events';

export const eventRouter = defineEventRouter({
    exampleCreated,
    exampleUpdated,
    exampleDeleted,
});

export type EventRouter = typeof eventRouter;
