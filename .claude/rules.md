# SPFN Development Rules

## Critical: Module Usage Protocol

**THESE RULES ARE MANDATORY FOR ALL @spfn/* MODULE USAGE**

### Before Using Any @spfn/* Module

1. **MUST Read Documentation First**
   ```
   ✅ Search for: packages/[module]/README.md
   ✅ Read relevant sections thoroughly
   ✅ Check example code
   ✅ Understand the API and patterns
   ```

2. **MUST Explain Understanding Before Coding**
   ```
   ✅ Summarize what you learned from docs
   ✅ Explain the intended approach
   ✅ Ask: "Is this the correct understanding?"
   ✅ Wait for user approval
   ```

3. **MUST State Uncertainty Explicitly**
   ```
   ✅ Say: "I'm not certain about this"
   ✅ Say: "Let me check the documentation"
   ✅ Say: "I need to verify this approach"
   ❌ NEVER guess and pretend to be certain
   ❌ NEVER make assumptions without stating them
   ```

4. **MUST Follow: Plan → Approve → Execute**
   ```
   Step 1: Propose detailed structure/approach
   Step 2: Get explicit user approval
   Step 3: Then and only then, write code
   ```

### Documentation Priority Order

1. **Module README** (`packages/[module]/README.md`)
2. **Sub-module README** (`packages/[module]/src/[feature]/README.md`)
3. **Main package docs** (`packages/[module]/docs/`)
4. **Source code with JSDoc** (last resort)

### Red Flags = STOP and Check Docs

- Using a module for the first time
- Not 100% certain about the API
- Making assumptions about behavior
- Copying patterns from memory/other projects
- Getting errors that don't make sense

### Violation Handling

**IF you realize you didn't follow these rules:**
1. STOP immediately
2. Acknowledge the mistake
3. Read the documentation
4. Restart with correct approach

### Example: Correct Workflow

```
❌ BAD:
User: "Use @spfn/route for routing"
Claude: *immediately writes code based on assumptions*

✅ GOOD:
User: "Use @spfn/route for routing"
Claude: "Let me first check the @spfn/route README to understand the correct usage..."
Claude: *reads packages/core/src/route/README.md*
Claude: "Based on the README, @spfn/route uses file-based routing where:
         - Each route file exports a Hono instance
         - Routes are auto-loaded from routes/ directory
         - bind() is used for contract validation
         Is this the approach you want?"
User: "Yes"
Claude: *proceeds with correct implementation*
```

## Why These Rules Exist

- **Prevent hallucination**: Stop making up APIs
- **Save time**: Avoid wrong implementations
- **Build trust**: Ensure correctness
- **Maintain quality**: Follow intended patterns

## Enforcement

These rules apply to **EVERY session**. No exceptions.