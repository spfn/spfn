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

---

## Testing Protocol

### npm link Based Testing

**All testing MUST use npm link to ensure we test the actual packages as users would install them.**

#### Setup Process

1. **Link packages from monorepo** (one-time setup per test session):
   ```bash
   cd /Users/launchscreen/PROJECTS/SUPERFUNCTION/workspace/spfn

   # Link CLI globally
   cd packages/cli
   npm link

   # Link core package
   cd ../core
   npm link
   ```

2. **Create test project and link packages**:
   ```bash
   cd /Users/launchscreen/PROJECTS/RAYIM/workspaces
   mkdir test && cd test

   # Initialize Next.js project
   npx create-next-app@latest . --typescript --tailwind --app --no-src-dir

   # Link SPFN packages
   npm link @spfn/cli
   spfn init  # This will auto-link @spfn/core

   # Or manually link core if needed
   npm link @spfn/core
   ```

3. **Verify links**:
   ```bash
   ls -la node_modules/@spfn
   # Should show symlinks to monorepo packages
   ```

#### Testing Workflow

**Test Scenario: Full Development Flow**

1. **Initialize project**:
   ```bash
   spfn init
   ```
   - Verify: src/server/ structure created
   - Verify: package.json scripts added
   - Verify: dependencies installed

2. **Start development server**:
   ```bash
   npm run spfn:dev
   # Or: npm run spfn:server (backend only)
   ```
   - Verify: Server starts on port 8790
   - Verify: Health endpoint responds at /health
   - Verify: Example routes work at /examples

3. **Add new route with contract**:
   ```bash
   # Create contract
   # src/server/contracts/posts.ts

   # Create route
   # src/server/routes/posts/index.ts
   ```
   - Verify: Hot reload detects new route
   - Verify: Route accessible via HTTP
   - Verify: Contract validation works

4. **Generate client code**:
   ```bash
   npm run generate:client
   # Or use watch mode
   ```
   - Verify: Client code generated from contracts
   - Verify: Types are correct
   - Verify: Frontend can import and use client

5. **Test changes**:
   - Make changes to routes
   - Verify hot reload works
   - Test API endpoints
   - Test type safety in frontend

#### After Testing

**Cleanup** (optional):
```bash
# In test project
npm unlink @spfn/cli @spfn/core

# In monorepo
cd packages/cli && npm unlink
cd ../core && npm unlink
```

#### Test Checklist

Before considering a feature complete:
- [ ] npm link setup successful
- [ ] spfn init works correctly
- [ ] Development server starts
- [ ] Hot reload works for route changes
- [ ] Contract validation works
- [ ] Client generation works
- [ ] Generated types are correct
- [ ] Example works end-to-end (add route → test → frontend usage)

#### Why npm link?

- **Real user experience**: Tests packages as if installed from npm
- **Catches packaging issues**: Missing files, incorrect exports, dependency issues
- **Prevents false positives**: Avoids monorepo-specific behaviors
- **Build verification**: Tests compiled output, not source
- **Integration testing**: Tests how packages work together

#### Common Issues

1. **Link not working**: Re-run npm link in package dir
2. **Old version cached**: npm unlink && npm link
3. **Changes not reflected**: Rebuild package (npm run build)
4. **Permission errors**: Check global npm directory permissions