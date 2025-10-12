# SPFN Landing Page Deployment Guide

This guide explains how to deploy the SPFN landing page using our dual-repository strategy.

## Repository Strategy

We maintain two git remotes:

- **GitHub** (`origin`): Public repository without CI/CD configuration
- **Gitea** (`gitea`): Internal repository with Woodpecker CI/CD configuration

## Branch Structure

### `main` branch (GitHub)
- Contains landing page source code
- Excludes `.woodpecker.yml` and `.woodpecker.main.yml` (via .gitignore)
- Public facing, open source

### `gitea-main` branch (Gitea only)
- Contains everything in `main` branch
- Plus: `.woodpecker.yml` and `.woodpecker.main.yml` for CI/CD
- Triggers automated deployment via Woodpecker CI

## Deployment Workflow

### 1. Development on `main` branch

```bash
# Work on main branch
git checkout main

# Make changes, commit
git add .
git commit -m "feat: your changes"

# Push to GitHub
git push origin main
```

### 2. Deploy to Gitea (triggers CI/CD)

```bash
# Switch to gitea-main branch
git checkout gitea-main

# Merge changes from main
git merge main

# Push to Gitea (triggers Woodpecker CI/CD)
git push gitea gitea-main:main
```

## CI/CD Pipeline

The Woodpecker CI/CD pipeline will:

1. **Trigger Conditions**:
   - Only when `apps/landing/**` files change
   - Excludes markdown files and `.gitignore`

2. **Build Process**:
   - Clone source repository
   - Build Docker image with context: `apps/landing/`
   - Image name: `git.superfunction.xyz/spfn/spfn-superfunction:branch-sha`
   - Push to Gitea Container Registry

3. **Deploy Process**:
   - Update GitOps repository
   - ArgoCD automatically deploys to Kubernetes

## Deployment Environments

### Development (dev/develop branches)
- **Image**: Uses `nextjs.Dockerfile`
- **Resources**: 128Mi memory, 200m CPU
- **URL Pattern**: `{branch}-spfn-spfn.superfunction.xyz`
- **Replicas**: 1

### Production (main branch)
- **Image**: Uses `nextjs.Dockerfile`
- **Resources**: 128Mi memory, 200m CPU
- **URL Pattern**: `spfn-spfn.superfunction.xyz`
- **Replicas**: 1
- **Port**: 3790

## Manual Deployment

To manually trigger deployment:

```bash
# On gitea-main branch
git push gitea gitea-main:main
```

Or trigger via Woodpecker UI with manual event.

## Configuration Files

- `.woodpecker.yml`: Development environment pipeline
- `.woodpecker.main.yml`: Production environment pipeline
- Both files are excluded from GitHub via `.gitignore`

## Troubleshooting

### Pipeline not triggered
- Check if changes are in `apps/landing/**` directory
- Verify path filters in `.woodpecker.yml`

### Build fails
- Check Dockerfile exists in `spfn-apps/dockerfiles` repository
- Verify build context is `apps/landing/`

### Deployment fails
- Check GitOps repository exists: `git.superfunction.xyz/spfn-apps/spfn-spfn.git`
- Verify ArgoCD ApplicationSet is configured

## Notes

- ⚠️ Never commit `.woodpecker.yml` files to GitHub `main` branch
- ⚠️ Always use `gitea-main` branch for deployments
- ⚠️ Woodpecker secrets must be configured in Gitea repository settings