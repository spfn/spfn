# Logger Module

범용 로깅 모듈 - **Adapter 패턴**으로 구현체 교체 가능

코어 모듈 내부에서 일관성 있게 로그를 남기고, 필요시 이메일, 슬랙 등 여러 프로바이더로 오류를 선택적으로 전송할 수 있는 시스템

## 🎯 Adapter 패턴

**Pino에 의존성이 생기지 않도록** 설계되었습니다. 언제든 자체 구현이나 다른 라이브러리로 교체 가능합니다.

```typescript
// 사용자는 항상 동일한 인터페이스만 사용
logger.info('Message');
logger.error('Error', error, { context: 'value' });

// 내부 구현은 환경변수로 선택
// LOGGER_ADAPTER=pino    → Pino 사용 (기본값, 고성능)
// LOGGER_ADAPTER=custom  → 자체 구현 사용
```

### 지원 Adapter

| Adapter | 성능 | 용도 | 의존성 |
|---------|------|------|--------|
| **Pino** | ⚡⚡⚡⚡⚡ | 프로덕션 (기본값) | pino, pino-pretty |
| **Custom** | ⚡⚡⚡ | 완전한 제어 필요시 | 없음 (자체 구현) |
| Winston | - | 향후 지원 예정 | - |

## 📁 디렉토리 구조

```
src/server/core/
├── logger/                # Logger 모듈
│   ├── README.md          # 문서 (이 파일)
│   ├── index.ts           # Adapter 선택 및 메인 export
│   ├── adapters/
│   │   ├── types.ts       # Adapter 인터페이스
│   │   ├── pino.ts        # Pino Adapter (기본값)
│   │   └── custom.ts      # Custom Adapter (자체 구현)
│   ├── logger.ts          # Custom Logger 클래스
│   ├── types.ts           # Custom 타입 정의
│   ├── config.ts          # 환경별 설정
│   ├── formatters.ts      # 로그 포맷팅 유틸리티
│   └── transports/        # Custom Transport 구현체
│       ├── console.ts     # Console Transport
│       └── file.ts        # File Transport
└── middleware/            # Middleware 모듈
    └── request-logger.ts  # Request Logger Middleware
```

## 🚀 빠른 시작

### 기본 사용

```typescript
import { logger } from '@/server/core';

// 기본 로깅
logger.debug('Debug message');
logger.info('Server started');
logger.warn('Warning message');
logger.error('Error occurred');
logger.fatal('Critical error');
```

### 모듈별 Logger

```typescript
import { logger } from '@/server/core';

const dbLogger = logger.child('database');
const apiLogger = logger.child('api');
const authLogger = logger.child('auth');

dbLogger.info('Database connected successfully');
apiLogger.info('Request received', { method: 'POST', path: '/users' });
authLogger.warn('Failed login attempt', { userId: 123 });
```

### Error 로깅

```typescript
try {
  // 어떤 작업...
} catch (error) {
  logger.error('Operation failed', error as Error);

  // Context와 함께
  logger.error('Operation failed', error as Error, {
    userId: 123,
    operation: 'createUser',
  });
}
```

### Context 로깅

```typescript
// Context만
logger.info('Request processed', {
  method: 'POST',
  path: '/api/users',
  duration: 123,
  statusCode: 200,
});

// Context + Error
logger.warn('Retry attempt', error, {
  attempt: 3,
  maxRetries: 5,
  delay: 1000,
});
```

## 📊 로그 레벨

5개의 로그 레벨을 지원하며, 우선순위는 다음과 같습니다:

| 레벨  | 우선순위 | 용도                                      |
|-------|----------|-------------------------------------------|
| debug | 0        | 개발 중 디버깅 정보                       |
| info  | 1        | 일반 정보 (서버 시작, 연결 성공 등)       |
| warn  | 2        | 경고 (재시도, 비정상 상황 등)             |
| error | 3        | 에러 (예외 발생, 작업 실패 등)            |
| fatal | 4        | 치명적 에러 (시스템 중단 수준)            |

## 🚀 배포 시나리오

### 시나리오 1: Kubernetes (기본 권장)

**가장 일반적이고 권장되는 방식**

```yaml
# deployment.yaml
env:
  - name: NODE_ENV
    value: "production"
  - name: LOGGER_ADAPTER
    value: "pino"
  # LOGGER_FILE_ENABLED 설정 안함 (기본: false)
```

**동작:**
```
App → Stdout (JSON)
      ↓
  K8s Pod Logs
      ↓
  Fluentd/Promtail
      ↓
  Loki/Elasticsearch
      ↓
  Grafana/Kibana
```

**장점:**
- ✅ 디스크 관리 불필요
- ✅ 중앙 집중화 자동
- ✅ 컨테이너 재시작 시에도 로그 보존
- ✅ 여러 Pod의 로그 통합 조회

**로그 형식:**
```json
{"level":30,"time":1759539501259,"module":"database","msg":"Database connected"}
{"level":50,"time":1759539501260,"module":"api","err":{"type":"Error","message":"Request failed"},"msg":"Error occurred"}
```

### 시나리오 2: 자체 구축 (VM/Bare Metal)

**파일 로깅이 필요한 경우**

```bash
# .env.local
NODE_ENV=production
LOGGER_ADAPTER=pino
LOGGER_FILE_ENABLED=true   # 파일 로깅 활성화
LOG_DIR=/var/log/myapp
LOG_MAX_FILE_SIZE=50M      # 파일당 최대 크기
LOG_MAX_FILES=30           # 최대 파일 개수
```

**동작:**
```
App → Stdout (JSON) + File (Rotation)
      ↓                     ↓
  콘솔 출력         /var/log/myapp/
                    ├── app.log (현재)
                    ├── app.log.1 (어제)
                    ├── app.log.2
                    └── ...
```

**파일 로테이션:**
- 일별 자동 로테이션 (자정)
- 파일 크기 초과 시 자동 로테이션
- 오래된 파일 자동 삭제 (최대 개수 유지)

**장점:**
- ✅ 로컬 파일 저장 (네트워크 불필요)
- ✅ 자동 로테이션 (디스크 관리)
- ✅ 규정 준수 (로컬 보관 필수 시)

### 시나리오 3: 개발 환경

```bash
# .env.local
NODE_ENV=development
LOGGER_ADAPTER=pino
# 파일 로깅 비활성화 (기본)
```

**동작:**
```
App → Stdout (Pretty Print)
```

**출력 예시:**
```
[2025-10-04 10:15:23.456] INFO  (module: api): Request received
    method: "POST"
    path: "/users"
[2025-10-04 10:15:23.789] ERROR (module: database): Connection failed
    err: {
      "type": "Error",
      "message": "Connection timeout"
    }
```

## 🔧 환경별 설정

### Development

```typescript
{
  level: 'debug',               // 모든 로그 출력
  adapter: 'pino',              // Pino Adapter
  output: 'pretty-print',       // 컬러 출력
  file: false,                  // 파일 로깅 비활성화
}
```

### Production (K8s)

```typescript
{
  level: 'info',                // info 이상만 출력
  adapter: 'pino',              // Pino Adapter
  output: 'stdout-json',        // JSON 출력
  file: false,                  // 파일 로깅 비활성화
}
```

### Production (자체 구축)

```typescript
{
  level: 'info',                // info 이상만 출력
  adapter: 'pino',              // Pino Adapter
  output: 'stdout-json + file', // JSON + 파일
  file: {
    enabled: true,              // 파일 로깅 활성화
    logDir: '/var/log/myapp',
    maxFileSize: '50M',
    maxFiles: 30,
    rotation: 'daily',          // 일별 로테이션
  }
}
```

## 📤 Transport

Transport는 로그를 실제로 출력하는 계층입니다.

### Console Transport

- **항상 활성화**
- stdout (debug, info) / stderr (warn, error, fatal) 분리
- 개발 환경: 컬러 출력
- 프로덕션: 플레인 텍스트

### File Transport

- **프로덕션에서만 활성화**
- 날짜별 로그 파일: `YYYY-MM-DD.log`
- JSON 포맷으로 저장
- 로그 디렉토리: `./logs` (환경변수로 변경 가능)

**출력 예시:**
```json
{"timestamp":"2025-10-04T09:42:03.658Z","level":"info","module":"database","message":"Database connected successfully"}
{"timestamp":"2025-10-04T09:42:03.660Z","level":"warn","message":"Connection retry","context":{"attempt":3},"error":{"name":"Error","message":"Connection timeout","stack":"..."}}
```

### Slack Transport (향후 구현 예정)

- 환경변수: `SLACK_WEBHOOK_URL`, `SLACK_CHANNEL`
- error 레벨 이상만 전송
- 프로덕션에서만 활성화

### Email Transport (향후 구현 예정)

- 환경변수: `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`, `EMAIL_TO`
- fatal 레벨만 전송
- 프로덕션에서만 활성화

## 🎨 로그 포맷

### Console 출력

```
2025-10-04 09:42:03.658 DEBUG Debug message
2025-10-04 09:42:03.659 INFO  Server started
2025-10-04 09:42:03.660 WARN  [database] Connection retry
{
  "attempt": 3,
  "maxRetries": 5
}
Error: Connection timeout
    at /path/to/file.ts:123:45
    ...
```

### JSON 출력 (파일)

```json
{
  "timestamp": "2025-10-04T09:42:03.658Z",
  "level": "warn",
  "module": "database",
  "message": "Connection retry",
  "context": {
    "attempt": 3,
    "maxRetries": 5
  },
  "error": {
    "name": "Error",
    "message": "Connection timeout",
    "stack": "..."
  }
}
```

## 🔌 실제 사용 예시

### DB Connection

```typescript
// src/server/core/db/connection.ts
import { logger } from '../logger';

const dbLogger = logger.child('database');

export async function createDatabaseConnection() {
  try {
    dbLogger.info('Connecting to database...');
    const client = await connect();
    dbLogger.info('Database connected successfully');
    return client;
  } catch (error) {
    dbLogger.error('Database connection failed', error as Error, {
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
    });
    throw error;
  }
}
```

### API Route

```typescript
// src/server/routes/users/index.ts
import { logger } from '@/server/core';

const apiLogger = logger.child('api');

export const GET = async (c: Context) => {
  const start = Date.now();

  apiLogger.info('Request received', {
    method: 'GET',
    path: '/users',
    ip: c.req.header('x-forwarded-for'),
  });

  try {
    const users = await getUsers();

    const duration = Date.now() - start;
    apiLogger.info('Request completed', {
      path: '/users',
      duration,
      count: users.length,
    });

    return c.json(users);
  } catch (error) {
    apiLogger.error('Request failed', error as Error, {
      path: '/users',
      duration: Date.now() - start,
    });
    throw error;
  }
};
```

### Transaction Middleware

```typescript
// src/server/core/transaction.ts
import { logger } from './logger';

const txLogger = logger.child('transaction');

export const Transactional = () => {
  return async (c: Context, next: Next) => {
    txLogger.debug('Transaction started');

    try {
      await db.begin(async (tx) => {
        // 트랜잭션 실행
        await next();
        txLogger.debug('Transaction committed');
      });
    } catch (error) {
      txLogger.warn('Transaction rolled back', error as Error);
      throw error;
    }
  };
};
```

### Request Logger Middleware

**모든 API 요청을 자동으로 로깅**하는 미들웨어입니다. 수동으로 로그를 작성할 필요 없이, 요청/응답/에러를 자동으로 추적합니다.

```typescript
// src/server/app.ts
import { RequestLogger } from '@/server/core';

const app = new Hono();

// 기본 사용 (자동 로깅)
app.use('/*', RequestLogger());

// 커스텀 설정
app.use('/*', RequestLogger({
  excludePaths: ['/health', '/ping'],     // 제외할 경로
  slowRequestThreshold: 500,               // 500ms 이상이면 경고
}));
```

**주요 기능:**

1. **자동 Request ID 생성** - 분산 추적을 위한 고유 ID
   ```json
   {"requestId":"req_1759541628730_qsm7esvo7","method":"POST","path":"/users"}
   ```

2. **응답 시간 측정** - 모든 요청의 처리 시간 자동 기록
   ```json
   {"status":200,"duration":45,"msg":"Request completed"}
   ```

3. **느린 요청 감지** - 임계값 초과 시 자동 경고
   ```json
   {"duration":1250,"threshold":500,"msg":"Slow request detected"}
   ```

4. **에러 자동 로깅** - 예외 발생 시 자동으로 에러 로그 기록
   ```json
   {"level":50,"err":{"type":"Error","message":"..."},"msg":"Request failed"}
   ```

5. **제외 경로 설정** - 헬스체크 등 불필요한 로그 제외
   ```typescript
   excludePaths: ['/health', '/ping', '/favicon.ico']  // 기본값
   ```

**로그 출력 예시:**

```json
// Request received (info)
{"level":30,"time":1759541628730,"module":"api","requestId":"req_1759541628730_qsm7esvo7","method":"POST","path":"/users","ip":"127.0.0.1","userAgent":"...","msg":"Request received"}

// Request completed (info)
{"level":30,"time":1759541628775,"module":"api","requestId":"req_1759541628730_qsm7esvo7","method":"POST","path":"/users","status":201,"duration":45,"msg":"Request completed"}

// 404 Response (warn)
{"level":40,"time":1759541628735,"module":"api","requestId":"req_1759541628735_xn79oj7yc","method":"GET","path":"/not-found","status":404,"duration":2,"msg":"Request completed"}

// Slow request (warn)
{"level":40,"time":1759541628840,"module":"api","requestId":"req_1759541628739_63j84fp2j","method":"GET","path":"/slow","duration":1250,"threshold":500,"msg":"Slow request detected"}
```

**Request ID 활용:**

```typescript
// 핸들러에서 Request ID 접근
export const POST = async (c: Context) => {
  const requestId = c.get('requestId');

  logger.info('Processing user creation', { requestId });
  // ... 작업 수행

  return c.json({ requestId, userId: 123 });
};
```

**💡 장점:**

- ✅ **Zero Configuration** - 미들웨어만 추가하면 자동 로깅
- ✅ **분산 추적** - Request ID로 여러 서비스 간 요청 추적
- ✅ **성능 모니터링** - 느린 요청 자동 감지
- ✅ **에러 추적** - 모든 에러 자동 기록
- ✅ **유연한 설정** - 제외 경로, 임계값 커스터마이징

**관련 파일:**
- 구현: `src/server/core/middleware/request-logger.ts`
- 테스트: `src/server/tests/middleware/request-logger.test.ts`
- 적용: `src/server/app.ts`

---

### Transaction Logger

**트랜잭션 시작/커밋/롤백을 자동으로 로깅**하는 기능입니다. `Transactional` 미들웨어에 내장되어 있어 별도 설정 없이 사용할 수 있습니다.

```typescript
// src/server/routes/users/index.ts
import { Transactional } from '@/server/core';

// 기본 사용 (로깅 활성화)
export const middlewares = [Transactional()];

// 커스텀 설정
export const middlewares = [
  Transactional({
    slowThreshold: 500,        // 500ms 이상이면 경고
    enableLogging: true,       // 로깅 활성화 (기본값)
  })
];

export async function POST(c: RouteContext) {
  // 트랜잭션 안에서 실행되는 모든 DB 작업이 자동으로 추적됨
  const [user] = await db.insert(users).values(body).returning();
  await db.insert(profiles).values({ userId: user.id });
  return c.json(user, 201);
}
```

**주요 기능:**

1. **트랜잭션 ID 추적** - 각 트랜잭션에 고유 ID 부여
   ```json
   {"txId":"tx_1759543880075_efjphx92k","route":"POST /users"}
   ```

2. **실행 시간 측정** - 트랜잭션 시작부터 커밋/롤백까지의 시간 자동 기록
   ```json
   {"duration":"45ms","msg":"Transaction committed"}
   ```

3. **느린 트랜잭션 감지** - 임계값 초과 시 자동 경고 (기본: 1초)
   ```json
   {"level":40,"duration":"1250ms","threshold":"1000ms","msg":"Slow transaction committed"}
   ```

4. **에러 자동 로깅** - 롤백 발생 시 에러 정보 자동 기록
   ```json
   {"level":50,"error":"Unique constraint violation","msg":"Transaction rolled back"}
   ```

**로그 출력 예시:**

```json
// Transaction started (debug)
{"level":20,"time":1759543880075,"module":"transaction","txId":"tx_1759543880075_efjphx92k","route":"POST /users","msg":"Transaction started"}

// Transaction committed (debug)
{"level":20,"time":1759543880120,"module":"transaction","txId":"tx_1759543880075_efjphx92k","route":"POST /users","duration":"45ms","msg":"Transaction committed"}

// Slow transaction (warn)
{"level":40,"time":1759543881350,"module":"transaction","txId":"tx_1759543881100_abc123xyz","route":"POST /users","duration":"1250ms","threshold":"1000ms","msg":"Slow transaction committed"}

// Transaction rolled back (error)
{"level":50,"time":1759543880079,"module":"transaction","txId":"tx_1759543880075_efjphx92k","route":"POST /users","duration":"4ms","error":"Unique constraint violation","msg":"Transaction rolled back"}
```

**성능 모니터링:**

트랜잭션 로그를 분석하여 다음을 파악할 수 있습니다:

```typescript
// 느린 트랜잭션 찾기
// duration >= slowThreshold인 로그를 찾아 쿼리 최적화 대상 식별

// 롤백 빈도 확인
// "Transaction rolled back" 로그를 집계하여 에러 패턴 분석

// 라우트별 트랜잭션 시간 분석
// route 필드로 그룹화하여 평균 트랜잭션 시간 계산
```

**💡 장점:**

- ✅ **Zero Configuration** - Transactional 미들웨어만 추가하면 자동 로깅
- ✅ **성능 추적** - 느린 트랜잭션 자동 감지로 병목 지점 파악
- ✅ **에러 디버깅** - 롤백 시 상세한 에러 정보 기록
- ✅ **트랜잭션 추적** - 고유 ID로 트랜잭션 생명주기 추적
- ✅ **유연한 설정** - 임계값, 로깅 활성화 커스터마이징

**관련 파일:**
- 구현: `src/server/core/transaction.ts`
- Context: `src/server/core/async-context.ts`
- DB Helper: `src/server/core/db/helpers.ts`
- 테스트: `src/server/tests/transaction/transaction.test.ts`

## 🔄 Adapter 교체 방법

### 환경변수로 교체

```bash
# .env.local

# Pino 사용 (기본값, 고성능)
LOGGER_ADAPTER=pino

# Custom 구현 사용 (Pino 의존성 제거)
LOGGER_ADAPTER=custom
```

### Pino Adapter 특징

**장점:**
- ⚡ Winston보다 5-10배 빠른 성능
- 📦 프로덕션 검증됨 (Netflix, Elastic 사용)
- 🎨 개발 환경 Pretty Print 지원
- 📊 JSON 기본 포맷

**출력 예시 (개발):**
```
[2025-10-04 09:58:20.123] INFO  (module: database): Database connected successfully
[2025-10-04 09:58:21.456] ERROR (module: database): Connection failed
    err: {
      "type": "Error",
      "message": "Connection timeout",
      "stack": "..."
    }
    attempt: 3
    maxRetries: 5
```

**출력 예시 (프로덕션):**
```json
{"level":30,"time":1759539501259,"module":"database","msg":"Database connected successfully"}
{"level":50,"time":1759539501260,"module":"database","err":{"type":"Error","message":"Connection timeout","stack":"..."},"attempt":3,"maxRetries":5,"msg":"Connection failed"}
```

### Custom Adapter 특징

**장점:**
- 🎯 Pino 의존성 없음
- 🛠️ 완전한 제어 가능
- 📤 커스텀 Transport 추가 가능
- 🎨 커스텀 포맷팅 가능

**사용 시기:**
- Pino 라이선스 이슈
- 특수한 Transport 필요 (커스텀 클라우드 서비스 등)
- 완전한 제어가 필요한 경우

### 새로운 Adapter 추가

1. `src/server/core/logger/adapters/winston.ts` 생성
2. `LoggerAdapter` 인터페이스 구현
3. `index.ts`에서 선택 가능하도록 추가

```typescript
// adapters/winston.ts
import type { LoggerAdapter, AdapterConfig } from './types';

export class WinstonAdapter implements LoggerAdapter {
  // LoggerAdapter 인터페이스 구현
}
```

## 🌍 환경변수

### 기본 설정

```bash
# .env.local

# 환경 (필수)
NODE_ENV=production  # development | production | test

# Adapter 선택 (선택, 기본: pino)
LOGGER_ADAPTER=pino  # pino | custom

# 로그 레벨 (선택, 기본: 환경별 자동)
# development → debug, production → info, test → warn
LOG_LEVEL=info  # debug | info | warn | error | fatal
```

### 파일 로깅 (자체 구축 시)

```bash
# 파일 로깅 활성화 (기본: false, K8s에서는 비활성화)
LOGGER_FILE_ENABLED=true

# 로그 디렉토리 (기본: ./logs)
LOG_DIR=/var/log/myapp

# 파일당 최대 크기 (기본: 10M)
LOG_MAX_FILE_SIZE=50M  # 10M, 50M, 100M 등

# 최대 파일 개수 (기본: 10)
LOG_MAX_FILES=30
```

### 외부 서비스 (향후)

```bash
# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_CHANNEL=#errors
SLACK_USERNAME=Logger Bot

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASSWORD=password
EMAIL_FROM=noreply@example.com
EMAIL_TO=admin@example.com,dev@example.com
```

### 전체 예시 (자체 구축)

```bash
# .env.local (자체 구축용 전체 설정)

# 기본
NODE_ENV=production
LOGGER_ADAPTER=pino

# 파일 로깅
LOGGER_FILE_ENABLED=true
LOG_DIR=/var/log/myapp
LOG_MAX_FILE_SIZE=50M
LOG_MAX_FILES=30

# 데이터베이스
DATABASE_URL=postgresql://...

# 애플리케이션
PORT=3000
```

### 전체 예시 (K8s)

```yaml
# deployment.yaml (K8s용 환경변수)
env:
  - name: NODE_ENV
    value: "production"
  - name: LOGGER_ADAPTER
    value: "pino"
  # LOGGER_FILE_ENABLED는 설정하지 않음 (기본: false)
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: db-secret
        key: url
```

## 🧪 테스트

**Logger 테스트:**
```bash
npm test -- src/server/tests/logger/logger.test.ts
```

**테스트 커버리지:**
- ✅ 기본 로깅 (debug, info, warn, error, fatal)
- ✅ Context 로깅
- ✅ Error 로깅 (Error 객체 + Context)
- ✅ Child logger 생성
- ✅ 실제 사용 시나리오 (DB, API, Transaction)

**Request Logger Middleware 테스트:**
```bash
npm test -- src/server/tests/middleware/request-logger.test.ts
```

**테스트 커버리지:**
- ✅ 기본 로깅 (요청/응답)
- ✅ Request ID 생성 및 컨텍스트 저장
- ✅ 에러 로깅
- ✅ 4xx/5xx 응답 로깅
- ✅ 제외 경로 필터링
- ✅ 느린 요청 감지
- ✅ 다른 미들웨어와 통합

## 📋 API Reference

### `logger`

싱글톤 Logger 인스턴스

```typescript
import { logger } from '@/server/core';
```

### `logger.child(module: string): Logger`

모듈별 child logger 생성

```typescript
const dbLogger = logger.child('database');
```

### `logger.debug(message: string, context?: Record<string, unknown>): void`

디버그 로그

### `logger.info(message: string, context?: Record<string, unknown>): void`

정보 로그

### `logger.warn(message: string, context?: Record<string, unknown>): void`
### `logger.warn(message: string, error: Error, context?: Record<string, unknown>): void`

경고 로그 (Error 선택)

### `logger.error(message: string, context?: Record<string, unknown>): void`
### `logger.error(message: string, error: Error, context?: Record<string, unknown>): void`

에러 로그 (Error 선택)

### `logger.fatal(message: string, context?: Record<string, unknown>): void`
### `logger.fatal(message: string, error: Error, context?: Record<string, unknown>): void`

치명적 에러 로그 (Error 선택)

## 🔄 향후 개선 계획

- [ ] Slack Transport 구현
- [ ] Email Transport 구현
- [ ] 파일 로테이션 (크기/개수 기반)
- [ ] 로그 샘플링 (고빈도 로그 제한)
- [ ] 비동기 배치 처리
- [ ] 외부 스토리지 전송 (S3, CloudWatch 등)
- [ ] 런타임 로그 레벨 변경
- [ ] Transport별 필터링 규칙
- [ ] 로그 압축 아카이빙

## 🔗 관련 파일

- `src/server/core/db/connection.ts` - DB 연결 로깅
- `src/server/tests/logger/logger.test.ts` - 테스트
- `src/server/tests/transaction/transaction.test.ts` - 통합 테스트