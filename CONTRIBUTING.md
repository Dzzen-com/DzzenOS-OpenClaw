# Contributing

We welcome issues and pull requests. Please follow the guidelines below.

For **questions** and **open-ended ideas** (not bugs or concrete feature requests), use [Discussions](https://github.com/Dzzen-com/DzzenOS-OpenClaw/discussions).

## Language and principles

- Use **English** for issues, PRs, and docs in this repo.
- Keep the core **local-first** and **privacy-friendly**.
- External actions (posting, sending emails) must be **gated by approvals**.

## How to contribute

### Reporting bugs

Use the [Bug report](.github/ISSUE_TEMPLATE/bug_report.md) template and include steps to reproduce, environment, and logs (redact secrets).

### Suggesting features

Use the [Feature request](.github/ISSUE_TEMPLATE/feature_request.md) template: problem, proposed solution, alternatives.

### Pull requests

Open a PR against `main`. The [pull request template](.github/PULL_REQUEST_TEMPLATE.md) will be applied — fill in What / Why / How and the checklist.

## Dev setup

- **Clone and install:** see [README — Install](README.md#install) and [docs/INSTALL.md](docs/INSTALL.md).
- **Monorepo:** from repo root we use `pnpm` (see root [package.json](package.json)).
- **UI (local):** `pnpm run dev:ui` (or `pnpm -C apps/ui dev`). See [apps/ui/README.md](apps/ui/README.md).
- **API (local):** `pnpm run dzzenos:api`.
- **Lint:** `pnpm run lint`.

## Code of conduct

Be respectful, assume good intent, and keep discussions constructive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
