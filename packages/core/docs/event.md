# Event

In-process event system for decoupled communication.

## Define Events

```typescript
// src/server/events/index.ts
import { defineEvent, defineEventHandler } from '@spfn/core/event';

// Define event types
export const userCreated = defineEvent<{
    userId: string;
    email: string;
}>('user.created');

export const userUpdated = defineEvent<{
    userId: string;
    changes: Record<string, any>;
}>('user.updated');

export const userDeleted = defineEvent<{
    userId: string;
}>('user.deleted');
```

## Emit Events

```typescript
import { emit } from '@spfn/core/event';
import { userCreated } from './events';

// In repository or service
async function createUser(data: NewUser)
{
    const user = await this._create(users, data);

    await emit(userCreated, {
        userId: user.id,
        email: user.email
    });

    return user;
}
```

## Handle Events

```typescript
import { on } from '@spfn/core/event';
import { userCreated, userDeleted } from './events';

// Register handlers
on(userCreated, async (payload) => {
    // Send welcome email
    await emailService.sendWelcome(payload.email);
});

on(userCreated, async (payload) => {
    // Create default settings
    await settingsRepo.createDefaults(payload.userId);
});

on(userDeleted, async (payload) => {
    // Cleanup related data
    await cleanupUserData(payload.userId);
});
```

## Handler Registration

```typescript
// src/server/events/handlers.ts
import { on } from '@spfn/core/event';
import { userCreated, userUpdated, userDeleted } from './index';

// Register all handlers
export function registerEventHandlers()
{
    on(userCreated, handleUserCreated);
    on(userUpdated, handleUserUpdated);
    on(userDeleted, handleUserDeleted);
}

// Call in server startup
import { registerEventHandlers } from './events/handlers';
registerEventHandlers();
```

## Best Practices

```typescript
// 1. Define events in a central location
// src/server/events/index.ts

// 2. Use descriptive event names
defineEvent('user.created')
defineEvent('order.completed')
defineEvent('payment.failed')

// 3. Keep payloads minimal
defineEvent<{ userId: string }>('user.deleted')  // Just ID, not full user

// 4. Handle errors in handlers
on(userCreated, async (payload) => {
    try {
        await sendEmail(payload.email);
    } catch (error) {
        logger.error('Failed to send email', { error });
    }
});

// 5. Use events for side effects, not core logic
// Core: await userRepo.create(data);
// Side effect: emit(userCreated, { ... });
```
