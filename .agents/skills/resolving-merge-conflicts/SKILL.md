---
name: resolving-merge-conflicts
description: "Use when you need to resolve an in-progress git merge/rebase conflict."
---
1. **See the current state** of the merge/rebase. Check git history, and the conflicting files.

2. **Verify what pull actually did to your local work.** `git pull` performs a fetch + merge (or rebase if configured) — it does **NOT** delete uncommitted or untracked work. Uncommitted changes remain in the working tree; untracked files remain untracked. The only way local work disappears is via explicit destructive commands (`git reset --hard`, `git clean -fd`, `git checkout .`). If you ran `git pull` and are worried your changes vanished, stop and inspect `git status` before doing anything else.

3. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs, check original issues/tickets.

4. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort`.

5. **Before staging or committing, classify what is actually staged.** Run `git diff --stat --cached` or `git status --short` to see exactly what will ship. Ask: are there configuration files with hardcoded credentials, local-only files, IDE artifacts, or `.env` content that should not go into the commit? Check `git check-ignore .env` to confirm secrets files are ignored, and `git ls-files --others --exclude-standard` to see what is currently untracked. If something sensitive is staged, unstage it with `git reset HEAD <file>` and add it to `.gitignore` first.

6. **Check for credential leakage.** After resolving conflicts in config files (docker-compose, launchSettings, appsettings, connection strings), grep the staged diff for passwords, tokens, or connection strings: `git diff --cached | grep -iE "password|secret|token|connectionstring"`. If any appear, they must be replaced with environment variable references (e.g. `${POSTGRES_PASSWORD}`, `${JWT_SECRET}`) and the actual secret added to `.gitignore` before committing.

7. **Discover the project's automated checks** and run them — typically typecheck, then tests, then format. Fix anything the merge broke.

8. **Finish the merge/rebase.** Stage everything and commit. If rebasing, continue the rebase process until all commits are rebased.
