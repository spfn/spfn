---
title: "Why PostgreSQL?"
description: "Why Superfunction chose PostgreSQL as its primary database"
order: 1
available: true
---

# Why PostgreSQL?

Superfunction is built on PostgreSQL. Here's why.

## The Short Answer

PostgreSQL is the most **advanced open-source relational database** with features that matter for modern applications:

- ✅ Full ACID compliance
- ✅ Advanced data types (JSON, Arrays, UUID)
- ✅ Powerful indexing (B-tree, GiST, GIN)
- ✅ Extensions ecosystem (PostGIS, pgvector, TimescaleDB)
- ✅ Production-ready concurrency control
- ✅ Excellent open-source tooling

## PostgreSQL vs Other Databases

### PostgreSQL vs MySQL

| Feature | PostgreSQL | MySQL |
|---------|-----------|-------|
| **ACID Compliance** | ✅ Full support | ⚠️ InnoDB only |
| **JSON Support** | ✅ Native JSONB with indexing | ⚠️ Basic JSON type |
| **Full-text Search** | ✅ Built-in with GIN index | ⚠️ Limited |
| **Arrays & Composite Types** | ✅ Native support | ❌ No support |
| **Window Functions** | ✅ Full support | ⚠️ Limited |
| **CTEs & Recursive Queries** | ✅ Full support | ⚠️ Basic support |
| **Extensions** | ✅ Rich ecosystem | ❌ Limited |
| **Standards Compliance** | ✅ SQL standard | ⚠️ MySQL-specific SQL |

### PostgreSQL vs SQLite

| Feature | PostgreSQL | SQLite |
|---------|-----------|--------|
| **Concurrency** | ✅ Multi-client, row-level locking | ⚠️ File-level locking |
| **Scalability** | ✅ Production scale | ⚠️ Single-user, embedded |
| **Network Access** | ✅ Client-server | ❌ File-based |
| **Data Types** | ✅ Rich type system | ⚠️ Limited types |
| **Use Case** | Production apps | Local dev, mobile apps |

## Why It Matters for Superfunction

### 1. Connection Pooling

PostgreSQL's **multi-client architecture** makes connection pooling effective:

```typescript
// Superfunction maintains persistent connections
const pool = new Pool({
  max: 20,           // Reuse 20 connections
  idleTimeout: 30000 // Keep alive for 30s
});

// Each request reuses existing connections
// No overhead of creating new connections
```

**Why this matters:**
- MySQL: Similar capability
- SQLite: No benefit (file-based, no pooling)

### 2. Advanced Data Types

Store complex data without JSON serialization:

```typescript
import { pgTable, jsonb, uuid, text[] } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  metadata: jsonb('metadata'),      // Native JSON with indexing
  tags: text('tags').array(),       // Native arrays
  settings: jsonb('settings')       // No serialization needed
});

// Query JSON fields directly
const user = await db
  .select()
  .from(users)
  .where(sql`metadata->>'role' = 'admin'`);
```

**Why this matters:**
- No manual JSON.stringify/parse
- Index JSON fields for fast queries
- Type-safe with Drizzle ORM

### 3. Full-text Search

Built-in search without external services:

```typescript
// Create search index
await db.execute(sql`
  CREATE INDEX users_search_idx
  ON users
  USING GIN (to_tsvector('english', name || ' ' || bio))
`);

// Search users
const results = await db
  .select()
  .from(users)
  .where(sql`
    to_tsvector('english', name || ' ' || bio)
    @@ to_tsquery('english', ${query})
  `);
```

**Why this matters:**
- No need for Elasticsearch for basic search
- Ranking, stemming, and language support built-in
- One less service to manage

### 4. Transactions & ACID

Complex business logic with confidence:

```typescript
await db.transaction(async (tx) => {
  // Deduct from sender
  await tx.update(accounts)
    .set({ balance: sql`balance - ${amount}` })
    .where(eq(accounts.id, senderId));

  // Add to receiver
  await tx.update(accounts)
    .set({ balance: sql`balance + ${amount}` })
    .where(eq(accounts.id, receiverId));

  // Log transaction
  await tx.insert(transactions).values({ ... });

  // All or nothing - guaranteed
});
```

**Why this matters:**
- MySQL: Similar support (InnoDB)
- SQLite: Limited concurrent writes
- PostgreSQL: Production-grade MVCC

### 5. Extensions Ecosystem

Add capabilities without leaving the database:

```sql
-- Geospatial queries
CREATE EXTENSION postgis;
SELECT * FROM stores
WHERE ST_DWithin(location, ST_MakePoint(lng, lat), 1000);

-- Vector similarity search (AI embeddings)
CREATE EXTENSION vector;
SELECT * FROM documents
ORDER BY embedding <-> query_vector
LIMIT 10;

-- Time-series data
CREATE EXTENSION timescaledb;
SELECT time_bucket('1 hour', timestamp), avg(value)
FROM metrics
GROUP BY 1;
```

**Why this matters:**
- No separate services for common needs
- One database, multiple capabilities
- Proven and battle-tested extensions

## Production-Ready Features

### Concurrent Writes

PostgreSQL's **MVCC (Multi-Version Concurrency Control)**:

```typescript
// Multiple clients can write simultaneously
// No blocking on reads, minimal blocking on writes

// Client A
await db.update(posts).set({ views: views + 1 });

// Client B (concurrent)
await db.update(posts).set({ likes: likes + 1 });

// Both succeed without conflicts
```

### Reliability

PostgreSQL has been **production-tested for 25+ years**:

- ACID guarantees prevent data corruption
- Write-Ahead Logging (WAL) for crash recovery
- Point-in-time recovery (PITR)
- Replication support (streaming, logical)

### Performance

Optimized for real-world workloads:

- Advanced query planner and optimizer
- Parallel query execution
- Multiple indexing strategies (B-tree, Hash, GiST, GIN, BRIN)
- Table partitioning for large datasets

## Supabase Uses PostgreSQL

[Supabase](https://supabase.com) built their entire platform on PostgreSQL for good reasons:

> **"PostgreSQL is the world's most advanced open source database."** - Supabase

Key reasons:
- **Row Level Security (RLS)** - Built-in authorization at database level
- **Realtime** - PostgreSQL replication for live updates
- **Extensions** - PostGIS for geo, pg_cron for scheduling, etc.
- **Stability** - 25+ years of production use
- **Standards** - SQL compliance means portable knowledge

Superfunction shares this philosophy: Build on proven, powerful foundations.

## Other Options?

### When to use MySQL

- You're already invested in MySQL ecosystem
- You need MySQL-specific features (e.g., MySQL Cluster)
- Your team has deep MySQL expertise

**Note:** Superfunction focuses on PostgreSQL, but could support MySQL in the future.

### When to use SQLite

- Local development and testing
- Mobile apps (on-device storage)
- Edge computing with single-user access
- Embedded systems

**Note:** SQLite is great for these use cases, but not for server applications.

## Getting Started

Superfunction works with:

- **Local PostgreSQL** - Install via Homebrew, apt, etc.
- **Docker** - `docker-compose up` for instant setup
- **Supabase** - Hosted PostgreSQL with additional features
- **Neon** - Serverless PostgreSQL
- **Railway** - Simple deployment

See [Database Setup](/docs/guides/database) for detailed instructions.

## Next Steps

- [Database Guide](/docs/guides/database) - Set up PostgreSQL for Superfunction
- [Schema Design](/docs/guides/schema-design) - Design your database schema
- [Drizzle ORM](/docs/guides/drizzle) - Type-safe database queries