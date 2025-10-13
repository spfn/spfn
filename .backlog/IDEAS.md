# SPFN Module Ideas & Backlog

> 향후 SPFN 프레임워크에 추가될 수 있는 모듈 및 기능 아이디어

---

## 🤖 AI & Automation

### GitHub Issue/Discussion AI Summary Slack Bot

**개요:**
GitHub 저장소의 이슈와 토론을 스케줄링하여 자동으로 수집, AI로 요약한 후 Slack으로 알림을 보내는 봇

**사용 사례:**
- 매일 아침 새로운 이슈/PR 요약 받기
- 주간 토론 활동 요약 리포트
- 중요 이슈 실시간 알림
- 팀 동기화 및 커뮤니케이션 개선

**기술 스택:**
- GitHub API (이슈/토론/PR 수집)
- OpenAI/Claude API (텍스트 요약)
- Slack Webhook/Bot API (알림 전송)
- Cron/스케줄러 (정기 실행)

**구현 옵션:**

**옵션 1: GitHub Actions 기반**
```yaml
# .github/workflows/slack-summary.yml
name: Daily GitHub Summary
on:
  schedule:
    - cron: '0 9 * * *'  # 매일 오전 9시
  workflow_dispatch:

jobs:
  summarize:
    runs-on: ubuntu-latest
    steps:
      - name: Collect Issues & Discussions
        run: gh api repos/$REPO/issues
      - name: Summarize with AI
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: node scripts/summarize.js
      - name: Send to Slack
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
        run: curl -X POST $SLACK_WEBHOOK -d @summary.json
```

**옵션 2: Node.js 서비스**
```typescript
// 독립 실행 서버
import { Octokit } from '@octokit/rest';
import { OpenAI } from 'openai';
import { WebClient } from '@slack/web-api';

class GitHubSummaryBot {
  async collectIssues() { }
  async summarizeWithAI(issues) { }
  async sendToSlack(summary) { }
  async run() { }
}

// Cron으로 스케줄링
```

**옵션 3: @spfn/bot 패키지로 통합**
```typescript
import { createBot } from '@spfn/bot';

const bot = createBot({
  sources: [
    { type: 'github', repo: 'spfn/spfn' }
  ],
  ai: {
    provider: 'openai',
    model: 'gpt-4'
  },
  destinations: [
    { type: 'slack', webhook: process.env.SLACK_WEBHOOK }
  ],
  schedule: '0 9 * * *'
});

await bot.start();
```

**주요 기능:**
- ✅ GitHub 이슈/PR/토론 수집
- ✅ 필터링 (라벨, 날짜, 상태)
- ✅ AI 기반 요약 생성
- ✅ 스레드 요약 (긴 토론)
- ✅ 우선순위 판단 (긴급도 분석)
- ✅ Slack 포맷팅 (Markdown, Blocks)
- ✅ 스케줄링 (일일/주간/월간)
- ✅ 멀티 저장소 지원
- ✅ 커스텀 템플릿

**SPFN 통합 가능성:**
- `@spfn/bot` - 범용 봇 프레임워크
- `@spfn/ai` - AI 통합 모듈
- `@spfn/notifications` - 알림 시스템
- `@spfn/scheduler` - 작업 스케줄링

**우선순위:** P2 (Nice to have)
**예상 작업 시간:** 2-3일
**관련 프로젝트:** 개인 생산성 도구, SPFN 생태계

---

## 📝 더 추가될 아이디어들...

- (여기에 새로운 아이디어 추가)