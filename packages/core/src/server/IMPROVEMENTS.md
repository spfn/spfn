# Server 모듈 개선 제안

> 분석 일자: 2025-10-11
> 분석 범위: `packages/core/src/server/` 전체 모듈

## 📋 목차

1. [중요도 높음 (High Priority)](#중요도-높음-high-priority)
2. [중요도 중간 (Medium Priority)](#중요도-중간-medium-priority)
3. [중요도 낮음 (Low Priority)](#중요도-낮음-low-priority)

---

## 🔴 중요도 높음 (High Priority)

### 1. ✅ 서버 타임아웃 설정 (완료)

**파일**: `server/server.ts`, `server/types.ts`

**구현 완료** (2025-10-11):

**원래 문제점**:
```typescript
const server = serve({
    fetch: app.fetch,
    port: port!,
    hostname: host,
});
```

**문제점**:
- Node.js HTTP 서버의 기본 타임아웃이 0 (무한대)
- 장기 실행 요청이 무한정 대기 가능
- 메모리 누수 및 리소스 고갈 위험
- Slowloris 공격 등에 취약

**영향**:
- 프로덕션에서 심각한 보안 취약점
- 리소스 고갈로 서비스 불능 가능
- 좀비 커넥션 축적

**개선안**:
```typescript
export interface ServerConfig {
    // ... 기존 설정들

    /**
     * Server timeout configuration
     */
    timeout?: {
        /**
         * Request timeout in milliseconds
         * @default 120000 (2 minutes)
         * @env SERVER_TIMEOUT
         */
        request?: number;

        /**
         * Keep-alive timeout in milliseconds
         * @default 65000 (65 seconds, slightly longer than common LB timeout)
         * @env SERVER_KEEPALIVE_TIMEOUT
         */
        keepAlive?: number;

        /**
         * Headers timeout in milliseconds
         * @default 60000 (60 seconds)
         * @env SERVER_HEADERS_TIMEOUT
         */
        headers?: number;
    };
}

// server.ts
export async function startServer(config?: ServerConfig): Promise<void> {
    // ... 기존 코드

    const server = serve({
        fetch: app.fetch,
        port: port!,
        hostname: host,
    });

    // Configure timeouts
    const timeoutConfig = finalConfig.timeout ?? {};
    const requestTimeout = timeoutConfig.request
        ?? parseInt(process.env.SERVER_TIMEOUT || '', 10)
        || 120000;
    const keepAliveTimeout = timeoutConfig.keepAlive
        ?? parseInt(process.env.SERVER_KEEPALIVE_TIMEOUT || '', 10)
        || 65000;
    const headersTimeout = timeoutConfig.headers
        ?? parseInt(process.env.SERVER_HEADERS_TIMEOUT || '', 10)
        || 60000;

    // Apply timeouts to underlying Node.js server
    if (server.timeout !== undefined) {
        server.timeout = requestTimeout;
    }
    if (server.keepAliveTimeout !== undefined) {
        server.keepAliveTimeout = keepAliveTimeout;
    }
    if (server.headersTimeout !== undefined) {
        server.headersTimeout = headersTimeout;
    }

    serverLogger.info('Server timeouts configured', {
        request: `${requestTimeout}ms`,
        keepAlive: `${keepAliveTimeout}ms`,
        headers: `${headersTimeout}ms`,
    });
}
```

**우선순위**: 🔴 Critical - 프로덕션 보안 및 안정성

---

### 2. ✅ 환경변수 PORT/HOST 지원 (완료)

**파일**: `server/server.ts`

**구현 완료** (2025-10-11):

**원래 문제점**:
```typescript
const finalConfig: ServerConfig = {
    ...fileConfig,
    ...config,
    port: config?.port ?? fileConfig?.port ?? 4000,
    host: config?.host ?? fileConfig?.host ?? 'localhost',
};
```

**문제점**:
- `PORT` 환경변수를 읽지 않음
- Docker, Heroku, AWS 등 대부분의 배포 환경에서 `PORT` 사용
- 배포 시 매번 config 수정 필요

**영향**:
- 배포 편의성 저하
- 표준 관례 미준수

**구현 내용**:
```typescript
// Merge config (runtime > file > env > defaults)
const finalConfig: ServerConfig = {
    ...fileConfig,
    ...config,
    port: config?.port ?? fileConfig?.port ?? (parseInt(process.env.PORT || '', 10) || 4000),
    host: config?.host ?? fileConfig?.host ?? process.env.HOST || 'localhost',
};
```

**우선순위**: 🔴 High - 배포 환경 필수

---

## 🟡 중요도 중간 (Medium Priority)

### 3. ✅ 서버 인스턴스 반환 (완료)

**파일**: `server/server.ts`, `server/types.ts`

**구현 완료** (2025-10-11):

**원래 문제점**:
```typescript
export async function startServer(config?: ServerConfig): Promise<void>
```

**문제점**:
- 서버 인스턴스에 접근 불가
- 테스트에서 서버 제어 불가능
- 수동 종료 불가능 (graceful shutdown만 가능)

**구현 내용**:
```typescript
export interface ServerInstance {
    /**
     * Underlying Node.js HTTP server
     */
    server: ReturnType<typeof serve>;

    /**
     * Hono app instance
     */
    app: Hono;

    /**
     * Server configuration used
     */
    config: ServerConfig;

    /**
     * Manually close the server
     */
    close: () => Promise<void>;
}

export async function startServer(config?: ServerConfig): Promise<ServerInstance> {
    // ... 기존 초기화 로직

    const close = async () => {
        serverLogger.info('Manual server shutdown requested');
        await shutdown('MANUAL');
    };

    return {
        server,
        app,
        config: finalConfig,
        close,
    };
}

// 사용 예시
const instance = await startServer();

// 테스트에서
await instance.close();

// 또는 서버 정보 확인
console.log(instance.config.port);
```

**우선순위**: 🟡 Medium - 테스트 및 유연성 개선

---

### 4. Graceful Shutdown 타임아웃 부재

**파일**: `server/server.ts:150-174`

**현재 상태**:
```typescript
const shutdown = async (signal: string) => {
    serverLogger.info(`${signal} received, starting graceful shutdown...`);

    try {
        // 무한정 대기 가능
        server.close(() => {
            serverLogger.info('HTTP server closed');
        });

        await closeDatabase();
        await closeRedis();

        process.exit(0);
    } catch (error) {
        process.exit(1);
    }
};
```

**문제점**:
- Graceful shutdown이 무한정 대기 가능
- 진행 중인 요청이 끝나지 않으면 영원히 대기
- 쿠버네티스 등에서 강제 종료됨 (SIGKILL)

**개선안**:
```typescript
export interface ServerConfig {
    // ...
    shutdown?: {
        /**
         * Graceful shutdown timeout in milliseconds
         * @default 30000 (30 seconds)
         * @env SHUTDOWN_TIMEOUT
         */
        timeout?: number;
    };
}

const shutdown = async (signal: string) => {
    serverLogger.info(`${signal} received, starting graceful shutdown...`);

    const shutdownTimeout = finalConfig.shutdown?.timeout
        ?? parseInt(process.env.SHUTDOWN_TIMEOUT || '', 10)
        || 30000;

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
            reject(new Error(`Graceful shutdown timeout after ${shutdownTimeout}ms`));
        }, shutdownTimeout);
    });

    try {
        // Race between graceful shutdown and timeout
        await Promise.race([
            (async () => {
                // 1. Stop accepting new connections
                serverLogger.debug('Closing HTTP server...');
                await new Promise<void>((resolve) => {
                    server.close(() => {
                        serverLogger.info('HTTP server closed');
                        resolve();
                    });
                });

                // 2. Close database connections
                serverLogger.debug('Closing database connections...');
                await closeDatabase();

                // 3. Close Redis connections
                serverLogger.debug('Closing Redis connections...');
                await closeRedis();
            })(),
            timeoutPromise,
        ]);

        serverLogger.info('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
            serverLogger.error('Graceful shutdown timeout, forcing exit', error);
        } else {
            serverLogger.error('Error during graceful shutdown', error as Error);
        }
        process.exit(1);
    }
};
```

**우선순위**: 🟡 Medium - 프로덕션 안정성

---

### 5. Health Check 엔드포인트 부재

**파일**: `server/server.ts` (누락)

**현재 상태**: 헬스체크 엔드포인트 없음

**문제점**:
- 쿠버네티스 liveness/readiness probe 불가
- 로드 밸런서 헬스체크 불가
- 서비스 모니터링 어려움

**개선안**:
```typescript
export interface ServerConfig {
    // ...

    /**
     * Health check configuration
     */
    healthCheck?: {
        /**
         * Enable health check endpoint
         * @default true
         */
        enabled?: boolean;

        /**
         * Health check endpoint path
         * @default '/health'
         */
        path?: string;

        /**
         * Include detailed status (DB, Redis, etc.)
         * @default false in production, true in development
         */
        detailed?: boolean;
    };
}

// server.ts - createServer() 내부
export async function createServer(config?: ServerConfig): Promise<Hono> {
    // ... 기존 코드

    // Health check endpoint (before routes)
    const healthCheckConfig = config?.healthCheck ?? {};
    const healthCheckEnabled = healthCheckConfig.enabled !== false;
    const healthCheckPath = healthCheckConfig.path ?? '/health';
    const healthCheckDetailed = healthCheckConfig.detailed
        ?? process.env.NODE_ENV === 'development';

    if (healthCheckEnabled) {
        app.get(healthCheckPath, async (c) => {
            const response: any = {
                status: 'ok',
                timestamp: new Date().toISOString(),
            };

            if (healthCheckDetailed) {
                const { getDatabase } = await import('../db/index.js');
                const { getRedis } = await import('../cache/index.js');

                // Check database
                const db = getDatabase();
                let dbStatus = 'disconnected';
                if (db) {
                    try {
                        await db.execute('SELECT 1');
                        dbStatus = 'connected';
                    } catch {
                        dbStatus = 'error';
                    }
                }

                // Check Redis
                const redis = getRedis();
                let redisStatus = 'disconnected';
                if (redis) {
                    try {
                        await redis.ping();
                        redisStatus = 'connected';
                    } catch {
                        redisStatus = 'error';
                    }
                }

                response.services = {
                    database: dbStatus,
                    redis: redisStatus,
                };
            }

            return c.json(response);
        });

        serverLogger.debug(`Health check endpoint enabled at ${healthCheckPath}`);
    }

    // ... 나머지 코드
}
```

**우선순위**: 🟡 Medium - 프로덕션 모니터링

---

### 6. 서버 초기화 실패 처리

**파일**: `server/server.ts:128-129`

**현재 상태**:
```typescript
// Initialize infrastructure (Database and Redis) with config
await initDatabase(finalConfig.database);
await initRedis();
```

**문제점**:
- DB/Redis 초기화 실패 시 에러 처리 불명확
- 포트 충돌 등 서버 시작 실패 처리 없음
- 부분 초기화 상태로 남을 수 있음

**개선안**:
```typescript
export async function startServer(config?: ServerConfig): Promise<ServerInstance> {
    // ... 기존 config 로딩

    try {
        // Initialize infrastructure
        serverLogger.debug('Initializing database...');
        const dbResult = await initDatabase(finalConfig.database);

        if (!dbResult.write && process.env.DATABASE_URL) {
            serverLogger.warn('Database configuration exists but initialization failed');
        }

        serverLogger.debug('Initializing Redis...');
        await initRedis();

        // Create app
        serverLogger.debug('Creating Hono app...');
        const app = await createServer(finalConfig);

        // Start server with error handling
        const { host, port, debug } = finalConfig;

        serverLogger.debug(`Starting server on ${host}:${port}...`);
        const server = await new Promise<ReturnType<typeof serve>>((resolve, reject) => {
            try {
                const srv = serve({
                    fetch: app.fetch,
                    port: port!,
                    hostname: host,
                });

                srv.on('error', (error: any) => {
                    if (error.code === 'EADDRINUSE') {
                        reject(new Error(`Port ${port} is already in use`));
                    } else {
                        reject(error);
                    }
                });

                // Wait a bit to ensure server started successfully
                setTimeout(() => resolve(srv), 100);
            } catch (error) {
                reject(error);
            }
        });

        // Clean output similar to Next.js
        console.log(`   ▲ SPFN ${debug ? 'dev' : 'production'}`);
        console.log(`   - Local:        http://${host}:${port}`);
        console.log('');

        // ... graceful shutdown setup

        return { server, app, config: finalConfig, close };

    } catch (error) {
        serverLogger.error('Server initialization failed', error as Error);

        // Cleanup on failure
        try {
            await closeDatabase();
            await closeRedis();
        } catch (cleanupError) {
            serverLogger.error('Cleanup failed', cleanupError as Error);
        }

        throw error;
    }
}
```

**우선순위**: 🟡 Medium - 에러 핸들링 개선

---

## 🟢 중요도 낮음 (Low Priority)

### 7. Config 깊은 병합 (Deep Merge)

**파일**: `server/server.ts:119-125`

**현재 상태**:
```typescript
// Merge config (runtime > file > defaults)
const finalConfig: ServerConfig = {
    ...fileConfig,
    ...config,
    port: config?.port ?? fileConfig?.port ?? 4000,
    host: config?.host ?? fileConfig?.host ?? 'localhost',
};
```

**문제점**:
- 중첩 객체 (database, middleware, shutdown 등)가 얕은 복사됨
- 부분적 설정 덮어쓰기 불가

**예시**:
```typescript
// server.config.ts
export default {
    database: {
        pool: { max: 20 },
        healthCheck: { enabled: true },
    },
};

// Runtime
await startServer({
    database: {
        pool: { idleTimeout: 60 },
    },
});

// 결과: healthCheck 설정이 완전히 사라짐 (얕은 복사)
// 기대: pool.max=20, pool.idleTimeout=60, healthCheck.enabled=true
```

**개선안**:
```typescript
// utils/deep-merge.ts
export function deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (
            sourceValue &&
            typeof sourceValue === 'object' &&
            !Array.isArray(sourceValue) &&
            targetValue &&
            typeof targetValue === 'object' &&
            !Array.isArray(targetValue)
        ) {
            result[key] = deepMerge(targetValue, sourceValue);
        } else if (sourceValue !== undefined) {
            result[key] = sourceValue as any;
        }
    }

    return result;
}

// server.ts
import { deepMerge } from '../utils/deep-merge.js';

const finalConfig: ServerConfig = deepMerge(
    deepMerge(
        {
            port: 4000,
            host: 'localhost',
            middleware: {},
            database: {},
        },
        fileConfig
    ),
    config ?? {}
);
```

**우선순위**: 🟢 Low - 편의성 개선

---

### 8. 미들웨어 순서 제어

**파일**: `server/server.ts:60-72`

**현재 상태**:
```typescript
// 1. Default middleware (can be disabled)
if (enableLogger) {
    app.use('*', RequestLogger());
}

if (enableCors && config?.cors !== false) {
    app.use('*', cors(config?.cors));
}

// 2. Custom middleware from config
config?.use?.forEach(mw => app.use('*', mw));
```

**문제점**:
- 내장 미들웨어 순서가 고정됨 (Logger → CORS → Custom)
- 사용자가 순서 제어 불가
- 특정 미들웨어를 커스텀 미들웨어 이후에 실행하고 싶을 수 있음

**개선안**:
```typescript
export interface ServerConfig {
    // ... 기존 설정

    /**
     * Middleware execution order
     * @default ['logger', 'cors', 'custom']
     */
    middlewareOrder?: ('logger' | 'cors' | 'custom')[];
}

// server.ts
const middlewareOrder = config?.middlewareOrder ?? ['logger', 'cors', 'custom'];

const middlewareMap = {
    logger: () => {
        if (enableLogger) {
            app.use('*', RequestLogger());
        }
    },
    cors: () => {
        if (enableCors && config?.cors !== false) {
            app.use('*', cors(config?.cors));
        }
    },
    custom: () => {
        config?.use?.forEach(mw => app.use('*', mw));
    },
};

// Apply middleware in specified order
middlewareOrder.forEach(name => {
    const applyMiddleware = middlewareMap[name];
    if (applyMiddleware) {
        applyMiddleware();
    }
});
```

**우선순위**: 🟢 Low - 고급 커스터마이징

---

## 📊 요약 및 우선순위

### 즉시 수정 필요 (🔴 Critical)

1. ✅ **서버 타임아웃 설정** (완료) - 보안 및 리소스 관리 필수
2. ✅ **환경변수 PORT/HOST 지원** (완료) - 배포 환경 표준

### 다음 릴리스 (🟡 Important)

3. ✅ **서버 인스턴스 반환** (완료) - 테스트 및 유연성
4. **Graceful Shutdown 타임아웃** - 프로덕션 안정성
5. **Health Check 엔드포인트** - 모니터링 및 오케스트레이션
6. **초기화 실패 처리** - 에러 핸들링 개선

### 장기 개선 (🟢 Nice to Have)

7. **Config 깊은 병합** - 설정 편의성
8. **미들웨어 순서 제어** - 고급 커스터마이징

---

## 🎯 실행 계획 제안

### Phase 1: 필수 기능 (1일)
- [ ] 서버 타임아웃 설정
- [ ] 환경변수 PORT/HOST 지원
- [ ] Health check 엔드포인트

### Phase 2: 안정성 (1일)
- [ ] 서버 인스턴스 반환
- [ ] Graceful shutdown 타임아웃
- [ ] 초기화 실패 처리

### Phase 3: 편의성 (선택)
- [ ] Config 깊은 병합
- [ ] 미들웨어 순서 제어

---

**작성자**: Claude Code Assistant
**최종 업데이트**: 2025-10-11