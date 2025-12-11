/**
 * Example Events
 *
 * Decoupled event definitions for example domain
 */

import { defineEvent } from '@spfn/core/event';
import { Type } from '@sinclair/typebox';

/**
 * Emitted when a new example is created
 */
export const exampleCreated = defineEvent('example.created', Type.Object({
    id: Type.Number(),
    name: Type.String(),
}));

/**
 * Emitted when an example is updated
 */
export const exampleUpdated = defineEvent('example.updated', Type.Object({
    id: Type.Number(),
    name: Type.String(),
}));

/**
 * Emitted when an example is deleted
 */
export const exampleDeleted = defineEvent('example.deleted', Type.Object({
    id: Type.Number(),
}));
