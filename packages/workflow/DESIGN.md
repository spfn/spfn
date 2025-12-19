# @spfn/workflow 설계 문서

경량 워크플로 엔진 - `@spfn/core`의 Job/Events 기반

## 핵심 개념

```
Job = 독립적인 작업 단위 (기존 @spfn/core)
Workflow = Job들을 연결하는 파이프라인
```

```
┌─────────┐    data    ┌─────────┐    data    ┌─────────┐
│  Job A  │ ────────▶ │  Job B  │ ────────▶ │  Job C  │
└─────────┘           └─────────┘           └─────────┘
     │                     │                     │
     └─────────────────────┴─────────────────────┘
                    Workflow
```

## 설계 원칙

| 원칙 | 설명 |
|------|------|
| Step 독립성 | Step(Job)은 다른 Step의 존재를 모름 |
| Step 재사용 | 하나의 Step이 여러 Workflow에 참여 가능 |
| 조합 확장 | 새 Workflow = 기존 Step 조합 |
| 명시적 매핑 | Step 간 데이터 전달은 명시적으로 |
| 타입 안전성 | 등록된 Workflow만 실행 가능, input 타입 추론 |

---

## API 설계

### 1. Job 확장 (@spfn/core)

```typescript
const createRepo = job('create-repo')
    .input(Type.Object({
        tenantId: Type.String()
    }))
    .output(Type.Object({
        repoId: Type.String(),
        repoUrl: Type.String(),
    }))
    .retry({
        attempts: 3,
        delay: 1000,
        backoff: 'exponential',
    })
    .timeout(30000)
    .compensate(async (input, output) => {
        await gitea.deleteRepo(output.repoId);
    })
    .handler(async (input) => {
        const repo = await gitea.create(input.tenantId);
        return { repoId: repo.id, repoUrl: repo.url };
    });
```

### 2. Workflow 정의

```typescript
import { workflow } from '@spfn/workflow';

export const provisionTenant = workflow('provision-tenant')
    .input(Type.Object({
        tenantId: Type.String(),
        plan: PlanType,
    }))
    .resumable(true)      // 실패 지점부터 재개 가능
    .rollback(true)       // 실패 시 역순 롤백 (default: true)
    .notify({
        on: ['failed'],
        when: (event) => event.input.plan === 'pro',
        providers: [slackProvider],
    })
    // 순차 실행
    .pipe(createPodIdentity, (ctx) => ({
        tenantId: ctx.input.tenantId,
        plan: ctx.input.plan,
    }))
    // 병렬 실행
    .parallel({
        appRepo: [createAppRepo, (ctx) => ({
            tenantId: ctx.input.tenantId,
        })],
        gitopsRepo: [createGitopsRepo, (ctx) => ({
            tenantId: ctx.input.tenantId,
        })],
    })
    // 이전 결과 참조
    .pipe(notifyComplete, (ctx) => ({
        tenantId: ctx.input.tenantId,
        appRepoUrl: ctx.results.appRepo.repoUrl,
        gitopsRepoUrl: ctx.results.gitopsRepo.repoUrl,
    }));
```

### 3. server.config.ts 등록

```typescript
import { defineConfig } from '@spfn/core';
import { provisionTenant, deprovisionTenant } from './workflows';

export default defineConfig({
    routes: [userRoutes, tenantRoutes],
    jobs: [sendEmail, syncData],
    workflows: [provisionTenant, deprovisionTenant],
});
```

### 4. Workflow 실행 및 제어

```typescript
import { getWorkflowEngine } from '@spfn/workflow';
import type { AppConfig } from './server.config';

const workflowEngine = getWorkflowEngine<AppConfig>();

// 실행 (비동기)
const execution = await workflowEngine.start('provision-tenant', {
    tenantId: 'abc',
    plan: 'pro',
});

// 상태 조회
const status = await workflowEngine.get(execution.id);

// Step output 조회
const output = await workflowEngine.getStepOutput(execution.id, 'appRepo');

// 목록 조회
const list = await workflowEngine.list({
    workflowName: 'provision-tenant',
    status: 'failed',
});

// 재시도
await workflowEngine.retry(execution.id);

// 취소
await workflowEngine.cancel(execution.id);
await workflowEngine.cancel(execution.id, { rollback: true });

// 이벤트 구독
workflowEngine.subscribe(execution.id, (event) => {
    console.log(event.type, event.data);
});
```

---

## 실행 방식

### 비동기 + 이벤트 트리거

각 Step은 별도 Job으로 실행되며, 이벤트로 연결됨:

```
workflow.start(input)
    │
    ▼
┌─────────────────────────────────────────────┐
│ emit: workflow.provision.started            │
│ → Job: step1 트리거                         │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ Step1 완료                                  │
│ emit: workflow.provision.step1.completed    │
│ → Job: step2 트리거                         │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ Step2 완료                                  │
│ emit: workflow.provision.step2.completed    │
│ → Job: step3 트리거                         │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ 모든 Step 완료                              │
│ emit: workflow.provision.completed          │
└─────────────────────────────────────────────┘
```

---

## 실패 처리 전략

| 항목 | 결정 |
|------|------|
| 재시도 | Job 레벨 정의 |
| 보상 정의 | Job 레벨 정의 (선택적) |
| 롤백 실행 | Workflow에서 역순 자동 |
| 보상 실패 시 | 무시하고 계속 진행 |
| 보상 없는 Job | 허용 (skip) |
| 병렬 실패 | 전체 실패 |
| 롤백 비활성화 | 옵션 지원 |

### 롤백 흐름

```
실행: Step1 ✓ → Step2 ✓ → Step3 ✗

롤백: Step2.compensate() → Step1.compensate()
      (Step3은 실패했으므로 보상 불필요)
      (보상 실패 시 무시하고 계속)
```

### 재시도 전략

```typescript
// resumable: true인 경우
Step1 ✓ → Step2 ✓ → Step3 ✗

retry(id):
  - Step1, Step2 output DB에서 로드
  - Step3부터 재실행

// resumable: false인 경우
  - 처음부터 다시 실행
```

---

## 상태 저장

### 테이블 구조

```typescript
// workflow_executions
interface WorkflowExecution {
    id: string;
    workflowName: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'compensating' | 'compensated' | 'cancelled';
    input: unknown;           // jsonb
    currentStep: number;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}

// workflow_step_executions
interface WorkflowStepExecution {
    id: string;
    executionId: string;      // FK
    stepName: string;
    stepIndex: number;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'compensated';
    output?: unknown;         // jsonb 또는 URL (대용량)
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
}
```

### 대용량 Output 처리

```typescript
if (sizeof(output) > THRESHOLD) {
    const url = await storage.upload(output);
    stepExecution.output = { $ref: url };
} else {
    stepExecution.output = output;
}
```

---

## 모니터링

### 이벤트 구조

```typescript
workflow.started        // { workflowName, executionId, input }
workflow.step.started   // { workflowName, executionId, stepName, stepIndex }
workflow.step.completed // { workflowName, executionId, stepName, stepIndex }
workflow.step.failed    // { workflowName, executionId, stepName, error }
workflow.completed      // { workflowName, executionId }
workflow.failed         // { workflowName, executionId, error }
workflow.cancelled      // { workflowName, executionId }
```

### 알림 Provider

```typescript
interface NotificationProvider {
    name: string;
    notify(event: WorkflowEvent): Promise<void>;
}

// 기본 제공
const consoleProvider: NotificationProvider;
const emailProvider: (config: EmailConfig) => NotificationProvider;
const slackProvider: (config: SlackConfig) => NotificationProvider;

// 워크플로에 설정
workflow('provision')
    .notify({
        on: ['failed', 'completed'],
        when: (event) => event.input.plan === 'pro',
        providers: [consoleProvider, slackProvider(config)],
    });
```

---

## 구현 우선순위

### Phase 1: 기반 확장 (@spfn/core)

| 순서 | 항목 | 설명 |
|------|------|------|
| 1-1 | Job output 스키마 | `.output()` 메서드 추가 |
| 1-2 | Job compensate | `.compensate()` 메서드 추가 |
| 1-3 | Job timeout | `.timeout()` 메서드 추가 |

### Phase 2: 패키지 생성 (@spfn/workflow)

| 순서 | 항목 | 설명 |
|------|------|------|
| 2-1 | 패키지 초기화 | 기본 구조, 의존성 설정 |
| 2-2 | DB 엔티티 | WorkflowExecution, WorkflowStepExecution |
| 2-3 | 마이그레이션 | 테이블 생성 스크립트 |

### Phase 3: 워크플로 정의 API

| 순서 | 항목 | 설명 |
|------|------|------|
| 3-1 | workflow() 빌더 | 기본 체이닝 API |
| 3-2 | .pipe() | 순차 실행 정의 |
| 3-3 | .parallel() | 병렬 실행 정의 |
| 3-4 | 옵션들 | .resumable(), .rollback() |
| 3-5 | 타입 추론 | input/output 타입 안전성 |

### Phase 4: 워크플로 엔진 (핵심)

| 순서 | 항목 | 설명 |
|------|------|------|
| 4-1 | createWorkflowEngine | 엔진 생성 |
| 4-2 | .start() | 워크플로 실행 (비동기) |
| 4-3 | 이벤트 연결 | Step 간 이벤트 트리거 |
| 4-4 | 상태 저장 | 각 Step 결과 DB 저장 |
| 4-5 | .get() | 상태 조회 |
| 4-6 | .getStepOutput() | Step 결과 조회 |

### Phase 5: 제어 기능

| 순서 | 항목 | 설명 |
|------|------|------|
| 5-1 | .retry() | 재시도 (resumable 고려) |
| 5-2 | .cancel() | 취소 + 롤백 옵션 |
| 5-3 | 롤백 실행 | 역순 compensate 호출 |

### Phase 6: 모니터링

| 순서 | 항목 | 설명 |
|------|------|------|
| 6-1 | 이벤트 발행 | workflow.* 이벤트 |
| 6-2 | .subscribe() | 실시간 구독 |
| 6-3 | .list() | 히스토리 조회 |

### Phase 7: 알림

| 순서 | 항목 | 설명 |
|------|------|------|
| 7-1 | Provider 인터페이스 | NotificationProvider |
| 7-2 | 기본 Provider | console, email |
| 7-3 | .notify() | 워크플로에 알림 설정 |
| 7-4 | 조건부 알림 | when 옵션 |

### Phase 8: 통합

| 순서 | 항목 | 설명 |
|------|------|------|
| 8-1 | defineConfig 확장 | workflows 옵션 |
| 8-2 | getWorkflowEngine | 타입 안전한 접근 |
| 8-3 | 대용량 output | 스토리지 연동 |

---

## MVP 범위

Phase 1~4 완료 시 기본 동작 가능:

```typescript
// 정의
const provision = workflow('provision')
    .input(schema)
    .pipe(step1, mapper)
    .pipe(step2, mapper);

// 실행
const exec = await engine.start('provision', input);

// 조회
const status = await engine.get(exec.id);
```
