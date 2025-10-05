/**
 * Error Handler Middleware
 *
 * 커스텀 에러를 HTTP 응답으로 변환하는 미들웨어
 *
 * ✅ 기능:
 * - DatabaseError 계열을 적절한 HTTP 상태 코드로 변환
 * - 에러 로깅 (상태 코드별 로그 레벨)
 * - Production/Development 환경별 에러 응답 포맷
 * - 스택 트레이스 포함 (development only)
 */
import type { Context } from 'hono';
import { isDatabaseError, type DatabaseError } from '../errors';
import { logger } from '../logger';

const errorLogger = logger.child('error-handler');

/**
 * 에러 핸들러 옵션
 */
export interface ErrorHandlerOptions {
  /**
   * 스택 트레이스 포함 여부
   * @default process.env.NODE_ENV !== 'production'
   */
  includeStack?: boolean;

  /**
   * 에러 로깅 활성화
   * @default true
   */
  enableLogging?: boolean;
}

/**
 * 에러 응답 포맷
 */
interface ErrorResponse {
  error: {
    message: string;
    type: string;
    statusCode: number;
    stack?: string;
  };
}

/**
 * 에러 핸들러 미들웨어
 *
 * Hono의 onError 훅에서 사용
 *
 * @example
 * ```typescript
 * const app = new Hono();
 * app.onError(errorHandler());
 * ```
 */
export function errorHandler(options: ErrorHandlerOptions = {}) {
  const {
    includeStack = process.env.NODE_ENV !== 'production',
    enableLogging = true,
  } = options;

  return (err: Error, c: Context) => {
    // DatabaseError 처리
    if (isDatabaseError(err)) {
      const dbError = err as DatabaseError;
      const statusCode = dbError.statusCode;

      if (enableLogging) {
        // 4xx는 warn, 5xx는 error
        if (statusCode >= 500) {
          errorLogger.error('Database error occurred', {
            type: dbError.name,
            message: dbError.message,
            statusCode,
            path: c.req.path,
            method: c.req.method,
          });
        } else {
          errorLogger.warn('Client error occurred', {
            type: dbError.name,
            message: dbError.message,
            statusCode,
            path: c.req.path,
            method: c.req.method,
          });
        }
      }

      const response: ErrorResponse = {
        error: {
          message: dbError.message,
          type: dbError.name,
          statusCode,
        },
      };

      if (includeStack) {
        response.error.stack = dbError.stack;
      }

      return c.json(response, statusCode as any);
    }

    // 일반 에러 처리
    if (enableLogging) {
      errorLogger.error('Unhandled error occurred', {
        message: err.message,
        stack: err.stack,
        path: c.req.path,
        method: c.req.method,
      });
    }

    const response: ErrorResponse = {
      error: {
        message: err.message || 'Internal Server Error',
        type: err.name || 'Error',
        statusCode: 500,
      },
    };

    if (includeStack) {
      response.error.stack = err.stack;
    }

    return c.json(response, 500);
  };
}