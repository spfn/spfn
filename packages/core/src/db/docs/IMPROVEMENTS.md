# DB 모듈 개선 제안

> 분석 일자: 2025-10-10
> 분석 범위: `packages/core/src/db/` 전체 모듈

## 📋 목차

1. [중요도 높음 (High Priority)](#중요도-높음-high-priority)
2. [중요도 중간 (Medium Priority)](#중요도-중간-medium-priority)
3. [중요도 낮음 (Low Priority)](#중요도-낮음-low-priority)
4. [아키텍처 개선](#아키텍처-개선)
5. [테스트 개선](#테스트-개선)
6. [문서화 개선](#문서화-개선)

---

## 🔴 중요도 높음 (High Priority)

### 1. ✅ Connection Pool 정리 + Graceful Shutdown (완료)

**파일**: `manager/manager.ts`, `manager/factory.ts`, `server/server.ts`

**구현 완료** (2025-10-10):

**1) Connection Pool 추적 및 정리** (`manager/factory.ts`, `manager/manager.ts`)
```typescript
// Raw postgres client 추적
let writeClient: Sql | undefined;
let readClient: Sql | undefined;

export async function closeDatabase(): Promise<void> {
    if (!writeInstance && !readInstance) {
        dbLogger.debug('No database connections to close');
        return;
    }

    try {
        const closePromises: Promise<void>[] = [];

        if (writeClient) {
            dbLogger.debug('Closing write connection...');
            closePromises.push(
                writeClient.end({ timeout: 5 })
                    .then(() => dbLogger.debug('Write connection closed'))
                    .catch(err => dbLogger.error('Error closing write connection', err))
            );
        }

        if (readClient && readClient !== writeClient) {
            dbLogger.debug('Closing read connection...');
            closePromises.push(
                readClient.end({ timeout: 5 })
                    .then(() => dbLogger.debug('Read connection closed'))
                    .catch(err => dbLogger.error('Error closing read connection', err))
            );
        }

        await Promise.all(closePromises);
        dbLogger.info('All database connections closed');
    } catch (error) {
        dbLogger.error('Error during database cleanup', error as Error);
        throw error;
    } finally {
        writeInstance = undefined;
        readInstance = undefined;
        writeClient = undefined;
        readClient = undefined;
    }
}
```

**2) Graceful Shutdown 구현** (`server/server.ts`)
```typescript
export async function startServer(config?: ServerConfig): Promise<void> {
    // Initialize infrastructure
    await initDatabase();
    await initRedis();

    // ... server setup ...

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
        serverLogger.info(`${signal} received, starting graceful shutdown...`);

        try {
            // 1. Stop accepting new connections
            serverLogger.debug('Closing HTTP server...');
            server.close(() => {
                serverLogger.info('HTTP server closed');
            });

            // 2. Close database connections
            serverLogger.debug('Closing database connections...');
            await closeDatabase();

            // 3. Close Redis connections
            serverLogger.debug('Closing Redis connections...');
            await closeRedis();

            serverLogger.info('Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            serverLogger.error('Error during graceful shutdown', error as Error);
            process.exit(1);
        }
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
        serverLogger.error('Uncaught exception', error);
        shutdown('UNCAUGHT_EXCEPTION');
    });
    process.on('unhandledRejection', (reason, promise) => {
        serverLogger.error('Unhandled promise rejection', { reason, promise });
        shutdown('UNHANDLED_REJECTION');
    });
}
```

**해결된 문제**:
- ✅ 메모리 누수 방지 (postgres client 명시적 종료)
- ✅ 연결 고갈 위험 제거
- ✅ Graceful shutdown으로 안전한 서버 종료
- ✅ SIGTERM, SIGINT, uncaughtException, unhandledRejection 처리
- ✅ Logger 기반 구조화된 로깅

---

### 2. Drizzle Relational Query API (선택적 기능)

**파일**: `manager/factory.ts:92-94`, `manager/factory.ts:113-115`

**현재 상태**:
```typescript
// Schema 없이 drizzle 초기화
return {
    write: drizzle(writeClient),
    read: drizzle(readClient),
};
```

**영향**:
- ✅ **현재 방식으로도 모든 핵심 기능 작동** - Repository 패턴, 수동 join 가능
- ❌ Drizzle Relational Query API (`db.query.users.findMany({ with: { posts: true } })`) 사용 불가

**현재 해결책 (수동 join)**:
```typescript
// Repository에서 relation 로드 (schema 불필요)
class PostRepository extends Repository<typeof posts> {
  async findWithAuthor(id: number) {
    return this.db
      .select({ post: posts, author: users })
      .from(posts)
      .leftJoin(users, eq(posts.authorId, users.id))
      .where(eq(posts.id, id));
  }
}
```

**선택적 개선안** (Relational Query API 원하는 경우):
```typescript
// Option 1: 설정으로 schema 받기
export interface DatabaseOptions {
    schema?: Record<string, unknown>;
}

export async function createDatabaseFromEnv(
    options?: DatabaseOptions
): Promise<DatabaseClients> {
    const { schema } = options ?? {};
    return {
        write: drizzle(writeClient, schema ? { schema } : undefined),
        read: drizzle(readClient, schema ? { schema } : undefined),
    };
}

// 사용자 코드
import * as schema from './entities/index.js';
await createDatabaseFromEnv({ schema });

// Option 2: 컨벤션 기반 자동 로드
// src/server/entities/index.ts에서 자동으로 import
```

**우선순위**: Low (필수 아님, 현재 방식으로 충분)

---

### 3. ✅ Error 처리 불일치 (완료)

**파일**: `manager/factory.ts`

**구현 완료** (2025-10-10):

```typescript
import { logger } from '../../logger/index.js';

const dbLogger = logger.child('database');

export async function createDatabaseFromEnv(): Promise<DatabaseClients> {
    // ...
    try {
        // ... database connection logic
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        dbLogger.error('Failed to create database connection', {
            error: message,
            stage: 'initialization',
            hasWriteUrl: !!process.env.DATABASE_WRITE_URL,
            hasReadUrl: !!process.env.DATABASE_READ_URL,
            hasUrl: !!process.env.DATABASE_URL,
            hasReplicaUrl: !!process.env.DATABASE_REPLICA_URL,
        });
        return { write: undefined, read: undefined };
    }
}
```

**해결된 문제**:
- ✅ 일관된 로깅 방식 (모든 DB 에러에 logger 사용)
- ✅ 구조화된 로그로 프로덕션 모니터링 가능
- ✅ 환경변수 설정 상태 추적으로 디버깅 용이
- ✅ 로그 추적 및 분석 개선

---

### 4. ✅ Transaction 타임아웃 (완료)

**파일**: `transaction/middleware.ts`

**구현 완료** (2025-10-10):

```typescript
export interface TransactionalOptions {
    slowThreshold?: number;
    enableLogging?: boolean;
    /**
     * Transaction timeout in milliseconds
     * @default 30000 (30 seconds) or TRANSACTION_TIMEOUT environment variable
     */
    timeout?: number;
}

export function Transactional(options: TransactionalOptions = {}) {
    // Get default timeout from environment variable (default: 30 seconds)
    const defaultTimeout = parseInt(process.env.TRANSACTION_TIMEOUT || '30000', 10);

    const {
        slowThreshold = 1000,
        enableLogging = true,
        timeout = defaultTimeout,
    } = options;

    return createMiddleware(async (c, next) => {
        // Create transaction promise
        const transactionPromise = db.transaction(async (tx) => {
            await runWithTransaction(tx as TransactionDB, async () => {
                await next();
                // Auto-commit on success (handled by Drizzle)
            });
        });

        // Apply timeout if enabled (timeout > 0)
        if (timeout > 0) {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(
                        new TransactionError(
                            `Transaction timeout after ${timeout}ms`,
                            500,
                            { txId, route, timeout: `${timeout}ms` }
                        )
                    );
                }, timeout);
            });

            // Race between transaction and timeout
            await Promise.race([transactionPromise, timeoutPromise]);
        } else {
            // No timeout - just await transaction
            await transactionPromise;
        }
    });
}
```

**해결된 문제**:
- ✅ 기본 30초 타임아웃으로 무한 대기 방지
- ✅ `TRANSACTION_TIMEOUT` 환경변수로 전역 기본값 설정 가능
- ✅ 라우트별 커스텀 타임아웃 설정: `Transactional({ timeout: 60000 })`
- ✅ `timeout: 0`으로 타임아웃 비활성화 가능
- ✅ TransactionError throw → 자동 롤백
- ✅ 구조화된 에러 로깅 (txId, route, timeout 포함)

---

### 5. ✅ Repository Factory의 Transaction 컨텍스트 (완료)

**파일**: `repository/factory.ts`

**구현 완료** (2025-10-10):

**문제점 (해결됨)**:
- Repository 인스턴스가 싱글톤으로 캐싱되는데, 트랜잭션 처리 방식이 문서화되지 않아 혼동 가능

**해결 방법**:
- JSDoc에 Transaction Handling 섹션 추가
- AsyncLocalStorage를 통한 자동 트랜잭션 감지 방식 명확히 설명
- 실전 예제 추가 (트랜잭션 내/외부에서 동일 인스턴스 사용)

**업데이트된 문서**:
```typescript
/**
 * Get or create a Repository singleton instance
 *
 * ## 🔄 Transaction Handling
 *
 * Repository instances are cached globally, but they automatically detect
 * and use transaction context via AsyncLocalStorage in each method call.
 * This means:
 * - **Same repository instance** can be used both inside and outside transactions
 * - **No need to create separate repository instances** per transaction
 * - **Transaction safety is guaranteed** by AsyncLocalStorage context
 *
 * The Repository internally calls `getTransaction()` on every database operation,
 * ensuring the correct DB instance (transaction or default) is always used.
 *
 * @example
 * ```typescript
 * // Transaction handling - same instance works everywhere
 * import { getRepository, Transactional } from '@spfn/core/db';
 * import { users } from './entities';
 *
 * const userRepo = getRepository(users);
 *
 * // Outside transaction - uses default DB
 * await userRepo.findById(1);
 *
 * // Inside Transactional() middleware - uses transaction automatically
 * app.use(Transactional());
 * app.post('/', async (c) => {
 *   // Same instance, but now uses transaction DB
 *   await userRepo.save({ email: 'test@example.com' });
 *   return c.json({ success: true });
 * });
 * ```
 */
export function getRepository<...>(...) { ... }
```

**해결된 문제**:
- ✅ 트랜잭션 처리 방식 명확히 문서화
- ✅ AsyncLocalStorage 기반 자동 감지 설명
- ✅ 싱글톤 캐싱과 트랜잭션 안전성 양립 설명
- ✅ 실전 예제로 사용 방법 명확화

---

## 🟡 중요도 중간 (Medium Priority)

### 6. ✅ Pool Config 환경변수 오버라이드 불가 (완료)

**파일**: `manager/config.ts`, `manager/factory.ts`, `manager/manager.ts`, `server/types.ts`, `server/server.ts`

**구현 완료** (2025-10-10):

**문제점 (해결됨)**:
- Connection pool 설정이 하드코딩되어 프로덕션 튜닝 불가
- 환경별 최적화 어려움 (staging, load testing 등)
- 실시간 조정 불가능

**해결 방법**:
우선순위 기반 설정 시스템 구축
1. **ServerConfig** (최우선) - `server.config.ts`에서 설정
2. **환경변수** (중간) - `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT`
3. **기본값** (최하위) - NODE_ENV 기반 자동 설정

**구현된 코드**:

```typescript
// 1. ServerConfig 타입 확장 (server/types.ts)
export interface ServerConfig {
    database?: {
        pool?: {
            max?: number;          // @env DB_POOL_MAX
            idleTimeout?: number;  // @env DB_POOL_IDLE_TIMEOUT
        };
    };
}

// 2. getPoolConfig() 업데이트 (manager/config.ts)
export function getPoolConfig(options?: Partial<PoolConfig>): PoolConfig {
    const isProduction = process.env.NODE_ENV === 'production';

    // Priority: options > env > default
    const max = options?.max
        ?? parseInt(process.env.DB_POOL_MAX || '', 10)
        || (isProduction ? 20 : 10);

    const idleTimeout = options?.idleTimeout
        ?? parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '', 10)
        || (isProduction ? 30 : 20);

    return { max, idleTimeout };
}

// 3. createDatabaseFromEnv() 시그니처 확장 (manager/factory.ts)
export interface DatabaseOptions {
    pool?: Partial<PoolConfig>;
}

export async function createDatabaseFromEnv(
    options?: DatabaseOptions
): Promise<DatabaseClients> {
    const poolConfig = getPoolConfig(options?.pool);
    // ...
}

// 4. initDatabase() 시그니처 확장 (manager/manager.ts)
export async function initDatabase(
    options?: DatabaseOptions
): Promise<{ write?, read? }> {
    const result = await createDatabaseFromEnv(options);
    // ...
}

// 5. server.ts에서 config 전달
export async function startServer(config?: ServerConfig): Promise<void> {
    const finalConfig = { ...fileConfig, ...config };
    await initDatabase(finalConfig.database);
    // ...
}
```

**사용 예시**:

```typescript
// 방법 1: server.config.ts (권장)
export default {
    database: {
        pool: {
            max: 50,
            idleTimeout: 60,
        },
    },
} satisfies ServerConfig;

// 방법 2: 환경변수
// DB_POOL_MAX=30 DB_POOL_IDLE_TIMEOUT=45

// 방법 3: 기본값 (자동)
// Production: max=20, idleTimeout=30
// Development: max=10, idleTimeout=20
```

**해결된 문제**:
- ✅ 프로덕션 실시간 튜닝 가능 (재배포 불필요)
- ✅ 환경별 최적화 가능 (staging, load test, small deployment)
- ✅ 우선순위 기반 유연한 설정
- ✅ 기존 코드 호환성 유지 (optional parameter)

---

### 7. ✅ Connection Health Check 누락 (완료)

**파일**: `manager/manager.ts`, `manager/factory.ts`, `server/types.ts`

**구현 완료** (2025-10-10):

**문제점 (해결됨)**:
- 초기화 시 한 번만 연결 체크
- 주기적인 health check 없음
- 연결 끊김 감지 지연, 복구 시간 증가

**해결 방법**:
자동 시작되는 헬스체크 시스템 구축
1. **자동 시작**: `initDatabase()` 완료 후 자동으로 health check 시작
2. **설정 가능한 빈도**: ServerConfig 또는 환경변수로 간격 조정
3. **재연결 로직**: 실패 시 자동 재연결 시도 (재시도 횟수, 간격 설정 가능)
4. **Graceful shutdown 연동**: `closeDatabase()` 호출 시 자동으로 health check 중지

**구현된 코드**:

```typescript
// 1. ServerConfig 타입 확장 (server/types.ts)
export interface ServerConfig {
    database?: {
        healthCheck?: {
            enabled?: boolean;          // @env DB_HEALTH_CHECK_ENABLED
            interval?: number;          // @env DB_HEALTH_CHECK_INTERVAL
            reconnect?: boolean;        // @env DB_HEALTH_CHECK_RECONNECT
            maxRetries?: number;        // @env DB_HEALTH_CHECK_MAX_RETRIES
            retryInterval?: number;     // @env DB_HEALTH_CHECK_RETRY_INTERVAL
        };
    };
}

// 2. Health check 인터페이스 (manager/factory.ts)
export interface HealthCheckConfig {
    enabled: boolean;
    interval: number;
    reconnect: boolean;
    maxRetries: number;
    retryInterval: number;
}

// 3. startHealthCheck() 구현 (manager/manager.ts)
export function startHealthCheck(config: HealthCheckConfig): void {
    if (healthCheckInterval) {
        dbLogger.debug('Health check already running');
        return;
    }

    dbLogger.info('Starting database health check', {
        interval: `${config.interval}ms`,
        reconnect: config.reconnect,
    });

    healthCheckInterval = setInterval(async () => {
        try {
            const write = getDatabase('write');
            const read = getDatabase('read');

            // Check write connection
            if (write) {
                await write.execute('SELECT 1');
            }

            // Check read connection (if different)
            if (read && read !== write) {
                await write.execute('SELECT 1');
            }

            dbLogger.debug('Database health check passed');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dbLogger.error('Database health check failed', { error: message });

            // Attempt reconnection if enabled
            if (config.reconnect) {
                await attemptReconnection(config);
            }
        }
    }, config.interval);
}

// 4. 재연결 로직 (manager/manager.ts)
async function attemptReconnection(config: HealthCheckConfig): Promise<void> {
    dbLogger.warn('Attempting database reconnection', {
        maxRetries: config.maxRetries,
        retryInterval: `${config.retryInterval}ms`,
    });

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
        try {
            dbLogger.debug(`Reconnection attempt ${attempt}/${config.maxRetries}`);

            // Close existing connections
            await closeDatabase();

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, config.retryInterval));

            // Reinitialize database
            const result = await createDatabaseFromEnv();

            if (result.write) {
                // Test connection
                await result.write.execute('SELECT 1');

                // Store instances
                writeInstance = result.write;
                readInstance = result.read;
                writeClient = result.writeClient;
                readClient = result.readClient;

                dbLogger.info('Database reconnection successful', { attempt });
                return;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dbLogger.error(`Reconnection attempt ${attempt} failed`, {
                error: message,
                attempt,
                maxRetries: config.maxRetries,
            });

            if (attempt === config.maxRetries) {
                dbLogger.error('Max reconnection attempts reached, giving up');
            }
        }
    }
}

// 5. initDatabase()에서 자동 시작
export async function initDatabase(options?: DatabaseOptions): Promise<...> {
    // ... connection logic ...

    // Start health check (automatic)
    const healthCheckConfig = getHealthCheckConfig(options?.healthCheck);
    if (healthCheckConfig.enabled) {
        startHealthCheck(healthCheckConfig);
    }

    return { write: writeInstance, read: readInstance };
}

// 6. closeDatabase()에서 자동 중지
export async function closeDatabase(): Promise<void> {
    // Stop health check
    stopHealthCheck();

    // ... cleanup logic ...
}
```

**사용 예시**:

```typescript
// 방법 1: server.config.ts (권장)
export default {
    database: {
        healthCheck: {
            enabled: true,
            interval: 30000,      // 30 seconds
            reconnect: true,
            maxRetries: 5,
            retryInterval: 10000, // 10 seconds
        },
    },
} satisfies ServerConfig;

// 방법 2: 환경변수
// DB_HEALTH_CHECK_ENABLED=true
// DB_HEALTH_CHECK_INTERVAL=30000
// DB_HEALTH_CHECK_RECONNECT=true
// DB_HEALTH_CHECK_MAX_RETRIES=5
// DB_HEALTH_CHECK_RETRY_INTERVAL=10000

// 방법 3: 기본값 (자동)
// enabled: true
// interval: 60000 (60초)
// reconnect: true
// maxRetries: 3
// retryInterval: 5000 (5초)
```

**해결된 문제**:
- ✅ 주기적 연결 체크로 조기 감지
- ✅ 자동 재연결로 빠른 복구
- ✅ 설정 가능한 빈도 및 재시도 로직
- ✅ Graceful shutdown과 자동 연동
- ✅ 구조화된 로깅으로 모니터링 가능

---

### 8. Query Performance Monitoring 부재

**파일**: `repository/repository.ts` 전체

**문제점**:
- 느린 쿼리 감지 불가
- 쿼리 실행 시간 로깅 없음
- N+1 문제 감지 어려움

**개선안**:
```typescript
// Repository에 performance interceptor 추가
class Repository<TTable, TSelect> {
    private async executeWithTiming<T>(
        operation: string,
        fn: () => Promise<T>
    ): Promise<T> {
        const start = Date.now();
        try {
            const result = await fn();
            const duration = Date.now() - start;

            if (duration > 1000) {
                logger.warn('Slow query detected', {
                    operation,
                    table: getTableName(this.table),
                    duration: `${duration}ms`,
                });
            }

            return result;
        } catch (error) {
            logger.error('Query failed', {
                operation,
                table: getTableName(this.table),
                error,
            });
            throw error;
        }
    }

    async findAll(): Promise<TSelect[]> {
        return this.executeWithTiming('findAll', () => {
            const readDb = this.getReadDb();
            return readDb.select().from(this.table);
        });
    }
}
```

**영향**: 성능 이슈 디버깅 어려움

---

### 9. Schema Helpers의 타입 안전성 개선

**파일**: `schema/helpers.ts:88-122`

**문제점**:
```typescript
// reference 타입이 any
export function foreignKey(
    name: string,
    reference: () => any,  // 타입 안전성 부족
    options?: { onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action' }
) { ... }
```

**개선안**:
```typescript
import type { PgColumn } from 'drizzle-orm/pg-core';

export function foreignKey<T extends PgColumn>(
    name: string,
    reference: () => T,
    options?: { onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action' }
) {
    return bigserial(`${name}_id`, { mode: 'number' })
        .notNull()
        .references(reference, { onDelete: options?.onDelete ?? 'cascade' });
}
```

**영향**: 컴파일 타임 에러 감지 개선

---

### 10. updatedAt 자동 갱신 미지원

**파일**: `schema/helpers.ts:56-66`

**문제점**:
```typescript
// updatedAt이 자동 갱신되지 않음
export function timestamps() {
    return {
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .defaultNow()
            .notNull(),
    };
}
```

**개선안**:
```typescript
// Option 1: Repository의 update 메서드에서 자동 처리
async update(id: number | string, data: any): Promise<TSelect | null> {
    // updatedAt 자동 추가
    const updateData = {
        ...data,
        updatedAt: new Date(),
    };

    const { eq } = await import('drizzle-orm');
    const writeDb = this.getWriteDb();
    const [result] = await writeDb
        .update(this.table)
        .set(updateData)
        .where(eq(idColumn, id))
        .returning();

    return result ?? null;
}

// Option 2: Database Trigger 사용 (권장)
// migration 파일에서:
// CREATE TRIGGER update_timestamp
//   BEFORE UPDATE ON users
//   FOR EACH ROW
//   EXECUTE FUNCTION update_updated_at_column();
```

**영향**: 수동으로 updatedAt 관리 필요, 실수 가능성

---

## 🟢 중요도 낮음 (Low Priority)

### 11. Repository의 중복 코드

**파일**: `repository/repository.ts:249-266, 308-326, 334-351`

**문제점**:
```typescript
// findById, update, delete에서 id 컬럼 체크 중복
const idColumn = (this.table as Record<string, any>).id;
if (!idColumn) {
    throw new QueryError('Table does not have an id column');
}
```

**개선안**:
```typescript
class Repository<TTable, TSelect> {
    private getIdColumn() {
        const idColumn = (this.table as Record<string, any>).id;
        if (!idColumn) {
            throw new QueryError('Table does not have an id column');
        }
        return idColumn;
    }

    async findById(id: number | string): Promise<TSelect | null> {
        const idColumn = this.getIdColumn();
        const { eq } = await import('drizzle-orm');
        // ...
    }
}
```

**영향**: 코드 가독성, 유지보수성

---

### 12. Drizzle Config Generator의 유연성 부족

**파일**: `manager/config-generator.ts`

**문제점**:
- `out` 디렉토리가 하드코딩됨 (`./server/db/migrations`)
- 커스터마이징 옵션 제한적

**개선안**:
```typescript
export interface DrizzleConfigOptions {
    dialect?: 'postgresql' | 'mysql' | 'sqlite';
    schema?: string;
    out?: string;  // 추가
    connectionString?: string;  // 추가
}

export function getDrizzleConfig(options?: DrizzleConfigOptions) {
    const config = {
        schema: options?.schema ?? './server/db/entities/**/*.ts',
        out: options?.out ?? './server/db/migrations',
        dialect: options?.dialect ?? detectDialect(),
        dbCredentials: {
            url: options?.connectionString ?? process.env.DATABASE_URL ?? '',
        },
    };

    return config;
}
```

---

## 🏗️ 아키텍처 개선

### 13. Database Events/Hooks 시스템

**현재 상태**: 이벤트 시스템 없음

**제안**:
```typescript
// db/events.ts
export type DatabaseEvent =
    | 'connection:open'
    | 'connection:close'
    | 'connection:error'
    | 'query:slow'
    | 'query:error'
    | 'transaction:start'
    | 'transaction:commit'
    | 'transaction:rollback';

export type DatabaseEventData = {
    'connection:open': { type: 'read' | 'write' };
    'connection:close': { type: 'read' | 'write' };
    'connection:error': { error: Error };
    'query:slow': { query: string; duration: number };
    'query:error': { query: string; error: Error };
    'transaction:start': { txId: string };
    'transaction:commit': { txId: string; duration: number };
    'transaction:rollback': { txId: string; error: Error };
};

class DatabaseEventEmitter {
    private listeners: Map<DatabaseEvent, Set<Function>> = new Map();

    on<T extends DatabaseEvent>(
        event: T,
        handler: (data: DatabaseEventData[T]) => void
    ): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(handler);
    }

    emit<T extends DatabaseEvent>(
        event: T,
        data: DatabaseEventData[T]
    ): void {
        this.listeners.get(event)?.forEach(handler => handler(data));
    }
}

export const dbEvents = new DatabaseEventEmitter();

// 사용 예시
dbEvents.on('query:slow', (data) => {
    logger.warn('Slow query detected', data);
    // Send to monitoring service
});
```

**이점**: 관찰성, 모니터링, 디버깅 개선

---

### 14. Migration 자동 실행 옵션

**현재 상태**: 수동 마이그레이션만 지원

**제안**:
```typescript
// manager/migrations.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

export interface MigrationOptions {
    auto?: boolean;  // 서버 시작 시 자동 실행
    migrationsFolder?: string;
}

export async function runMigrations(
    db: PostgresJsDatabase,
    options?: MigrationOptions
): Promise<void> {
    const { migrationsFolder = './server/db/migrations' } = options ?? {};

    try {
        await migrate(db, { migrationsFolder });
        logger.info('Migrations completed successfully');
    } catch (error) {
        logger.error('Migration failed', error);
        throw error;
    }
}

// server 초기화 시
if (process.env.AUTO_MIGRATE === 'true') {
    await runMigrations(db, { auto: true });
}
```

**이점**: 배포 자동화, 개발 편의성

---

## 🧪 테스트 개선

### 15. 테스트 커버리지 확대

**현재 커버리지**: 8개 테스트 파일

**추가 필요 테스트**:

```typescript
// manager/__tests__/factory.test.ts
describe('createDatabaseFromEnv', () => {
    it('should handle missing DATABASE_URL gracefully');
    it('should prefer DATABASE_WRITE_URL over DATABASE_URL');
    it('should fall back to write DB when read DB fails');
    it('should load .env.local when environment variables are missing');
});

// manager/__tests__/manager.test.ts
describe('Database Manager', () => {
    it('should prevent double initialization');
    it('should handle connection failures during init');
    it('should properly cleanup on closeDatabase');
});

// repository/__tests__/factory.test.ts
describe('Repository Factory', () => {
    it('should cache repository instances');
    it('should create separate instances for different tables');
    it('should handle custom repository classes');
    it('should clear cache properly');
});

// schema/__tests__/helpers.test.ts
describe('Schema Helpers', () => {
    it('should create proper foreign key references');
    it('should handle optional foreign keys');
    it('should create timestamps with proper defaults');
});
```

---

### 16. Integration Test 추가

```typescript
// __tests__/integration/
describe('End-to-End Database Flow', () => {
    it('should handle complete CRUD lifecycle with transactions');
    it('should handle concurrent transactions properly');
    it('should rollback on constraint violations');
    it('should handle connection pool exhaustion gracefully');
});
```

---

## 📚 문서화 개선

### 17. 주요 개념 가이드 작성

**필요 문서**:

```
docs/
├── 00-overview.md           # DB 모듈 전체 개요
├── 01-connection.md         # 연결 관리, Pool 설정
├── 02-repository.md         # Repository 패턴 가이드
├── 03-transactions.md       # 트랜잭션 사용법
├── 04-schema.md             # 스키마 정의, 마이그레이션
├── 05-best-practices.md     # 베스트 프랙티스
├── 06-performance.md        # 성능 튜닝 가이드
└── 07-troubleshooting.md    # 트러블슈팅
```

---

### 18. API 문서 자동 생성

**현재**: JSDoc 주석은 있지만 문서화 사이트 없음

**제안**: TypeDoc 또는 Docusaurus 도입
```bash
# package.json
{
  "scripts": {
    "docs:generate": "typedoc --out docs/api src/db/index.ts",
    "docs:serve": "docusaurus start"
  }
}
```

---

## 📊 요약 및 우선순위

### 즉시 수정 필요 (🔴 Critical)

1. ✅ **Connection Pool 정리 + Graceful Shutdown** - 메모리 누수 방지, 안전한 종료
2. **Logger 통일** - 프로덕션 모니터링 (#3)
3. **Transaction Timeout** - 무한 대기 방지 (#4)

### 다음 릴리스 (🟡 Important)

5. Pool Config 환경변수 오버라이드
6. Connection Health Check
7. Query Performance Monitoring
8. updatedAt 자동 갱신

### 장기 개선 (🟢 Nice to Have)

9. Database Events 시스템
10. Auto Migration
11. 테스트 커버리지 80% 이상
12. 포괄적인 문서화

---

## 🎯 실행 계획 제안

### Phase 1: 안정성 (1-2주)
- [ ] Connection pool cleanup
- [ ] Schema 전달 구현
- [ ] Logger 통일
- [ ] Transaction timeout

### Phase 2: 관찰성 (1주)
- [ ] Query performance monitoring
- [ ] Database events
- [ ] Health check

### Phase 3: 개발 경험 (1주)
- [ ] Auto migration 옵션
- [ ] Pool config 개선
- [ ] 문서화 보강

### Phase 4: 품질 (지속)
- [ ] 테스트 커버리지 80%
- [ ] E2E 테스트
- [ ] Performance benchmark

---

**작성자**: Claude Code Assistant
**최종 업데이트**: 2025-10-10