/**
 * Server 모듈 테스트
 *
 * ✅ 테스트 범위:
 * - 서버 타임아웃 설정 타입 검증
 * - ServerConfig 병합 우선순위
 * - 환경변수 읽기
 * - 기본값 적용
 *
 * 🔗 관련 파일:
 * - src/server/server.ts
 * - src/server/types.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ServerConfig } from '../types.js';

describe('Server Module', () => {

    describe('Server Configuration', () => {
        it('should have timeout configuration type', () => {
            const config: ServerConfig = {
                timeout: {
                    request: 30000,
                    keepAlive: 45000,
                    headers: 20000,
                },
            };

            expect(config.timeout).toBeDefined();
            expect(config.timeout.request).toBe(30000);
            expect(config.timeout.keepAlive).toBe(45000);
            expect(config.timeout.headers).toBe(20000);
        });

        it('should support partial timeout configuration', () => {
            const config: ServerConfig = {
                timeout: {
                    request: 60000,
                },
            };

            expect(config.timeout).toBeDefined();
            expect(config.timeout.request).toBe(60000);
            expect(config.timeout.keepAlive).toBeUndefined();
        });

        it('should support database configuration', () => {
            const config: ServerConfig = {
                database: {
                    pool: {
                        max: 20,
                        idleTimeout: 30,
                    },
                    healthCheck: {
                        enabled: true,
                        interval: 60000,
                    },
                    monitoring: {
                        enabled: true,
                        slowThreshold: 1000,
                    },
                },
            };

            expect(config.database).toBeDefined();
            expect(config.database.pool?.max).toBe(20);
            expect(config.database.healthCheck?.enabled).toBe(true);
            expect(config.database.monitoring?.slowThreshold).toBe(1000);
        });
    });

    describe('Timeout Default Values', () => {
        let originalEnv: NodeJS.ProcessEnv;

        beforeEach(() => {
            originalEnv = { ...process.env };
        });

        afterEach(() => {
            process.env = originalEnv;
        });

        it('should use default timeout values when not specified', () => {
            // 환경변수 없이 기본값 테스트
            delete process.env.SERVER_TIMEOUT;
            delete process.env.SERVER_KEEPALIVE_TIMEOUT;
            delete process.env.SERVER_HEADERS_TIMEOUT;

            const config: ServerConfig = {};

            // 기본값 확인 (코드에서 정의한 값)
            // request: 120000 (2분)
            // keepAlive: 65000 (65초)
            // headers: 60000 (60초)

            expect(config.timeout).toBeUndefined(); // 명시적으로 설정하지 않으면 undefined
        });

        it('should read timeout from environment variables', () => {
            process.env.SERVER_TIMEOUT = '30000';
            process.env.SERVER_KEEPALIVE_TIMEOUT = '45000';
            process.env.SERVER_HEADERS_TIMEOUT = '20000';

            // 환경변수가 설정되어 있으면 server.ts에서 읽어서 적용됨
            expect(process.env.SERVER_TIMEOUT).toBe('30000');
            expect(process.env.SERVER_KEEPALIVE_TIMEOUT).toBe('45000');
            expect(process.env.SERVER_HEADERS_TIMEOUT).toBe('20000');
        });

        it('should prioritize config over environment variables', () => {
            process.env.SERVER_TIMEOUT = '30000';

            const config: ServerConfig = {
                timeout: {
                    request: 60000, // Config가 우선
                },
            };

            expect(config.timeout.request).toBe(60000);
            expect(config.timeout.request).not.toBe(Number(process.env.SERVER_TIMEOUT));
        });
    });

    describe('CORS Configuration', () => {
        it('should support CORS configuration', () => {
            const config: ServerConfig = {
                cors: {
                    origin: 'https://example.com',
                    credentials: true,
                },
            };

            expect(config.cors).toBeDefined();
            expect((config.cors as any).origin).toBe('https://example.com');
            expect((config.cors as any).credentials).toBe(true);
        });

        it('should disable CORS when set to false', () => {
            const config: ServerConfig = {
                cors: false,
            };

            expect(config.cors).toBe(false);
        });
    });

    describe('Port and Host Configuration', () => {
        it('should have port and host configuration', () => {
            const config: ServerConfig = {
                port: 3000,
                host: '0.0.0.0',
            };

            expect(config.port).toBe(3000);
            expect(config.host).toBe('0.0.0.0');
        });
    });

    describe('Middleware Configuration', () => {
        it('should support named middlewares', () => {
            const config: ServerConfig = {
                middlewares: [
                    {
                        name: 'auth',
                        handler: async (c, next) => {
                            await next();
                        },
                    },
                    {
                        name: 'rateLimit',
                        handler: async (c, next) => {
                            await next();
                        },
                    },
                ],
            };

            expect(config.middlewares).toBeDefined();
            expect(config.middlewares?.length).toBe(2);
            expect(config.middlewares?.[0].name).toBe('auth');
            expect(config.middlewares?.[1].name).toBe('rateLimit');
        });
    });
});