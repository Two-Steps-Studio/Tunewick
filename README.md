# Tunewick

**Discover more, listen better, connect deeper.**

Tunewick is a music streaming, discovery and community platform built around independent
artists, local music scenes, events and high-fidelity audio. Domain: tunewick.com.

> Status: **Phase 1 — Product audit & definition.** No application code yet.

## Branches

| Branch | Purpose |
| ------ | ------- |
| `main` | Stable, deployable version. Changes arrive only via reviewed pull requests from `work`. |
| `work` | Active development. All normal work happens here. |

See [docs/github.md](docs/github.md) for the workflow and branch-protection setup.

## Process

`PLAN → GUIDON → TASKS → IMPLEMENTATION (work) → TEST → REVIEW → MERGE (main) → DEPLOY → UPDATE GUIDON`

Guidon is the source of truth for tasks; GitHub is the source of truth for code.
No work starts without a Guidon task.

## Documentation

| Document | Contents |
| -------- | -------- |
| [product.md](docs/product.md) | Vision, differentiators, personas, MVP scope |
| [architecture.md](docs/architecture.md) | System architecture and modules |
| [database.md](docs/database.md) | Data model and migrations |
| [security.md](docs/security.md) | Auth, RBAC/RLS, threat model |
| [licensing.md](docs/licensing.md) | Content rights and takedown process |
| [audio.md](docs/audio.md) | Audio pipeline, quality tiers, playback |
| [promotions.md](docs/promotions.md) | Promo codes, campaigns, entitlements |
| [api.md](docs/api.md) | API reference |
| [recommendations.md](docs/recommendations.md) | Discovery and recommendation engine |
| [design-system.md](docs/design-system.md) | Brand, typography, color, motion |
| [roadmap.md](docs/roadmap.md) | Phases and milestones |
| [github.md](docs/github.md) | Branching, PRs, branch protection |

## Secrets

Never commit credentials. Use `.env.local` (git-ignored) based on `.env.example`.
