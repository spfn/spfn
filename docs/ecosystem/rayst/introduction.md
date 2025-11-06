# RAYST - Ray's AI You Storage & Training

## What is RAYST?

RAYST is a personalization system that automatically collects all your Claude Code conversations to build a database for training personalized AI models. The name stands for **Ray's AI You Storage & Training**.

## The Problem

When working with Claude Code across multiple projects, valuable knowledge gets lost:

- **Context Loss**: Each new conversation starts from scratch
- **Repetitive Explanations**: You explain the same patterns repeatedly
- **No Learning**: Claude doesn't learn from your past successful interactions
- **Isolated Knowledge**: Insights from one project don't transfer to others

## The Solution

RAYST captures every Claude Code interaction through global hooks and builds a personalized knowledge base that can be used to:

1. **Understand Your Patterns**: Learn how you solve problems across projects
2. **Identify Successful Approaches**: Track which conversation flows led to good outcomes
3. **Provide Better Context**: Automatically inject relevant past successes into new conversations
4. **Enable Personalization**: Train models that understand your specific needs and preferences

## How It Works

### 1. Automatic Collection

RAYST installs global hooks in `~/.claude/settings.json` that capture:

- Every user prompt you send
- Every tool Claude uses
- Complete conversation transcripts
- Project context and metadata

All data is stored locally in your PostgreSQL database and JSONL files.

### 2. Intelligent Classification

Using Claude Haiku API, RAYST analyzes conversations to:

- Identify context types (database work, API development, debugging, etc.)
- Extract technical keywords and stack information
- Understand the conversation's intent and domain

### 3. Quality Assessment

RAYST detects success signals in your messages:

- **Positive**: "완벽해요", "됐습니다", "고마워요"
- **Negative**: "다시해줘", "틀렸어", "아니 이게 아니라"

This determines which conversation patterns actually helped you succeed.

### 4. Training Data Generation

Successful conversations are transformed into training examples:

```json
{
  "system": "You are specialized in database_migration for project rayst...",
  "messages": [
    {"role": "user", "content": "Add a new field to track processing status"},
    {"role": "assistant", "content": "I'll add the field using a migration..."}
  ]
}
```

### 5. Human Review

Before using data for training, you review and approve examples through a dashboard to ensure quality.

### 6. Context Injection

When you start a new conversation, RAYST:

1. Analyzes your prompt
2. Finds similar past successful contexts
3. Injects relevant patterns into the conversation
4. Helps Claude understand your specific preferences

## Architecture

```
┌──────────────────┐
│  Claude Code     │
│  (Any Project)   │
└────────┬─────────┘
         │ Global Hooks
         ↓
┌──────────────────┐
│  RAYST Server    │
│  (Port 8794)     │
└────────┬─────────┘
         │
    ┌────┴────┐
    ↓         ↓
┌────────┐ ┌──────┐
│  JSONL │ │ PG DB│
│  Logs  │ │      │
└────────┘ └──────┘
         │
         ↓
┌──────────────────┐
│ Batch Pipeline   │
│ 1. Classify      │
│ 2. Assess        │
│ 3. Generate      │
│ 4. Review        │
│ 5. Train         │
└──────────────────┘
```

## Key Features

### Privacy-First
- All data stored locally
- No external services except optional Claude API for classification
- Full control over what gets collected

### Efficient
- Minimal real-time overhead (just logging)
- Batch processing for heavy analysis
- ~$1/month API cost for 300 conversations

### Flexible
- Works with any SPFN project
- Extensible pipeline stages
- Support for multiple training approaches

### Transparent
- View all collected data
- Browse by project, category, or tags
- Full audit trail of processing stages

## Use Cases

### 1. Project-Specific Context

When working on your e-commerce project, RAYST knows:
- Your preferred database patterns
- Common API structures you use
- Error handling approaches that worked

### 2. Cross-Project Learning

Patterns that worked in Project A can be suggested for similar situations in Project B.

### 3. Personal Coding Style

RAYST learns your preferences:
- Naming conventions you prefer
- Code organization patterns
- Testing approaches you favor

### 4. Tool Usage Optimization

Track which tool sequences lead to success:
- Read → Edit → Bash (for config changes)
- Grep → Read → Edit (for refactoring)

## Getting Started

See the [RAYST README](../../../apps/rayst/README.md) for setup instructions.

## Pipeline Details

For complete pipeline architecture and implementation details, see [Personalization Pipeline](./personalization-pipeline.md).

## Current Status

**Implemented:**
- ✅ Global hook configuration
- ✅ Real-time data collection
- ✅ JSONL + PostgreSQL dual storage
- ✅ Basic keyword-based classification
- ✅ Browsing and query tools

**In Progress:**
- 🔄 Claude API-based context classification
- 🔄 Quality assessment system
- 🔄 Training data generation
- 🔄 Review dashboard

**Planned:**
- 📋 Context injection system
- 📋 Fine-tuning integration
- 📋 Semantic search with embeddings
- 📋 A/B testing for effectiveness

## Contributing

This is a private project, but the patterns and architecture can be adapted for your own personalization needs.

## Related Resources

- [Personalization Pipeline](./personalization-pipeline.md) - Complete technical design
- [RAYST Project](../../../apps/rayst/) - Source code
- [Database Guide](../../guides/database.md) - SPFN database patterns