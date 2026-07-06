# Contributing

Thanks for considering a contribution! Three ways in, easiest first:

## 1. Write a pack (no code required)

Packs are pure YAML — the questions shoppers ask AI about an industry. Start from [pack-template](https://github.com/MentionNetwork/pack-template), then submit your `mn-pack-<industry>` to the [registry](https://github.com/MentionNetwork/registry).

Naming: `id` kebab-case English singular; `label.en` required, other languages welcome.

## 2. Write a connector

Connectors give the engine read/write access to a platform (audit + apply fixes). Start from [connector-template](https://github.com/MentionNetwork/connector-template) — it ships a stubbed `SiteConnector`, a test harness, and CI. Publish as `mn-connector-<platform>` and submit to the registry.

Rules for `write` capability: declare capabilities in the manifest, implement `dryRun` and `rollback`, never touch credentials outside the local session.

## 3. Engine core

Open an RFC in [Discussions](../../discussions) before changing any contract (`connector-sdk`, pack schema, `engine` ports). Contract changes require 2 reviews (see CODEOWNERS).

## Legal

- `ecommerce-ai-visibility-engine` (FSL-1.1-ALv2 parts): contributions require signing our **CLA** (bot will prompt on your first PR).
- Apache-2.0 parts (`packs/schema`, `connector-sdk`) and external packs/connectors: **DCO** (`git commit -s`) is enough.

## Monorepo ground rules

- `connectors/*` may only import `@mention-network/connector-sdk` and `@mention-network/shared` (lint-enforced).
- Report UI components take props and render — no fetching, no billing awareness.
- Commit style: `type(scope): short description` — feat, fix, refactor, docs, test, chore, perf, style.
