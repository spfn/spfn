# Sync main to Gitea

Merge main branch into gitea-main and push to Gitea remote.

---

```bash
# Save current branch
CURRENT_BRANCH=$(git branch --show-current)

# Switch to gitea-main
git checkout gitea-main

# Merge main
git merge main

# Push to Gitea remote (gitea-main -> gitea/main)
git push gitea gitea-main:main

# Return to original branch
git checkout $CURRENT_BRANCH

echo "✅ Successfully synced main to Gitea (gitea/main)"
```