# SPFN

## Scalable Backend for Next.js
> Built-in, production-ready, no compromise

SPFN은 Next.js 개발자를 위한 프로덕션 레벨 백엔드 프레임워크입니다. Next.js의 강력한 프론트엔드 경험은 그대로 유지하면서, 엔터프라이즈급 백엔드 기능을 완벽하게 통합하는 것이 목표입니다.

### Why SPFN?

비즈니스용 웹 애플리케이션을 구축할 때는 다음과 같은 기능들이 필요합니다:

- **실시간 통신** - WebSocket, Server-Sent Events
- **복잡한 비즈니스 로직** - 트랜잭션, 워크플로우, 배치 작업
- **장시간 실행 작업** - 영상 처리, 데이터 분석, AI 추론 (수 분 ~ 수 시간)
- **대용량 파일 처리** - GB 단위 파일 업로드/다운로드
- **고급 API 기능** - 속도 제한, API 버저닝, 미들웨어 체이닝
- **마이크로서비스 통합** - 여러 서비스와의 조율, 데이터 정규화
- **프로덕션 운영** - 로깅, 모니터링, 프로파일링, 부하 테스트

Next.js API Routes는 가벼운 작업에는 훌륭하지만, 위와 같은 요구사항에는 제약이 있습니다:
- 60초 실행 시간 제한 (Vercel)
- 4.5MB 요청 크기 제한
- 제한적인 미들웨어 패턴
- WebSocket 미지원

SPFN은 이러한 제약 없이 **Next.js와 완벽하게 통합되는 확장 가능한 백엔드**를 제공합니다.

### How It Works

SPFN은 Hono를 기반으로 Next.js와 함께 동작하는 독립적인 백엔드 서버를 구축합니다:

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js App                          │
│  - SSR/SSG                                                  │
│  - Client Components                                        │
│  - UI/UX Layer                                              │
└──────────────────┬──────────────────────────────────────────┘
                   │ Direct HTTP/WebSocket
                   ↓
┌─────────────────────────────────────────────────────────────┐
│                     SPFN Backend (Hono)                     │
│  - File-based Routing                                       │
│  - Type-safe APIs with Zod validation                       │
│  - Drizzle ORM with migrations                              │
│  - WebSocket support                                        │
│  - No timeouts, no size limits                              │
│  - Microservice integration                                 │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────────┐
│        External Services & Databases                        │
│  - PostgreSQL                                               │
│  - Redis                                                    │
│  - AWS Services (S3, Bedrock, etc.)                         │
│  - Third-party APIs                                         │
└─────────────────────────────────────────────────────────────┘
```

**핵심 개념:**
- **Next.js는 프론트엔드에 집중** - 사용자 UI, SSR/SSG
- **SPFN은 백엔드 로직 전담** - 비즈니스 로직, 데이터 처리, 외부 서비스 통합
- **직접 통신** - 프론트엔드에서 SPFN 백엔드로 직접 API 호출 (불필요한 proxy hop 제거)
- **완벽한 타입 안정성** - 프론트엔드에서 백엔드까지 end-to-end 타입 추론

---

## Features

*(계속 작성 예정)*