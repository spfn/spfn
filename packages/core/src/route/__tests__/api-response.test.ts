/**
 * API Response Helpers Tests
 *
 * Tests for optional API response types and helper functions
 */

import { describe, it, expect } from 'vitest';
import { Type } from '@sinclair/typebox';
import { createApp } from '../create-app';
import {
  ApiSuccessSchema,
  ApiErrorSchema,
  ApiResponseSchema,
} from '../api-response';
import type { RouteContract } from '../types';
import type { ApiSuccessResponse, ApiErrorResponse } from '../api-response';
import {
  NotFoundError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  UnprocessableEntityError,
  InternalServerError,
} from '../../errors/index';
import { ErrorHandler } from '../../middleware/error-handler';

describe('API Response Helpers', () => {
  describe('c.success()', () => {
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
        return c.success({
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
        return c.success({ message: 'Hello' }, {
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
        return c.success({
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

  describe('throw errors', () => {
    it('should handle thrown NotFoundError', async () => {
      const app = createApp();
      app.onError(ErrorHandler());

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
          throw new NotFoundError('User not found');
        }
        return c.success({ id: userId, name: 'John' });
      });

      const res = await app.fetch(new Request('http://localhost/users/invalid'));
      expect(res.status).toBe(404);

      const json = await res.json() as ApiErrorResponse;
      expect(json.success).toBe(false);
      expect(json.error.message).toBe('User not found');
      expect(json.error.type).toBe('NotFoundError');
      expect(json.error.statusCode).toBe(404);
    });

    it('should handle thrown ValidationError with details', async () => {
      const app = createApp();
      app.onError(ErrorHandler());

      const contract: RouteContract = {
        method: 'POST',
        path: '/users',
        body: Type.Object({ email: Type.String() }),
        response: ApiResponseSchema(Type.Object({ id: Type.String() })),
      };

      app.bind(contract, async (c) => {
        const body = await c.data();
        if (!body.email.includes('@')) {
          throw new ValidationError('Invalid email format', {
            fields: ['email'],
            value: body.email,
          });
        }
        return c.success({ id: '123' });
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

    it('should handle thrown BadRequestError with default status', async () => {
      const app = createApp();
      app.onError(ErrorHandler());

      const contract: RouteContract = {
        method: 'GET',
        path: '/test',
        response: ApiErrorSchema(),
      };

      app.bind(contract, async (c) => {
        throw new BadRequestError('Bad request');
      });

      const res = await app.fetch(new Request('http://localhost/test'));
      expect(res.status).toBe(400);

      const json = await res.json() as ApiErrorResponse;
      expect(json.error.statusCode).toBe(400);
      expect(json.error.type).toBe('BadRequestError');
    });

    it('should handle different error types based on status code', async () => {
      const testCases = [
        { ErrorClass: UnauthorizedError, code: 401, type: 'UnauthorizedError' },
        { ErrorClass: ForbiddenError, code: 403, type: 'ForbiddenError' },
        { ErrorClass: NotFoundError, code: 404, type: 'NotFoundError' },
        { ErrorClass: ConflictError, code: 409, type: 'ConflictError' },
        { ErrorClass: UnprocessableEntityError, code: 422, type: 'UnprocessableEntityError' },
        { ErrorClass: InternalServerError, code: 500, type: 'InternalServerError' },
      ];

      for (const { ErrorClass, code, type } of testCases) {
        // Create a new app instance for each test case
        const app = createApp();
        app.onError(ErrorHandler());

        const contract: RouteContract = {
          method: 'GET',
          path: '/error',
          response: ApiErrorSchema(),
        };

        app.bind(contract, async (c) => {
          throw new ErrorClass(`Error ${code}`);
        });

        const res = await app.fetch(new Request('http://localhost/error'));
        const json = await res.json() as ApiErrorResponse;

        expect(json.error.type).toBe(type);
        expect(json.error.statusCode).toBe(code);
      }
    });
  });

  describe('c.paginated()', () => {
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

        return c.paginated(users, page, limit, total);
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
        return c.paginated(items, 1, 3, 25);
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
        return c.paginated([], 1, 10, 0);
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
        return c.success({
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
      app.onError(ErrorHandler());

      const contract: RouteContract = {
        method: 'GET',
        path: '/error',
        response: ApiErrorSchema(),
      };

      app.bind(contract, async (c) => {
        throw new InternalServerError('Something went wrong');
      });

      const res = await app.fetch(new Request('http://localhost/error'));
      const json = await res.json() as ApiErrorResponse;

      expect(json.success).toBe(false);
      expect(json.error.message).toBe('Something went wrong');
      expect(json.error.type).toBe('InternalServerError');
    });

    it('ApiResponseSchema should accept both success and error', async () => {
      const app = createApp();
      app.onError(ErrorHandler());

      const DataSchema = Type.Object({ value: Type.String() });

      const contract: RouteContract = {
        method: 'GET',
        path: '/test/:type',
        params: Type.Object({ type: Type.String() }),
        response: ApiResponseSchema(DataSchema),
      };

      app.bind(contract, async (c) => {
        if (c.params.type === 'success') {
          return c.success({ value: 'ok' });
        }
        throw new InternalServerError('Failed');
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
      app.onError(ErrorHandler());

      const contract: RouteContract = {
        method: 'GET',
        path: '/users/:id',
        params: Type.Object({ id: Type.Number() }),
        response: ApiResponseSchema(Type.Object({ id: Type.Number() })),
      };

      app.bind(contract, async (c) => {
        return c.success({ id: c.params.id });
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