# Branching Strategy

SPFN follows a simple branching strategy optimized for rapid development during the alpha phase.

## Branch Types

### `main`
- **Purpose**: Production-ready code for alpha releases
- **Protection**: Direct commits allowed (single maintainer during alpha)
- **Deployment**: All commits tagged with `@alpha` are published to npm
- **Rule**: Only include packages that are ready for public use

### `feature/*`
- **Purpose**: New features that will be merged to main
- **Naming**: `feature/description` (e.g., `feature/websocket`, `feature/file-upload`)
- **Lifecycle**: Create → Develop → Merge to main → Delete
- **Example**:
  ```bash
  git checkout -b feature/websocket
  # develop...
  git checkout main
  git merge feature/websocket
  git branch -d feature/websocket
  ```

### `fix/*`
- **Purpose**: Bug fixes
- **Naming**: `fix/description` (e.g., `fix/route-validation`, `fix/type-inference`)
- **Lifecycle**: Create → Fix → Merge to main → Delete

### `package/*`
- **Purpose**: Package development that is NOT ready for public release
- **Naming**: `package/name` (e.g., `package/user-auth`, `package/storage`)
- **Lifecycle**: Long-lived, merged to main when package is production-ready
- **Important**: Packages in these branches are excluded from main until stable
- **Example**:
  ```bash
  # Create branch for new package development
  git checkout -b package/storage

  # Develop package (months of work)...

  # When ready for public release:
  git checkout main
  git merge package/storage
  ```

### `refactor/*`
- **Purpose**: Code refactoring without changing functionality
- **Naming**: `refactor/description` (e.g., `refactor/router-architecture`)
- **Lifecycle**: Create → Refactor → Merge to main → Delete

### `docs/*`
- **Purpose**: Documentation updates
- **Naming**: `docs/description` (e.g., `docs/api-reference`, `docs/migration-guide`)
- **Lifecycle**: Create → Update → Merge to main → Delete

### `chore/*`
- **Purpose**: Build system, dependencies, configuration
- **Naming**: `chore/description` (e.g., `chore/update-deps`, `chore/tsconfig`)
- **Lifecycle**: Create → Update → Merge to main → Delete

## Current Active Branches

### `package/user-auth`
**Status**: Under development
**Contains**:
- `@spfn/auth` - Client-key based authentication
- `@spfn/user` - User management and profiles

**Features planned**:
- User registration, profiles, deletion
- Authentication (asymmetric cryptography, ECDSA P-256)
- Authorization (role-based, permission-based)
- User invitations

**Why separate**: Not ready for public alpha release. Will be merged when stable.

## Guidelines

### When to Create a Branch

✅ **DO create a branch for**:
- New features taking more than 1 commit
- Experimental work
- Packages not ready for release
- Breaking changes requiring review

❌ **DON'T create a branch for**:
- Typo fixes (commit directly to main)
- README updates (commit directly to main)
- Version bumps (commit directly to main)

### Branch Naming Rules

1. Use **full words**, not abbreviations
   - ✅ `feature/websocket`
   - ❌ `feat/ws`

2. Use **kebab-case**
   - ✅ `feature/user-authentication`
   - ❌ `feature/user_authentication`

3. Be **descriptive**
   - ✅ `fix/route-parameter-validation`
   - ❌ `fix/bug`

4. Keep it **short** (< 50 characters)
   - ✅ `feature/docker-compose`
   - ❌ `feature/add-docker-compose-setup-for-local-development-environment`

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

[optional body]
[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation
- `chore`: Build, dependencies, config
- `test`: Adding or updating tests
- `perf`: Performance improvements

**Examples**:
```bash
feat: add Docker Compose for local development
fix: correct route parameter validation
docs: update API documentation for @spfn/core
chore: update dependencies to latest versions
```

## Workflow Examples

### Adding a New Feature
```bash
# Create feature branch
git checkout -b feature/redis-cache

# Work on feature
git add .
git commit -m "feat: add Redis caching layer"

# Merge to main when ready
git checkout main
git merge feature/redis-cache
git branch -d feature/redis-cache
```

### Developing a New Package
```bash
# Create package branch
git checkout -b package/storage

# Add package code
mkdir -p packages/storage/src
# ... develop package ...

# Commit regularly
git add packages/storage
git commit -m "feat(storage): implement S3 file upload"

# Keep working (package stays in branch)
# ... months of development ...

# When ready for release:
git checkout main
git merge package/storage
# Now @spfn/storage is in main and will be published
```

### Fixing a Bug
```bash
# Create fix branch
git checkout -b fix/validation-error

# Fix the bug
git add .
git commit -m "fix: resolve validation error for numeric params"

# Merge to main
git checkout main
git merge fix/validation-error
git branch -d fix/validation-error
```

## Alpha Phase Notes

During the alpha phase:
- Main branch is the only deployment target
- No `develop` or `staging` branches
- Fast iteration is prioritized
- Breaking changes are acceptable (version bumps handle this)
- Single maintainer can commit directly to main for small changes

This strategy will evolve as the project matures and gains contributors.