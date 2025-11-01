/**
 * API Response Helpers Tests
 *
 * Tests for optional API response types and helper functions
 */

import { describe, it, expect } from 'vitest';
import { Type } from '@sinclair/typebox';
import { createApp } from '../create-app.js';
import {
  success,
  error,
  paginated,
  ApiSuccessSchema,
  ApiErrorSchema,
  ApiResponseSchema,
} from '../api-response.js';
import type { RouteContract } from '../types.js';
import type { ApiSuccessResponse, ApiErrorResponse } from '../api-response.js';

describe('API Response Helpers', () => {
  describe('success()', () => {
    it('should create success response with data', async () => {
      const app = createApp();

      const contract: RouteContract = {
        method: 'GET',
        path: '/users/:id',
        params: Type.Object({ id: Type.String() }),
        response: ApiResponseSchema(Type.Object({
          id: Type.String(),
          name: Type.String(),
        })),
      };

      app.bind(contract, async (c) => {
        return success(c, {
          id: c.params.id,
          name: 'John Doe',
        });
      });

      const res = await app.fetch(new Request('http://localhost/users/123'));
      expect(res.status).toBe(200);

      const json = await res.json() as ApiSuccessResponse;
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ id: '123', name: 'John Doe' });
      expect(json.meta).toBeUndefined();
    });

    it('should create success response with metadata', async () => {
      const app = createApp();

      const contract: RouteContract = {
        method: 'GET',
        path: '/test',
        response: ApiSuccessSchema(Type.Object({ message: Type.String() })),
      };

      app.bind(contract, async (c) => {
        return success(c, { message: 'Hello' }, {
          timestamp: '2024-01-01T00:00:00Z',
          requestId: 'req-123',
        });
      });

      const res = await app.fetch(new Request('http://localhost/test'));
      const json = await res.json() as ApiSuccessResponse;

      expect(json.success).toBe(true);
      expect(json.data).toEqual({ message: 'Hello' });
      expect(json.meta).toEqual({
        timestamp: '2024-01-01T00:00:00Z',
        requestId: 'req-123',
      });
    });

    it('should create success response with custom status code', async () => {
      const app = createApp();

      const contract: RouteContract = {
        method: 'POST',
        path: '/users',
        body: Type.Object({ name: Type.String() }),
        response: ApiSuccessSchema(Type.Object({
          id: Type.String(),
          name: Type.String(),
        })),
      };

      app.bind(contract, async (c) => {
        const body = await c.data();
        return success(c, {
          id: '123',
          name: body.name,
        }, undefined, 201);
      });

      const res = await app.fetch(new Request('http://localhost/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' }),
      }));

      expect(res.status).toBe(201);

      const json = await res.json() as ApiSuccessResponse;
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ id: '123', name: 'Alice' });
    });
  });

  describe('error()', () => {
    it('should create error response with message', async () => {
      const app = createApp();

      const contract: RouteContract = {
        method: 'GET',
        path: '/users/:id',
        params: Type.Object({ id: Type.String() }),
        response: ApiResponseSchema(Type.Object({
          id: Type.String(),
          name: Type.String(),
        })),
      };

      app.bind(contract, async (c) => {
        const userId = c.params.id;
        if (userId === 'invalid') {
          return error(c, 'User not found', 404);
        }
        return success(c, { id: userId, name: 'John' });
      });

      const res = await app.fetch(new Request('http://localhost/users/invalid'));
      expect(res.status).toBe(404);

      const json = await res.json() as ApiErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.message).toBe('User not found');
      expect(json.error.type).toBe('NotFoundError');
      expect(json.error.statusCode).toBe(404);
    });

    it('should create error response with details', async () => {
      const app = createApp();

      const contract: RouteContract = {
        method: 'POST',
        path: '/users',
        body: Type.Object({ email: Type.String() }),
        response: ApiResponseSchema(Type.Object({ id: Type.String() })),
      };

      app.bind(contract, async (c) => {
        const body = await c.data();
        if (!body.email.includes('@')) {
          return error(c, 'Invalid email format', 400, {
            fields: ['email'],
            value: body.email,
          });
        }
        return success(c, { id: '123' });
      });

      const res = await app.fetch(new Request('http://localhost/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid-email' }),
      }));

      expect(res.status).toBe(400);

      const json = await res.json() as ApiErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.message).toBe('Invalid email format');
      expect(json.error.type).toBe('ValidationError');
      expect(json.error.details).toEqual({
        fields: ['email'],
        value: 'invalid-email',
      });
    });

    it('should use default 400 status code', async () => {
      const app = createApp();

      const contract: RouteContract = {
        method: 'GET',
        path: '/test',
        response: ApiErrorSchema(),
      };

      app.bind(contract, async (c) => {
        return error(c, 'Bad request');
      });

      const res = await app.fetch(new Request('http://localhost/test'));
      expect(res.status).toBe(400);

      const json = await res.json() as ApiErrorResponse;
      expect(json.error.statusCode).toBe(400);
      expect(json.error.type).toBe('ValidationError');
    });

    it('should handle different error types based on status code', async () => {
      const testCases = [
        { code: 401, type: 'UnauthorizedError' },
        { code: 403, type: 'ForbiddenError' },
        { code: 404, type: 'NotFoundError' },
        { code: 409, type: 'ConflictError' },
        { code: 422, type: 'UnprocessableEntityError' },
        { code: 500, type: 'InternalServerError' },
        { code: 503, type: 'InternalServerError' },
      ];

      for (const { code, type } of testCases) {
        // Create a new app instance for each test case
        const app = createApp();

        const contract: RouteContract = {
          method: 'GET',
          path: '/error',
          response: ApiErrorSchema(),
        };

        app.bind(contract, async (c) => {
          return error(c, `Error ${code}`, code);
        });

        const res = await app.fetch(new Request('http://localhost/error'));
        const json = await res.json() as ApiErrorResponse;

        expect(json.error.type).toBe(type);
        expect(json.error.statusCode).toBe(code);
      }
    });
  });

  describe('paginated()', () => {
    it('should create paginated response', async () => {
      const app = createApp();

      const contract: RouteContract = {
        method: 'GET',
        path: '/users',
        query: Type.Object({
          page: Type.Number(),
          limit: Type.Number(),
        }),
        response: ApiSuccessSchema(Type.Array(Type.Object({
          id: Type.String(),
          name: Type.String(),
        }))),
      };

      app.bind(contract, async (c) => {
        const { page, limit } = c.query;
        const users = [
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
        ];
        const total = 100;

        return paginated(c, users, page, limit, total);
      });

      const res = await app.fetch(new Request('http://localhost/users?page=1&limit=10'));
      expect(res.status).toBe(200);

      const json = await res.json() as ApiSuccessResponse;
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
      expect(json.meta?.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 100,
        totalPages: 10,
      });
    });

    it('should calculate total pages correctly', async () => {
      const app = createApp();

      const contract: RouteContract = {
        method: 'GET',
        path: '/items',
        response: ApiSuccessSchema(Type.Array(Type.Object({ id: Type.String() }))),
      };

      app.bind(contract, async (c) => {
        const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
        return paginated(c, items, 1, 3, 25);
      });

      const res = await app.fetch(new Request('http://localhost/items'));
      const json = await res.json() as ApiSuccessResponse;

      expect(json.meta?.pagination?.totalPages).toBe(9); // Math.ceil(25 / 3)
    });

    it('should handle empty results', async () => {
      const app = createApp();

      const contract: RouteContract = {
        method: 'GET',
        path: '/empty',
        response: ApiSuccessSchema(Type.Array(Type.Object({ id: Type.String() }))),
      };

      app.bind(contract, async (c) => {
        return paginated(c, [], 1, 10, 0);
      });

      const res = await app.fetch(new Request('http://localhost/empty'));
      const json = await res.json() as ApiSuccessResponse;

      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
      expect(json.meta?.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });
  });

  describe('TypeBox Schema Helpers', () => {
    it('ApiSuccessSchema should validate success response', async () => {
      const app = createApp();

      const UserSchema = Type.Object({
        id: Type.String(),
        name: Type.String(),
      });

      const contract: RouteContract = {
        method: 'GET',
        path: '/user',
        response: ApiSuccessSchema(UserSchema),
      };

      app.bind(contract, async (c) => {
        return success(c, {
          id: '123',
          name: 'John',
        });
      });

      const res = await app.fetch(new Request('http://localhost/user'));
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data).toEqual({ id: '123', name: 'John' });
    });

    it('ApiErrorSchema should validate error response', async () => {
      const app = createApp();

      const contract: RouteContract = {
        method: 'GET',
        path: '/error',
        response: ApiErrorSchema(),
      };

      app.bind(contract, async (c) => {
        return error(c, 'Something went wrong', 500);
      });

      const res = await app.fetch(new Request('http://localhost/error'));
      const json = await res.json() as ApiErrorResponse;

      expect(json.success).toBe(false);
      expect(json.error.message).toBe('Something went wrong');
      expect(json.error.type).toBe('InternalServerError');
    });

    it('ApiResponseSchema should accept both success and error', async () => {
      const app = createApp();

      const DataSchema = Type.Object({ value: Type.String() });

      const contract: RouteContract = {
        method: 'GET',
        path: '/test/:type',
        params: Type.Object({ type: Type.String() }),
        response: ApiResponseSchema(DataSchema),
      };

      app.bind(contract, async (c) => {
        if (c.params.type === 'success') {
          return success(c, { value: 'ok' });
        }
        return error(c, 'Failed', 500);
      });

      // Test success case
      const successRes = await app.fetch(new Request('http://localhost/test/success'));
      const successJson = await successRes.json() as ApiSuccessResponse;
      expect(successJson.success).toBe(true);
      expect(successJson.data).toEqual({ value: 'ok' });

      // Test error case
      const errorRes = await app.fetch(new Request('http://localhost/test/error'));
      const errorJson = await errorRes.json() as ApiErrorResponse;
      expect(errorJson.success).toBe(false);
      expect(errorJson.error.message).toBe('Failed');
    });
  });

  describe('Integration with ErrorHandler', () => {
    it('should have consistent response format', async () => {
      const app = createApp();
      const { ErrorHandler } = await import('../../middleware/error-handler.js');
      app.onError(ErrorHandler());

      const contract: RouteContract = {
        method: 'GET',
        path: '/users/:id',
        params: Type.Object({ id: Type.Number() }),
        response: ApiResponseSchema(Type.Object({ id: Type.Number() })),
      };

      app.bind(contract, async (c) => {
        return success(c, { id: c.params.id });
      });

      // Pass invalid param to trigger ValidationError
      const res = await app.fetch(new Request('http://localhost/users/abc'));
      expect(res.status).toBe(400);

      const json = await res.json() as ApiErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.message).toBe('Invalid path parameters');
      expect(json.error.statusCode).toBe(400);
    });
  });
});