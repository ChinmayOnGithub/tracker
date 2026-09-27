---
name: git-workflow
description: Use when creating branches, commits, pull requests, rebasing, resolving review feedback, verifying CI, or preparing changes for merge in Tracker.
license: "(MIT AND CC-BY-SA-4.0). See upstream repository for license details."
metadata:
  upstream: netresearch/git-workflow-skill
  source_revision: "09f4975979da3d1c6ba56dd1db9165cfd39ba5d0"
---

# Git Workflow Skill

## Rules

1. Never work directly on `main` for feature or fix work.
2. Use a dedicated branch with a clear name.
3. Keep commits focused and use Conventional Commits.
4. Review the diff before creating a pull request.
5. Verify the actual branch head and CI status before claiming success.
6. Never merge unless the user explicitly asks for the merge.
7. Prefer `--force-with-lease` over `--force` when history must be rewritten.
8. Do not describe unverified work as tested, working, or complete.

## Tracker workflow

```
main
  -> feature/fix branch
  -> focused commits
  -> targeted verification
  -> PR
  -> review
  -> CI/build verification
  -> explicit merge approval
```

For GitHub operations, use the repository's GitHub integration when available. Do not assume local shell scripts from the upstream skill exist in Tracker.

## Commit format

```
<type>[scope]: <description>
```

Use types such as `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.

## Verification

Report:
- exact branch
- exact commit(s)
- targeted tests
- typecheck/lint/build status when run
- PR state
- whether merge was explicitly requested

See `references/commit-conventions.md` for the detailed commit guidance.
