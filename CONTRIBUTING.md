# Contributing to SPFN

First off, thank you for considering contributing to SPFN! It's people like you that make SPFN a great framework.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Messages](#commit-messages)
- [Documentation](#documentation)

## 📜 Code of Conduct

This project and everyone participating in it is governed by our commitment to fostering an open and welcoming environment. Please be respectful and constructive in all interactions.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- PostgreSQL 14+
- Redis 7+ (optional, for cache-related work)
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/spfn.git
cd spfn
```

3. Add the upstream repository:

```bash
git remote add upstream https://github.com/your-org/spfn.git
```

### Install Dependencies

```bash
pnpm install
```

### Set Up Development Environment

```bash
# Copy environment file
cp packages/core/.env.example packages/core/.env.local

# Start PostgreSQL (via Docker)
docker compose -f docker-compose.test.yml up -d

# Run tests to verify setup
pnpm test
```

## 🔧 Development Workflow

### 1. Create a Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or modifications
- `chore/` - Maintenance tasks

### 2. Make Your Changes

Follow our [Coding Standards](./CODING_STANDARDS.md) when making changes.

### 3. Run Tests

Always run tests before committing:

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm test --filter=@spfn/core

# Run tests in watch mode while developing
pnpm test:watch
```

### 4. Build

Ensure your changes build successfully:

```bash
# Build all packages
pnpm build

# Build specific package
pnpm build --filter=@spfn/core
```

### 5. Type Check

Run TypeScript type checking:

```bash
pnpm type-check
```

## 📝 Pull Request Process

### Before Submitting

1. **Sync with upstream:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run the full test suite:**
   ```bash
   pnpm test
   ```

3. **Build all packages:**
   ```bash
   pnpm build
   ```

4. **Lint your code:**
   ```bash
   pnpm lint
   ```

### Submitting

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Open a Pull Request on GitHub

3. Fill out the PR template completely

4. Link any related issues

### PR Requirements

- ✅ All tests passing
- ✅ Code follows style guidelines
- ✅ Documentation updated (if applicable)
- ✅ Commits follow conventional commit format
- ✅ No merge conflicts
- ✅ Reviewed and approved by maintainer

### Review Process

- Maintainers will review your PR within 1-2 weeks
- Address any requested changes
- Once approved, a maintainer will merge your PR

## 💻 Coding Standards

We follow strict coding standards to maintain code quality and consistency.

### General Guidelines

1. **TypeScript First**
   - Use TypeScript for all code
   - Avoid `any` types
   - Provide proper type annotations

2. **Functional Style**
   - Prefer pure functions
   - Avoid mutations when possible
   - Use immutable data structures

3. **Clear Naming**
   - Use descriptive variable/function names
   - Follow existing naming conventions
   - Avoid abbreviations unless common

4. **Comments**
   - Write comments in English
   - Use JSDoc for public APIs
   - Explain "why" not "what"

### Code Style

```typescript
// ✅ Good
export async function findUserById(id: number): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
  });
  return user ?? null;
}

// ❌ Bad
export async function getUserById(id: any) {
  return await db.query.users.findFirst({
    where: eq(users.id, id),
  }) || null;
}
```

See [CODING_STANDARDS.md](./CODING_STANDARDS.md) for complete guidelines.

## 🧪 Testing Guidelines

### Test Coverage

- All new features must include tests
- Bug fixes must include regression tests
- Aim for >80% code coverage

### Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('FeatureName', () => {
  beforeEach(() => {
    // Setup
  });

  describe('methodName', () => {
    it('should handle normal case', async () => {
      // Arrange
      const input = createTestData();

      // Act
      const result = await method(input);

      // Assert
      expect(result).toEqual(expected);
    });

    it('should handle edge case', async () => {
      // Test edge case
    });

    it('should throw on invalid input', async () => {
      // Test error case
      await expect(method(invalid)).rejects.toThrow();
    });
  });
});
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- route-scanner.test.ts

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

## 📝 Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for clear and structured commit messages.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### Examples

```bash
# Feature
git commit -m "feat(route): add support for catch-all routes"

# Bug fix
git commit -m "fix(db): resolve connection pool leak on reconnect"

# Documentation
git commit -m "docs(readme): update installation instructions"

# Multiple paragraphs
git commit -m "feat(cache): add Redis cluster support

- Add cluster configuration options
- Implement failover handling
- Add connection health checks

Closes #123"
```

### Rules

- Use present tense ("add feature" not "added feature")
- Use imperative mood ("move cursor to..." not "moves cursor to...")
- First line should be ≤72 characters
- Reference issues in footer (e.g., "Closes #123")

## 📚 Documentation

### When to Update Documentation

- Adding new features
- Changing existing behavior
- Adding new APIs
- Fixing bugs (if user-facing)

### Documentation Types

1. **README files** - High-level overviews
2. **JSDoc comments** - API documentation
3. **Module READMEs** - Detailed module documentation
4. **Examples** - Usage examples in code

### Documentation Style

```typescript
/**
 * Find a user by their unique identifier
 *
 * @param id - The user's ID
 * @returns The user if found, null otherwise
 * @throws {DatabaseError} If database connection fails
 *
 * @example
 * ```typescript
 * const user = await findUserById(123);
 * if (user) {
 *   console.log(user.email);
 * }
 * ```
 */
export async function findUserById(id: number): Promise<User | null> {
  // Implementation
}
```

## 🐛 Reporting Bugs

### Before Reporting

1. Check existing issues
2. Verify it's reproducible
3. Test on latest version

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Environment:**
- SPFN version: [e.g., 0.1.0]
- Node.js version: [e.g., 18.17.0]
- OS: [e.g., macOS 14.0]

**Additional context**
Any other relevant information.
```

## 💡 Feature Requests

We welcome feature requests! Please:

1. Check if it's already requested
2. Describe the use case
3. Explain why it's valuable
4. Consider if it fits the framework philosophy

## 🏗️ Project Structure

```
spfn/
├── packages/
│   ├── core/           # Framework core
│   ├── auth/           # Authentication
│   └── cli/            # CLI tool
├── docs/               # Documentation
├── .github/            # GitHub configs
└── scripts/            # Build/dev scripts
```

## 📞 Getting Help

- 📖 [Documentation](./packages/core/README.md)
- 💬 [Discussions](https://github.com/your-org/spfn/discussions)
- 🐛 [Issue Tracker](https://github.com/your-org/spfn/issues)

## 🙏 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- GitHub contributors page

Thank you for contributing to SPFN! 🎉