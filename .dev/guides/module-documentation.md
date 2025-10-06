# Module Documentation Standard

## .guide/ Directory Convention

All SPFN packages should maintain a `.guide/` directory for Claude Code integration.

### Purpose

- **Claude Code Integration**: Files in `.guide/` are automatically referenced by Claude Code
- **No Duplication**: Use existing README.md, don't duplicate content
- **Consistent Naming**: Follow `spfn-{package}.md` convention

### Implementation

**Automatic Sync:**
```bash
npm run sync:guides
```

This copies:
- `packages/core/README.md` → `packages/core/.guide/spfn-core.md`
- `packages/auth/README.md` → `packages/auth/.guide/spfn-auth.md`
- `packages/cli/README.md` → `packages/cli/.guide/spfn-cli.md`

### When to Run

- **After updating README.md**: Run `npm run sync:guides`
- **Before commits**: Ensure .guide/ is up to date
- **CI/CD**: Can be added to build pipeline (optional)

### File Structure

```
packages/
├── core/
│   ├── README.md              # Source of truth
│   └── .guide/
│       └── spfn-core.md       # Auto-generated (gitignored)
├── auth/
│   ├── README.md
│   └── .guide/
│       └── spfn-auth.md
└── cli/
    ├── README.md
    └── .guide/
        └── spfn-cli.md
```

### Adding New Packages

1. Create `README.md` in package root
2. Add package name mapping to `scripts/sync-guides.js`:
   ```javascript
   const packageMapping = {
     'core': 'spfn-core.md',
     'auth': 'spfn-auth.md',
     'cli': 'spfn-cli.md',
     'your-package': 'spfn-your-package.md', // Add here
   };
   ```
3. Run `npm run sync:guides`

### Why Not Symlinks?

- **Cross-platform**: Symlinks don't work well on Windows
- **Simple**: Copy is more explicit and predictable
- **Fast**: Sync script runs in milliseconds

### .gitignore

`.guide/` directories are gitignored since they're auto-generated:
```gitignore
# Auto-generated guides (synced from README.md)
packages/*/.guide/
```

**Exception**: User-facing templates like `packages/cli/templates/.guide/` ARE committed
(for `spfn init` to copy to projects).

---

## Example Workflow

```bash
# 1. Update package documentation
vim packages/core/README.md

# 2. Sync to .guide/
npm run sync:guides

# 3. Commit (only README.md, not .guide/)
git add packages/core/README.md
git commit -m "docs(core): update routing examples"
```

Claude Code will automatically reference the latest `spfn-core.md` in `.guide/`.