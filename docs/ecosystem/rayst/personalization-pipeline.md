# RAYST Personalization Pipeline

## Overview

RAYST (Ray's AI You Storage & Training) is a personalization system that collects Claude Code conversations to build a personalized AI assistant. This document describes the complete data pipeline from raw conversation collection to model training and context injection.

## Philosophy

The key insight behind RAYST's architecture is that **context must be classified before quality can be assessed**. A conversation's quality is meaningless without understanding what context it belongs to. For example, a successful database migration conversation follows completely different patterns than a successful API development conversation.

Therefore, RAYST follows a strict pipeline:
1. **First**: Extract and classify contexts from raw conversations
2. **Second**: Assess which conversation flows led to successful outcomes within each context
3. **Third**: Inject relevant successful patterns when similar contexts are detected

## Architecture

### Pipeline Stages

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Raw Data Collection (Real-time)                   │
└─────────────────────────────────────────────────────────────┘
  Global Hook → RAYST API → DB (conversations + messages)
  - Minimal metadata: sessionId, cwd, timestamp
  - No heavy processing (maintains hook performance)
  - Status: collected

┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Context Classification (Batch)                    │
└─────────────────────────────────────────────────────────────┘
  Script: classify-contexts.ts (manual/scheduled)
  - Status: collected → classifying → classified
  - Claude Haiku API: Analyze entire conversation
  - Extract: context type, keywords, tech stack
  - Creates conversation_contexts table entries

  $ pnpm classify --status collected --limit 100

┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Quality Assessment (Batch)                        │
└─────────────────────────────────────────────────────────────┘
  Script: assess-quality.ts
  - Status: classified → assessing → assessed
  - Claude Haiku API: User sentiment analysis
  - Extract satisfaction signals ("완벽해요", "다시해줘")
  - Determine success/failure, summarize successful approach

  $ pnpm assess --status classified --limit 100

┌─────────────────────────────────────────────────────────────┐
│ Phase 4: Training Data Generation (Batch)                  │
└─────────────────────────────────────────────────────────────┘
  Script: generate-training-data.ts
  - Status: assessed → generating → generated
  - Filter: only successful conversations (resolution_status = 'success')
  - Transform to training format:
    * System prompt: Project context
    * User: User request
    * Assistant: Successful response pattern
  - Generate JSONL format (Claude fine-tuning compatible)

  $ pnpm generate-training --quality-threshold 0.8

┌─────────────────────────────────────────────────────────────┐
│ Phase 5: Human Review (UI)                                 │
└─────────────────────────────────────────────────────────────┘
  Dashboard: /review
  - Status: generated → reviewing
  - Review generated training data
  - Fix/exclude misclassified entries
  - Additional labeling
  - Status change: approved / rejected

  UI: approve → approved

┌─────────────────────────────────────────────────────────────┐
│ Phase 6: Model Training (Manual)                           │
└─────────────────────────────────────────────────────────────┘
  Script: export-for-training.ts
  - Export only approved status
  - Claude fine-tuning API or local model training
  - Record model_version after training

  $ pnpm export-training --output training-batch-001.jsonl

┌─────────────────────────────────────────────────────────────┐
│ Phase 7: Context Injection (Real-time)                     │
└─────────────────────────────────────────────────────────────┘
  UserPromptSubmit Hook Enhancement
  - User input → Search relevant contexts
  - Find approved successful patterns
  - Auto-inject into prompt

  "Your past similar work succeeded with this approach: ..."
```

## Database Schema

### Conversations Table (Extended)

```typescript
export const claudeConversations = pgTable('claude_conversations', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull().unique(),
  projectName: text('project_name'),
  cwd: text('cwd').notNull(),

  // Existing classification fields
  category: text('category'),
  tags: jsonb('tags').$type<string[]>(),
  summary: text('summary'),

  // Pipeline status
  processingStatus: text('processing_status', {
    enum: [
      'collected',    // Raw data collected
      'classifying',  // Context classification in progress
      'classified',   // Context classified
      'assessing',    // Quality assessment in progress
      'assessed',     // Quality assessed
      'generating',   // Training data generation in progress
      'generated',    // Training data generated
      'reviewing',    // Under human review
      'approved',     // Approved for training
      'rejected'      // Rejected
    ]
  }).default('collected'),

  processedAt: timestamp('processed_at'),
  qualityScore: real('quality_score'), // 0.0 ~ 1.0

  startedAt: timestamp('started_at').defaultNow(),
  endedAt: timestamp('ended_at'),
  metadata: jsonb('metadata'),
});
```

### Conversation Contexts Table (New)

```typescript
export const conversationContexts = pgTable('conversation_contexts', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id')
    .references(() => claudeConversations.id)
    .notNull(),

  // Phase 2: Classification
  contextType: text('context_type').notNull(),
    // Examples: "database_migration", "api_development",
    //           "debugging_error", "ui_component"
  contextDescription: text('context_description'),
  keywords: jsonb('keywords').$type<string[]>(),
  technicalStack: jsonb('technical_stack').$type<string[]>(),
    // Examples: ["postgres", "drizzle", "typescript"]

  // Phase 3: Quality Assessment
  resolutionStatus: text('resolution_status', {
    enum: ['success', 'partial', 'failed', 'abandoned']
  }),

  userSatisfactionSignals: jsonb('satisfaction_signals').$type<{
    positive: string[],  // ["완벽해요", "됐습니다", "고마워요"]
    negative: string[],  // ["다시해줘", "틀렸어", "아니 이게 아니라"]
  }>(),

  successfulApproach: text('successful_approach'),
    // Claude's summary of what approach worked

  toolSequence: jsonb('tool_sequence').$type<string[]>(),
    // Sequence of tools that led to success: ["Read", "Edit", "Bash"]

  createdAt: timestamp('created_at').defaultNow(),
});
```

### Training Data Table (New)

```typescript
export const trainingData = pgTable('training_data', {
  id: serial('id').primaryKey(),
  contextId: integer('context_id')
    .references(() => conversationContexts.id)
    .notNull(),
  conversationId: integer('conversation_id')
    .references(() => claudeConversations.id)
    .notNull(),

  // Training format (Claude fine-tuning compatible)
  systemPrompt: text('system_prompt').notNull(),
  userMessage: text('user_message').notNull(),
  assistantResponse: text('assistant_response').notNull(),

  // Metadata
  status: text('status', {
    enum: ['generated', 'reviewing', 'approved', 'rejected']
  }).default('generated'),

  reviewNotes: text('review_notes'),
  modelVersion: text('model_version'),
    // Which training batch this was included in

  createdAt: timestamp('created_at').defaultNow(),
  reviewedAt: timestamp('reviewed_at'),
});
```

## Implementation Guide

### Phase 1: Raw Collection (Already Implemented)

Global hooks are configured in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": ["~/.claude/hooks/log-hook.sh user-prompt"],
    "PreToolUse": ["~/.claude/hooks/log-hook.sh pre-tool"],
    "PostToolUse": ["~/.claude/hooks/log-hook.sh post-tool"],
    "Stop": ["~/.claude/hooks/log-hook.sh stop"]
  }
}
```

The hook script (`~/.claude/hooks/log-hook.sh`) makes a simple curl request:

```bash
#!/bin/bash
RAYST_URL="http://localhost:8794"
EVENT_TYPE="$1"
HOOK_DATA=$(cat)

curl -X POST "${RAYST_URL}/api/log-conversation?event=${EVENT_TYPE}" \
  -H "Content-Type: application/json" \
  -d "$HOOK_DATA" \
  --silent --show-error
```

### Phase 2: Context Classification (To Implement)

Create `scripts/pipeline/1-classify-contexts.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db';
import { claudeConversations, conversationContexts } from '../../src/server/entities';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function classifyConversation(conversationId: number) {
  // 1. Get conversation and messages
  const conversation = await db.query.claudeConversations.findFirst({
    where: eq(claudeConversations.id, conversationId),
    with: { messages: true }
  });

  if (!conversation) return;

  // 2. Or read transcript if available
  const transcriptPath = conversation.metadata?.transcript_path;
  let transcript = '';
  if (transcriptPath) {
    transcript = await fs.readFile(transcriptPath, 'utf-8');
  }

  // 3. Call Claude Haiku for classification
  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Analyze this Claude Code conversation and extract:
1. Context type (e.g., "database_migration", "api_development", "debugging_error")
2. Context description (brief explanation)
3. Keywords (important terms)
4. Technical stack (technologies used)

Conversation:
${transcript}

Respond in JSON format:
{
  "contextType": "...",
  "contextDescription": "...",
  "keywords": ["...", "..."],
  "technicalStack": ["...", "..."]
}`
    }],
  });

  const result = JSON.parse(response.content[0].text);

  // 4. Insert into conversation_contexts
  await db.insert(conversationContexts).values({
    conversationId,
    contextType: result.contextType,
    contextDescription: result.contextDescription,
    keywords: result.keywords,
    technicalStack: result.technicalStack,
  });

  // 5. Update conversation status
  await db.update(claudeConversations)
    .set({
      processingStatus: 'classified',
      processedAt: new Date()
    })
    .where(eq(claudeConversations.id, conversationId));
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10');

  // Find conversations with status 'collected'
  const conversations = await db.query.claudeConversations.findMany({
    where: eq(claudeConversations.processingStatus, 'collected'),
    limit,
  });

  console.log(`Processing ${conversations.length} conversations...`);

  for (const conv of conversations) {
    try {
      await classifyConversation(conv.id);
      console.log(`✓ Classified conversation ${conv.id}`);
    } catch (error) {
      console.error(`✗ Failed to classify ${conv.id}:`, error);
    }
  }
}

main();
```

Usage:
```bash
pnpm classify-contexts --limit=50
```

### Phase 3: Quality Assessment (To Implement)

Create `scripts/pipeline/2-assess-quality.ts`:

```typescript
async function assessQuality(conversationId: number) {
  // 1. Get conversation context
  const context = await db.query.conversationContexts.findFirst({
    where: eq(conversationContexts.conversationId, conversationId),
  });

  // 2. Get all messages
  const messages = await db.query.claudeMessages.findMany({
    where: eq(claudeMessages.conversationId, conversationId),
    orderBy: [asc(claudeMessages.sequence)],
  });

  // 3. Extract user messages for sentiment analysis
  const userMessages = messages
    .filter(m => m.role === 'user')
    .map(m => m.content);

  // 4. Call Claude Haiku for quality assessment
  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Analyze this conversation's quality and outcome.

Context: ${context.contextType}
User messages: ${JSON.stringify(userMessages)}

Determine:
1. Resolution status: success/partial/failed/abandoned
2. User satisfaction signals (positive and negative phrases)
3. What approach worked (if successful)
4. Tool sequence that led to success

Respond in JSON:
{
  "resolutionStatus": "success|partial|failed|abandoned",
  "satisfactionSignals": {
    "positive": ["phrase1", "phrase2"],
    "negative": ["phrase1", "phrase2"]
  },
  "successfulApproach": "description of what worked",
  "toolSequence": ["Tool1", "Tool2"]
}`
    }],
  });

  const result = JSON.parse(response.content[0].text);

  // 5. Update conversation_contexts
  await db.update(conversationContexts)
    .set({
      resolutionStatus: result.resolutionStatus,
      userSatisfactionSignals: result.satisfactionSignals,
      successfulApproach: result.successfulApproach,
      toolSequence: result.toolSequence,
    })
    .where(eq(conversationContexts.id, context.id));

  // 6. Calculate quality score
  const qualityScore = calculateQualityScore(result);

  await db.update(claudeConversations)
    .set({
      processingStatus: 'assessed',
      qualityScore,
      processedAt: new Date()
    })
    .where(eq(claudeConversations.id, conversationId));
}

function calculateQualityScore(result: any): number {
  let score = 0;

  // Base score from resolution
  if (result.resolutionStatus === 'success') score += 0.6;
  else if (result.resolutionStatus === 'partial') score += 0.3;

  // Positive signals boost
  score += Math.min(result.satisfactionSignals.positive.length * 0.1, 0.3);

  // Negative signals penalty
  score -= Math.min(result.satisfactionSignals.negative.length * 0.1, 0.3);

  return Math.max(0, Math.min(1, score));
}
```

### Phase 4: Training Data Generation (To Implement)

Create `scripts/pipeline/3-generate-training.ts`:

```typescript
async function generateTrainingData(conversationId: number) {
  // 1. Get conversation with context
  const conversation = await db.query.claudeConversations.findFirst({
    where: eq(claudeConversations.id, conversationId),
    with: {
      messages: true,
      contexts: true,
    }
  });

  // 2. Filter: only successful conversations
  const successfulContext = conversation.contexts.find(
    c => c.resolutionStatus === 'success'
  );

  if (!successfulContext) return;

  // 3. Extract first user message and successful response
  const firstUserMsg = conversation.messages.find(m => m.role === 'user');
  const firstAssistantMsg = conversation.messages.find(m => m.role === 'assistant');

  // 4. Build training example
  const systemPrompt = `You are an AI assistant specialized in ${successfulContext.contextType}.
Project: ${conversation.projectName}
Tech stack: ${successfulContext.technicalStack.join(', ')}
Successful approach: ${successfulContext.successfulApproach}`;

  const trainingExample = {
    conversationId,
    contextId: successfulContext.id,
    systemPrompt,
    userMessage: JSON.stringify(firstUserMsg.content),
    assistantResponse: JSON.stringify(firstAssistantMsg.content),
  };

  // 5. Insert into training_data
  await db.insert(trainingData).values(trainingExample);

  // 6. Update status
  await db.update(claudeConversations)
    .set({ processingStatus: 'generated' })
    .where(eq(claudeConversations.id, conversationId));
}
```

### Phase 5: Human Review (To Implement)

Create a Next.js page at `src/app/review/page.tsx`:

```typescript
export default async function ReviewPage() {
  const pendingData = await db.query.trainingData.findMany({
    where: eq(trainingData.status, 'generated'),
    with: {
      conversation: true,
      context: true,
    },
    limit: 50,
  });

  return (
    <div>
      <h1>Training Data Review</h1>
      {pendingData.map(item => (
        <ReviewCard
          key={item.id}
          data={item}
          onApprove={() => approveTrainingData(item.id)}
          onReject={() => rejectTrainingData(item.id)}
        />
      ))}
    </div>
  );
}
```

### Phase 6: Export for Training (To Implement)

Create `scripts/pipeline/4-export-training.ts`:

```typescript
async function exportTrainingData(outputPath: string) {
  // 1. Get all approved training data
  const approved = await db.query.trainingData.findMany({
    where: eq(trainingData.status, 'approved'),
  });

  // 2. Convert to Claude fine-tuning format
  const trainingExamples = approved.map(item => ({
    system: item.systemPrompt,
    messages: [
      { role: 'user', content: item.userMessage },
      { role: 'assistant', content: item.assistantResponse }
    ]
  }));

  // 3. Write to JSONL
  const jsonl = trainingExamples
    .map(ex => JSON.stringify(ex))
    .join('\n');

  await fs.writeFile(outputPath, jsonl);

  console.log(`Exported ${trainingExamples.length} examples to ${outputPath}`);
}
```

### Phase 7: Context Injection (To Implement)

Enhance `~/.claude/hooks/log-hook.sh` for UserPromptSubmit:

```bash
#!/bin/bash
EVENT_TYPE="$1"
RAYST_URL="http://localhost:8794"
HOOK_DATA=$(cat)

if [ "$EVENT_TYPE" = "user-prompt" ]; then
  # Get relevant contexts
  CONTEXTS=$(curl -X POST "${RAYST_URL}/api/find-contexts" \
    -H "Content-Type: application/json" \
    -d "$HOOK_DATA" \
    --silent)

  # Inject context into prompt (modify HOOK_DATA)
  # ... implementation needed ...
fi

# Log to RAYST
curl -X POST "${RAYST_URL}/api/log-conversation?event=${EVENT_TYPE}" \
  -H "Content-Type: application/json" \
  -d "$HOOK_DATA" \
  --silent --show-error
```

## Usage Workflow

### Weekly Batch Processing

```bash
# 1. Week of conversation collection (automatic)
# ... use Claude Code normally ...

# 2. Weekend: Run batch processing
pnpm classify-contexts --limit=100
# → Classifies collected conversations

# 3. Assess quality
pnpm assess-quality --limit=100
# → Analyzes user satisfaction

# 4. Generate training data
pnpm generate-training --min-quality=0.7
# → Creates training examples from high-quality conversations

# 5. Review in dashboard
open http://localhost:8794/review
# → Approve/reject generated examples

# 6. Export for training
pnpm export-training --output=./training-$(date +%Y%m%d).jsonl

# 7. Train model (manual)
# Use Claude fine-tuning API or local training

# 8. Enable context injection
# Update hooks to inject relevant contexts
```

### Monitoring

Create `scripts/monitoring/pipeline-status.ts`:

```bash
$ pnpm pipeline-status

=== RAYST Pipeline Status ===
Total Conversations: 1,247

Phase 1 - Collection:     1,247 (100%)
Phase 2 - Classified:       823 (66%)
Phase 3 - Assessed:         612 (49%)
Phase 4 - Generated:        384 (31%)
Phase 5 - Approved:         156 (13%)
Phase 6 - Trained:           45 (4%)

Quality Distribution:
  Success:  384 (62.7%)
  Partial:  156 (25.5%)
  Failed:    72 (11.8%)

Top Context Types:
  1. database_migration    89
  2. api_development       67
  3. debugging_error       54
  4. ui_component          43

Average Quality Score: 0.73
```

## Cost Estimation

### Claude Haiku API Costs

**Pricing** (as of 2024):
- Input: $0.25 per 1M tokens
- Output: $1.25 per 1M tokens

**Per Conversation**:
- Average conversation: ~5,000 tokens (transcript)
- Classification prompt: ~5,500 tokens input, ~200 tokens output
- Quality assessment prompt: ~6,000 tokens input, ~300 tokens output
- **Total per conversation**: ~11,500 input + 500 output tokens

**Cost Calculation**:
- Input cost: (11,500 / 1,000,000) × $0.25 = $0.002875
- Output cost: (500 / 1,000,000) × $1.25 = $0.000625
- **Total per conversation**: ~$0.0035 (0.35 cents)

**Monthly Estimate** (300 conversations):
- 300 conversations × $0.0035 = **$1.05/month**

This is highly cost-effective for the value provided!

## Benefits

### 1. No Real-time Overhead
- Hooks only do simple logging
- Heavy analysis runs in batches
- No impact on Claude Code performance

### 2. Cost Effective
- Controlled API usage through batching
- ~$1/month for 300 conversations
- Can adjust batch sizes based on budget

### 3. Staged Validation
- Each pipeline stage produces verifiable output
- Can inspect results before proceeding
- Easy to debug and improve

### 4. Human in the Loop
- Automated + human review combination
- Catch edge cases and errors
- Ensure high-quality training data

### 5. Incremental Improvement
- Each pipeline stage is independent
- Can improve classification without touching quality assessment
- Gradual refinement over time

## Future Enhancements

### Semantic Search with Embeddings

Add vector embeddings for better context matching:

```typescript
// Add to conversation_contexts table
embedding: vector(1536), // OpenAI ada-002 or similar

// Generate embeddings during classification
const embedding = await generateEmbedding(contextDescription);

// Search by similarity
SELECT * FROM conversation_contexts
ORDER BY embedding <-> query_embedding
LIMIT 5;
```

### Multi-Context Conversations

Some conversations span multiple contexts:

```typescript
// Allow multiple contexts per conversation
conversationContexts: {
  conversationId: 123,
  contexts: [
    { type: 'database_migration', weight: 0.7 },
    { type: 'api_development', weight: 0.3 }
  ]
}
```

### A/B Testing

Test context injection effectiveness:

```typescript
// Randomly enable/disable injection
const useInjection = Math.random() > 0.5;

// Track success rate
trackMetric('context_injection_enabled', useInjection);
trackMetric('conversation_quality', finalQuality);
```

### Auto-Retraining

Automatically trigger retraining when enough new data:

```typescript
const newApproved = await countNewApprovedSince(lastTrainingDate);

if (newApproved >= 100) {
  await triggerRetraining();
}
```

## Related Documentation

- [RAYST Project README](../../../apps/rayst/README.md)
- [SPFN Database Guide](../../guides/database.md)
- [Creating Custom Modules](./creating-modules.md)

## License

Private Project