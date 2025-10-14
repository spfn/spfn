# Deploy to npm

Push changes to GitHub and create version tag to trigger npm deployment.

## Tag Strategy

The GitHub workflow (`.github/workflows/publish.yml`) supports three tag patterns:

1. **`v*`** - Deploys **BOTH** packages (@spfn/core + spfn)
   - Example: `v0.1.0-alpha.16`
   - Use when both packages have changes

2. **`spfn@*`** - Deploys **ONLY** spfn package
   - Example: `spfn@0.1.0-alpha.16`
   - Use when only CLI has changes

3. **`@spfn/core@*`** - Deploys **ONLY** @spfn/core package
   - Example: `@spfn/core@0.1.0-alpha.16`
   - Use when only core has changes

## Workflow Analysis

From `.github/workflows/publish.yml`:

```yaml
on:
  push:
    tags:
      - '@spfn/core@*'  # @spfn/core only
      - 'spfn@*'        # spfn only
      - 'v*'            # Both packages

jobs:
  publish:
    steps:
      # Publish @spfn/core
      - name: Publish @spfn/core to npm
        if: startsWith(github.ref, 'refs/tags/@spfn/core@') || startsWith(github.ref, 'refs/tags/v')
        working-directory: packages/core
        run: pnpm publish --access public --tag alpha --provenance --no-git-checks

      # Publish spfn
      - name: Publish spfn to npm
        if: startsWith(github.ref, 'refs/tags/spfn@') || startsWith(github.ref, 'refs/tags/v')
        working-directory: packages/spfn
        run: pnpm publish --access public --tag alpha --provenance --no-git-checks
```

## Important Notes

- **DO NOT** use `v*` tags unless BOTH packages have version bumps
- Using `v*` with unchanged package will cause npm 403 error (cannot republish same version)
- Always check which packages have changes before choosing tag pattern

## Deployment Steps

### Step 1: Check which packages changed

```bash
# Check if core package changed
git diff --name-only HEAD~1 HEAD | grep "packages/core/"

# Check if spfn package changed
git diff --name-only HEAD~1 HEAD | grep "packages/spfn/"
```

### Step 2: Update version(s) in package.json

```bash
# If only spfn changed
# Edit packages/spfn/package.json version

# If only core changed
# Edit packages/core/package.json version

# If both changed
# Edit both package.json files
```

### Step 3: Pre-deployment checks

```bash
# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
  echo "❌ You have uncommitted changes. Please commit them first."
  git status -s
  exit 1
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "❌ You must be on main branch to deploy. Current branch: $CURRENT_BRANCH"
  exit 1
fi
```

### Step 4: Push and tag

```bash
# Push commits first
git push

# Choose appropriate tag based on what changed:
```

#### Option A: Deploy spfn only (CLI changes)

```bash
SPFN_VERSION=$(node -p "require('./packages/spfn/package.json').version")
echo "📦 Deploying spfn@$SPFN_VERSION"
git tag "spfn@$SPFN_VERSION"
git push origin "spfn@$SPFN_VERSION"
```

#### Option B: Deploy @spfn/core only (Core changes)

```bash
CORE_VERSION=$(node -p "require('./packages/core/package.json').version")
echo "📦 Deploying @spfn/core@$CORE_VERSION"
git tag "@spfn/core@$CORE_VERSION"
git push origin "@spfn/core@$CORE_VERSION"
```

#### Option C: Deploy both packages (Both changed)

```bash
VERSION=$(node -p "require('./packages/core/package.json').version")
echo "📦 Deploying v$VERSION (both packages)"
git tag "v$VERSION"
git push origin "v$VERSION"
```

### Step 5: Verify deployment

```bash
echo "🔗 Check deployment status: https://github.com/spfn/spfn/actions"
echo ""
echo "After deployment completes, install with:"
echo "  npm install @spfn/core@alpha"
echo "  npx spfn@alpha"
```

## Troubleshooting

### Error: "403 You cannot publish over the previously published versions"

This means you're trying to publish a package version that already exists on npm.

**Solution:**
1. Delete the wrong tag: `git tag -d TAG_NAME && git push origin :refs/tags/TAG_NAME`
2. Use the correct tag pattern that only publishes changed packages
3. Example: If only spfn changed, use `spfn@VERSION` not `v*`