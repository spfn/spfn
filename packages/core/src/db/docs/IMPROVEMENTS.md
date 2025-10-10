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

### 2. Drizzle Schema 미전달로 Relational Query API 사용 불가

**파일**: `manager/factory.ts:92-94`, `manager/factory.ts:113-115`

**문제점**:
```typescript
// Schema 없이 drizzle 초기화
return {
    write: drizzle(writeClient),
    read: drizzle(readClient),
};
```

**개선안**:
```typescript
// Option 1: Schema를 자동 탐지 (entities 폴더에서)
import * as schema from '../entities/index.js';

return {
    write: drizzle(writeClient, { schema }),
    read: drizzle(readClient, { schema }),
};

// Option 2: 설정으로 받기
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
```

**영향**:
- Repository의 `findByIdWith()`, `findManyWith()` 등 relational query 메서드 사용 불가
- 테스트에서 명시적으로 schema를 전달해야 하는 번거로움

---

### 3. Error 처리 불일치 (console.error vs logger)

**파일**: `manager/factory.ts:149-151`, `manager/manager.ts:130-131`

**문제점**:
```typescript
// console.error 사용
console.error('❌ Failed to create database connection:', message);

// logger 사용
logger.error('Database connection failed:', message);
```

**개선안**:
```typescript
// 모든 곳에서 logger 사용 + 구조화된 로깅
const dbLogger = logger.child('database');

dbLogger.error('Failed to create database connection', {
    error: message,
    stage: 'initialization',
    hasWriteUrl: !!process.env.DATABASE_WRITE_URL,
    hasReadUrl: !!process.env.DATABASE_READ_URL,
});
```

**영향**: 로그 추적 어려움, 프로덕션 모니터링 불가

---

### 4. Transaction 타임아웃 미구현

**파일**: `transaction/middleware.ts:102-195`

**문제점**:
```typescript
// 트랜잭션 타임아웃 없음 - 무한 대기 가능
await db.transaction(async (tx) => {
    await runWithTransaction(tx, async () => {
        await next(); // 무한 대기 가능
    });
});
```

**개선안**:
```typescript
export interface TransactionalOptions {
    slowThreshold?: number;
    enableLogging?: boolean;
    timeout?: number; // 추가: 기본 30초
}

export function Transactional(options: TransactionalOptions = {}) {
    const { timeout = 30000 } = options;

    return createMiddleware(async (c, next) => {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new TransactionError(
                    `Transaction timeout after ${timeout}ms`
                ));
            }, timeout);
        });

        const txPromise = db.transaction(async (tx) => {
            await runWithTransaction(tx, async () => {
                await next();
            });
        });

        await Promise.race([txPromise, timeoutPromise]);
    });
}
```

**영향**: 긴 트랜잭션으로 인한 DB lock, 성능 저하

---

### 5. Repository Factory의 Transaction 컨텍스트 무시

**파일**: `repository/factory.ts:122-152`

**문제점**:
```typescript
// Repository 인스턴스를 캐싱하는데, 트랜잭션 컨텍스트는 Repository 내부에서만 처리
// 이로 인해 잠재적 혼동 가능
export function getRepository<TTable extends PgTable>(
    table: TTable,
    RepositoryClass?: new (table: TTable) => Repository<TTable>
): Repository<TTable> {
    const cacheKey = getCacheKey(table, RepositoryClass);
    let repo = repositoryCache.get(cacheKey);

    if (!repo) {
        repo = RepositoryClass ? new RepositoryClass(table) : new Repository(table);
        repositoryCache.set(cacheKey, repo);
    }

    return repo;
}
```

**현재 동작**:
- Repository 인스턴스는 싱글톤으로 캐싱됨
- Repository 내부의 `getReadDb()`, `getWriteDb()`에서 매번 `getTransaction()` 호출
- 트랜잭션 컨텍스트는 정상 작동하지만, 캐싱의 이점이 불명확

**개선안**: 문서화 보강
```typescript
/**
 * Get or create a Repository singleton instance
 *
 * 🔄 Transaction Handling:
 * Repository instances are cached globally, but they automatically detect
 * and use transaction context via AsyncLocalStorage in each method call.
 * This means:
 * - Same repository instance can be used both inside and outside transactions
 * - No need to create separate repository instances per transaction
 * - Transaction safety is guaranteed by AsyncLocalStorage context
 *
 * @example
 * ```typescript
 * // Both inside and outside transaction - same instance
 * const repo = getRepository(users);
 *
 * // Outside transaction - uses default DB
 * await repo.findById(1);
 *
 * // Inside Transactional() middleware - uses transaction
 * app.use(Transactional());
 * app.post('/', async (c) => {
 *   await repo.save(data); // Uses transaction automatically
 * });
 * ```
 */
export function getRepository<...>(...) { ... }
```

---

## 🟡 중요도 중간 (Medium Priority)

### 6. Pool Config 환경변수 오버라이드 불가

**파일**: `manager/config.ts:39-47`

**문제점**:
```typescript
// 환경변수로 오버라이드 불가
export function getPoolConfig(): PoolConfig {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        max: isProduction ? 20 : 10,
        idleTimeout: isProduction ? 30 : 20,
    };
}
```

**개선안**:
```typescript
export function getPoolConfig(): PoolConfig {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        max: parseInt(process.env.DB_POOL_MAX || '')
            || (isProduction ? 20 : 10),
        idleTimeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '')
            || (isProduction ? 30 : 20),
    };
}
```

**영향**: 프로덕션 튜닝 불가, 환경별 최적화 어려움

---

### 7. Connection Health Check 누락

**파일**: `manager/manager.ts:91-146`

**문제점**:
```typescript
// 초기화 시 한 번만 체크
await write.execute('SELECT 1');

// 이후 주기적 health check 없음
```

**개선안**:
```typescript
let healthCheckInterval: NodeJS.Timeout | undefined;

export async function startHealthCheck(intervalMs: number = 60000): Promise<void> {
    if (healthCheckInterval) return;

    healthCheckInterval = setInterval(async () => {
        try {
            const write = getDatabase('write');
            const read = getDatabase('read');

            if (write) await write.execute('SELECT 1');
            if (read && read !== write) await read.execute('SELECT 1');

            dbLogger.debug('Database health check passed');
        } catch (error) {
            dbLogger.error('Database health check failed', error);
            // Optionally: 재연결 시도
        }
    }, intervalMs);
}

export function stopHealthCheck(): void {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = undefined;
    }
}
```

**영향**: 연결 끊김 감지 지연, 복구 시간 증가

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

1. ✅ **Connection Pool 정리** - 메모리 누수 방지
2. ✅ **Schema 전달** - Relational Query 활성화
3. ✅ **Logger 통일** - 프로덕션 모니터링
4. ✅ **Transaction Timeout** - 무한 대기 방지

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