/**
 * Logger 테스트
 *
 * ✅ 구현 완료:
 * - 기본 로깅 테스트
 * - Child logger 테스트
 * - Error 로깅 테스트
 * - Context 로깅 테스트
 * - 로그 레벨 필터링 테스트
 *
 * 💡 향후 고려사항:
 * - Transport별 테스트
 * - 비동기 처리 테스트
 *
 * 🔗 관련 파일:
 * - src/server/core/logger/ (Logger 구현)
 */

import { describe, it, expect, vi } from 'vitest';
import { logger } from '../index.js';
import { Logger } from '../logger.js';
import type { Transport, LogMetadata } from '../types.js';

describe('Logger', () => {
  describe('Basic Logging', () => {
    it('should log debug message', () => {
      expect(() => {
        logger.debug('Debug message');
      }).not.toThrow();
    });

    it('should log info message', () => {
      expect(() => {
        logger.info('Info message');
      }).not.toThrow();
    });

    it('should log warn message', () => {
      expect(() => {
        logger.warn('Warn message');
      }).not.toThrow();
    });

    it('should log error message', () => {
      expect(() => {
        logger.error('Error message');
      }).not.toThrow();
    });

    it('should log fatal message', () => {
      expect(() => {
        logger.fatal('Fatal message');
      }).not.toThrow();
    });
  });

  describe('Context Logging', () => {
    it('should log with context', () => {
      expect(() => {
        logger.info('Message with context', {
          userId: 123,
          action: 'login',
        });
      }).not.toThrow();
    });

    it('should log with complex context', () => {
      expect(() => {
        logger.debug('Complex context', {
          user: { id: 1, name: 'Test' },
          metadata: { timestamp: Date.now() },
          tags: ['test', 'debug'],
        });
      }).not.toThrow();
    });
  });

  describe('Error Logging', () => {
    it('should log error with Error object', () => {
      const error = new Error('Test error');

      expect(() => {
        logger.error('Error occurred', error);
      }).not.toThrow();
    });

    it('should log error with Error object and context', () => {
      const error = new Error('Test error with context');

      expect(() => {
        logger.error('Error occurred', error, {
          userId: 456,
          operation: 'test',
        });
      }).not.toThrow();
    });

    it('should log fatal with Error object', () => {
      const error = new Error('Fatal error');

      expect(() => {
        logger.fatal('Fatal error occurred', error);
      }).not.toThrow();
    });
  });

  describe('Child Logger', () => {
    it('should create child logger', () => {
      const dbLogger = logger.child('database');

      expect(() => {
        dbLogger.info('Database connected');
      }).not.toThrow();
    });

    it('should create multiple child loggers', () => {
      const dbLogger = logger.child('database');
      const apiLogger = logger.child('api');

      expect(() => {
        dbLogger.debug('DB query executed');
        apiLogger.info('API request received');
      }).not.toThrow();
    });

    it('should log with child logger and context', () => {
      const dbLogger = logger.child('database');

      expect(() => {
        dbLogger.warn('Connection retry', { attempt: 3 });
      }).not.toThrow();
    });
  });

  describe('Real-world Scenarios', () => {
    it('should log database connection', () => {
      const dbLogger = logger.child('database');

      expect(() => {
        dbLogger.info('Connecting to database...');
        dbLogger.info('Database connected successfully');
      }).not.toThrow();
    });

    it('should log API request', () => {
      const apiLogger = logger.child('api');

      expect(() => {
        apiLogger.info('Request received', {
          method: 'POST',
          path: '/users',
          ip: '127.0.0.1',
        });
      }).not.toThrow();
    });

    it('should log connection retry with error', () => {
      const dbLogger = logger.child('database');
      const error = new Error('Connection timeout');

      expect(() => {
        dbLogger.warn('Connection failed, retrying...', error, {
          attempt: 1,
          maxRetries: 3,
          delay: 1000,
        });
      }).not.toThrow();
    });

    it('should log fatal system error', () => {
      const sysLogger = logger.child('system');
      const error = new Error('Out of memory');

      expect(() => {
        sysLogger.fatal('System critical error', error, {
          memoryUsage: process.memoryUsage(),
        });
      }).not.toThrow();
    });
  });

  describe('Log Level Filtering', () => {
    it('should filter logs below configured level', () => {
      // Create a mock transport to track log calls
      const mockTransport: Transport = {
        name: 'mock',
        level: 'debug',
        enabled: true,
        log: vi.fn().mockResolvedValue(undefined),
      };

      // Create logger with 'warn' level
      const testLogger = new Logger({
        level: 'warn',
        transports: [mockTransport],
      });

      // These should NOT call transport (below warn level)
      testLogger.debug('Debug message');
      testLogger.info('Info message');

      // These SHOULD call transport (warn level and above)
      testLogger.warn('Warn message');
      testLogger.error('Error message');
      testLogger.fatal('Fatal message');

      // Wait for async processing
      return new Promise<void>(resolve => {
        setTimeout(() => {
          // Only 3 calls should have been made (warn, error, fatal)
          expect(mockTransport.log).toHaveBeenCalledTimes(3);
          resolve();
        }, 50);
      });
    });

    it('should respect different log levels', () => {
      const mockTransport: Transport = {
        name: 'mock',
        level: 'debug',
        enabled: true,
        log: vi.fn().mockResolvedValue(undefined),
      };

      // Create logger with 'error' level
      const testLogger = new Logger({
        level: 'error',
        transports: [mockTransport],
      });

      testLogger.debug('Debug message');
      testLogger.info('Info message');
      testLogger.warn('Warn message');
      testLogger.error('Error message');
      testLogger.fatal('Fatal message');

      return new Promise<void>(resolve => {
        setTimeout(() => {
          // Only 2 calls (error, fatal)
          expect(mockTransport.log).toHaveBeenCalledTimes(2);
          resolve();
        }, 50);
      });
    });

    it('should not create metadata for filtered logs', () => {
      const mockTransport: Transport = {
        name: 'mock',
        level: 'debug',
        enabled: true,
        log: vi.fn((metadata: LogMetadata) => {
          // Verify metadata structure
          expect(metadata).toHaveProperty('timestamp');
          expect(metadata).toHaveProperty('level');
          expect(metadata).toHaveProperty('message');
          return Promise.resolve();
        }),
      };

      const testLogger = new Logger({
        level: 'info',
        transports: [mockTransport],
      });

      // This should be filtered out - no metadata created
      testLogger.debug('Debug should be filtered');

      // This should pass through
      testLogger.info('Info should pass');

      return new Promise<void>(resolve => {
        setTimeout(() => {
          // Only 1 call with proper metadata
          expect(mockTransport.log).toHaveBeenCalledTimes(1);
          expect(mockTransport.log).toHaveBeenCalledWith(
            expect.objectContaining({
              level: 'info',
              message: 'Info should pass',
            })
          );
          resolve();
        }, 50);
      });
    });

    it('should allow all logs with debug level', () => {
      const mockTransport: Transport = {
        name: 'mock',
        level: 'debug',
        enabled: true,
        log: vi.fn().mockResolvedValue(undefined),
      };

      const testLogger = new Logger({
        level: 'debug',
        transports: [mockTransport],
      });

      testLogger.debug('Debug');
      testLogger.info('Info');
      testLogger.warn('Warn');
      testLogger.error('Error');
      testLogger.fatal('Fatal');

      return new Promise<void>(resolve => {
        setTimeout(() => {
          // All 5 logs should pass through
          expect(mockTransport.log).toHaveBeenCalledTimes(5);
          resolve();
        }, 50);
      });
    });
  });

  describe('Sensitive Data Masking', () => {
    it('should mask password in context', () => {
      const mockTransport: Transport = {
        name: 'mock',
        level: 'debug',
        enabled: true,
        log: vi.fn().mockResolvedValue(undefined),
      };

      const testLogger = new Logger({
        level: 'info',
        transports: [mockTransport],
      });

      testLogger.info('User login', {
        username: 'john',
        password: 'secret123',
      });

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(mockTransport.log).toHaveBeenCalledWith(
            expect.objectContaining({
              context: expect.objectContaining({
                username: 'john',
                password: '***MASKED***',
              }),
            })
          );
          resolve();
        }, 50);
      });
    });

    it('should mask multiple sensitive fields', () => {
      const mockTransport: Transport = {
        name: 'mock',
        level: 'debug',
        enabled: true,
        log: vi.fn().mockResolvedValue(undefined),
      };

      const testLogger = new Logger({
        level: 'info',
        transports: [mockTransport],
      });

      testLogger.info('API request', {
        userId: 123,
        token: 'abc123',
        apiKey: 'xyz789',
        data: 'normal-data',
      });

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(mockTransport.log).toHaveBeenCalledWith(
            expect.objectContaining({
              context: expect.objectContaining({
                userId: 123,
                token: '***MASKED***',
                apiKey: '***MASKED***',
                data: 'normal-data',
              }),
            })
          );
          resolve();
        }, 50);
      });
    });

    it('should mask nested sensitive data', () => {
      const mockTransport: Transport = {
        name: 'mock',
        level: 'debug',
        enabled: true,
        log: vi.fn().mockResolvedValue(undefined),
      };

      const testLogger = new Logger({
        level: 'info',
        transports: [mockTransport],
      });

      testLogger.info('Nested data', {
        user: {
          id: 123,
          name: 'John',
          credentials: {
            password: 'secret',
            token: 'token123',
          },
        },
      });

      return new Promise<void>(resolve => {
        setTimeout(() => {
          const call = (mockTransport.log as any).mock.calls[0][0];
          expect(call.context.user.id).toBe(123);
          expect(call.context.user.name).toBe('John');
          expect(call.context.user.credentials.password).toBe('***MASKED***');
          expect(call.context.user.credentials.token).toBe('***MASKED***');
          resolve();
        }, 50);
      });
    });

    it('should not mask non-sensitive fields', () => {
      const mockTransport: Transport = {
        name: 'mock',
        level: 'debug',
        enabled: true,
        log: vi.fn().mockResolvedValue(undefined),
      };

      const testLogger = new Logger({
        level: 'info',
        transports: [mockTransport],
      });

      const normalContext = {
        userId: 123,
        email: 'user@example.com',
        status: 'active',
        timestamp: Date.now(),
      };

      testLogger.info('Normal data', normalContext);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(mockTransport.log).toHaveBeenCalledWith(
            expect.objectContaining({
              context: normalContext,
            })
          );
          resolve();
        }, 50);
      });
    });

    it('should handle context with undefined', () => {
      const mockTransport: Transport = {
        name: 'mock',
        level: 'debug',
        enabled: true,
        log: vi.fn().mockResolvedValue(undefined),
      };

      const testLogger = new Logger({
        level: 'info',
        transports: [mockTransport],
      });

      testLogger.info('No context');

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(mockTransport.log).toHaveBeenCalledWith(
            expect.objectContaining({
              context: undefined,
            })
          );
          resolve();
        }, 50);
      });
    });
  });
});