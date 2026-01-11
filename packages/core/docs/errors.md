# Errors

Error types and handling patterns.

## Error Types

### HttpError

General HTTP error with status code.

```typescript
import { HttpError } from '@spfn/core/errors';

throw new HttpError(404, 'User not found');
throw new HttpError(403, 'Access denied');
throw new HttpError(500, 'Internal server error');
```

### ValidationError

Input validation error with field details.

```typescript
import { ValidationError } from '@spfn/core/errors';

throw new ValidationError({
    message: 'Validation failed',
    fields: [
        { path: '/email', message: 'Invalid email format' },
        { path: '/name', message: 'Name is required' }
    ]
});
```

**Response format:**

```json
{
    "error": "Validation failed",
    "fields": [
        { "path": "/email", "message": "Invalid email format" },
        { "path": "/name", "message": "Name is required" }
    ]
}
```

### NotFoundError

Resource not found error.

```typescript
import { NotFoundError } from '@spfn/core/errors';

throw new NotFoundError('User');
// → 404: "User not found"

throw new NotFoundError('Post', '123');
// → 404: "Post with id 123 not found"
```

### UnauthorizedError

Authentication required error.

```typescript
import { UnauthorizedError } from '@spfn/core/errors';

throw new UnauthorizedError();
// → 401: "Unauthorized"

throw new UnauthorizedError('Invalid token');
// → 401: "Invalid token"
```

### ForbiddenError

Permission denied error.

```typescript
import { ForbiddenError } from '@spfn/core/errors';

throw new ForbiddenError();
// → 403: "Forbidden"

throw new ForbiddenError('Admin access required');
// → 403: "Admin access required"
```

### ConflictError

Resource conflict error.

```typescript
import { ConflictError } from '@spfn/core/errors';

throw new ConflictError('Email already exists');
// → 409: "Email already exists"
```

### BadRequestError

Invalid request error.

```typescript
import { BadRequestError } from '@spfn/core/errors';

throw new BadRequestError('Invalid date format');
// → 400: "Invalid date format"
```

---

## Database Errors

### RepositoryError

Error from repository operations with context.

```typescript
import { RepositoryError } from '@spfn/core/db';

// Automatically thrown by BaseRepository.withContext()
// Contains: repository name, method, table, original error
```

### PostgreSQL Error Conversion

```typescript
import { fromPostgresError } from '@spfn/core/db';

try
{
    await db.insert(users).values(data);
}
catch (error)
{
    const customError = fromPostgresError(error);
    // 23505 → DuplicateEntryError
    // 23503 → ConstraintViolationError
    // 40P01 → DeadlockError
    throw customError;
}
```

---

## Error Handling in Routes

### Simple Throw

```typescript
route.get('/users/:id')
    .handler(async (c) => {
        const user = await userRepo.findById(id);

        if (!user)
        {
            throw new NotFoundError('User');
        }

        return user;
    });
```

### With HttpError

```typescript
route.post('/login')
    .handler(async (c) => {
        const { body } = await c.data();
        const user = await userRepo.findByEmail(body.email);

        if (!user || !await verifyPassword(body.password, user.password))
        {
            throw new UnauthorizedError('Invalid credentials');
        }

        return { token: generateToken(user) };
    });
```

### Validation in Repository

```typescript
// repository
async createUser(data: NewUser)
{
    const existing = await this._findOne(users, { email: data.email });
    if (existing)
    {
        throw new ConflictError('Email already exists');
    }

    return this._create(users, data);
}

// route
route.post('/users')
    .handler(async (c) => {
        const { body } = await c.data();
        return userRepo.createUser(body);  // Throws ConflictError if exists
    });
```

---

## Error Response Format

All errors are converted to JSON response:

```json
{
    "error": "Error message",
    "code": "ERROR_CODE",
    "statusCode": 404
}
```

**Validation errors:**

```json
{
    "error": "Validation failed",
    "fields": [
        { "path": "/email", "message": "Invalid format" }
    ],
    "statusCode": 400
}
```

---

## Global Error Handler

Errors are caught by global error middleware:

```typescript
// Automatic - no setup needed
// Standard Error → 500 Internal Server Error
// HttpError → Custom status code
// ValidationError → 400 with field details
```

---

## Custom Error Classes

```typescript
import { HttpError } from '@spfn/core/errors';

export class PaymentRequiredError extends HttpError
{
    constructor(message = 'Payment required')
    {
        super(402, message);
        this.name = 'PaymentRequiredError';
    }
}

export class TooManyRequestsError extends HttpError
{
    constructor(retryAfter?: number)
    {
        super(429, 'Too many requests');
        this.name = 'TooManyRequestsError';
        if (retryAfter)
        {
            this.headers = { 'Retry-After': String(retryAfter) };
        }
    }
}
```

---

## Best Practices

### Do

```typescript
// 1. Use specific error types
throw new NotFoundError('User');  // Not: throw new Error('User not found');

// 2. Provide meaningful messages
throw new ForbiddenError('Only admins can delete users');

// 3. Throw errors from repository for business logic
async createUser(data) {
    if (await this.emailExists(data.email)) {
        throw new ConflictError('Email already exists');
    }
}

// 4. Let errors propagate - don't catch and re-throw
route.handler(async (c) => {
    return userRepo.create(data);  // Let errors propagate
});
```

### Don't

```typescript
// 1. Don't use generic Error for HTTP errors
throw new Error('Not found');  // Use NotFoundError

// 2. Don't catch errors just to log
try {
    await userRepo.create(data);
} catch (e) {
    console.log(e);  // Bad - error handling does this
    throw e;
}

// 3. Don't return error objects
return { error: 'Not found' };  // Throw instead

// 4. Don't expose internal error details
throw new HttpError(500, error.stack);  // Bad - security risk
```
