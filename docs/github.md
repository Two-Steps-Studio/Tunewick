# GitHub Workflow

Repository: https://github.com/Two-Steps-Studio/Tunewick

## Branches

- `main` — stable, always deployable. Production tracks `main`. No direct development.
- `work` — primary development branch. All features, fixes, refactors and experiments.

If `work` is temporarily broken, it is fixed on `work` before any merge to `main`.

## Flow

```
Guidon task → work → implement → test → build → lint/typecheck → PR (work → main) → review → merge → deploy → update Guidon
```

## Commits

Conventional, focused commits; reference the Guidon task where practical:

```
feat(player): add lossless quality selection
fix(auth): handle expired session correctly
```

## Pull requests (work → main)

Each PR describes: what changed, why, the Guidon task, testing performed, known limitations,
migration requirements and deployment considerations.

## Branch protection for `main`

Configured in GitHub → Settings → Branches (or Rules → Rulesets) by a repository admin.

| Rule | Setting |
| ---- | ------- |
| Require a pull request before merging | on |
| Required approvals | 1 (when a second reviewer exists; until then 0 with PR still required) |
| Require status checks to pass | on — required checks: `lint`, `typecheck`, `test`, `format:check`, `build + e2e` (workflow `.github/workflows/ci.yml`) |
| Require branch to be up to date before merging | on |
| Block force pushes | on |
| Restrict deletions | on |

**Current state:** CI workflow exists (M0.2). Branch protection must be enabled by a repository
admin (pending, Guidon task "P0: GitHub repository + main/work branches + main protection").
The repository is public, so branch protection and rulesets are available on the GitHub Free plan.

CI jobs are added by the tasks that introduce them (pgTAP in M0.3, audio worker tests in M3).

## Database changes

Only through version-controlled, reviewed and tested migrations. No undocumented manual
production changes.

## Secrets

Never committed. `.env.example` lists variable names only. Production secrets live in the
hosting provider's secret store.
