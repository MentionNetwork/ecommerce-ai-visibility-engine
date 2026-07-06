# Mention Network — Ecommerce AI Visibility Engine

> **See how AI sells your products.** An open-source engine that measures how visible your **store and products** are in AI answers (ChatGPT, Gemini, Claude, Google AI Mode…) — ranked against the **competing retailers** AI recommends instead — and tells you what to fix.

> ⚠️ **Status: early scaffold (pre-alpha).** Architecture is settled, implementation is in progress. Watch/star to follow along.

---

## What it is

An engine that answers one question: **when a shopper asks AI to recommend a product, is your store one of the answers?**

The atomic unit is a **product sold by your store, in one location and language, measured against the other retailers AI names**. Store-level visibility is the roll-up of many product checks. For each scan the engine:

1. **Plans the buying questions** — 5 universal commerce intents (*where to buy · trusted · cheapest · shipping · availability*) plus your industry pack's specific ones.
2. **Samples the AI engines** with those questions.
3. **Detects your store vs competing retailers** in the answers — who's mentioned, at what rank, with which cited URL.
4. **Scores with real commerce facts** — share of AI mentions, price rank, and fact-checks against your true price and stock.
5. **Reports** — a shareable visibility report plus a 2-page PDF (Market Position, per-engine, per-intent).

## Why it matters

Search is moving from *"ten blue links you rank in"* to *"one assistant that names a few stores."* A shopper asks *"where do I buy the CosRx PDRN serum in Dubai?"* and ChatGPT names three retailers. If you're not one of them, you never had a chance to compete — and you can't see it happening.

Generic "AI visibility" trackers stop at *"you were mentioned / you weren't."* Because this engine knows **real product facts** (your price, shipping, variants — via a connector or the competitor's cited page), it surfaces three things they can't:

- **Price rank** — where you actually sit on price across the whole retailer table, not just whether you appear.
- **Fact gaps** — *"you're genuinely the cheapest at \$28, yet AI omits you on the price question and recommends a \$32 store."*
- **Fact-checks** — *"ChatGPT tells shoppers you sell this for \$45 — it's \$28. You look overpriced."*

It's open-source and runs on your own keys, so the measurement — and your store's data — stays yours.

## When to use it

It's the right tool when you sell products online and want to know, and improve, how AI assistants recommend you:

- **Store owners** — check whether AI recommends or ignores your products, and get concrete fixes.
- **Agencies** — monitor and benchmark AI visibility across many client stores.
- **Developers / CI** — track visibility over time and fail a build when it drops below a threshold.
- **Builders** — embed the engine to add AI-visibility features to your own product.

It is **not** a generic web SEO rank tracker or a keyword tool. It measures **product and store visibility inside AI answers** for ecommerce — that focus is the point.

## How to get started

The software is free; the AI calls are not. **Bring your own OpenRouter key** (you pay providers directly), or plug in a `MENTION_CLOUD_API_KEY` for managed sampling, geo-located answers, engines that have no API, and continuously-refreshed competitor pricing. With no key it still runs fully on BYOK — nothing is crippled.

```bash
# Desktop (macOS): download, paste your store URL, get a report — zero setup.

# CLI / CI:
npx @mention-network/cli scan yourstore.com     # JSON output + threshold exit codes

# Library:
import { scan } from "@mention-network/engine"
```

**Extend it — everything that changes over time is data, not code:**

- **Packs** (`packages/packs/`) — the buying questions, as pure YAML. One base commerce pack (the 5 core intents) plus industry packs (`industries/beauty` → authenticity, ingredient safety…). Each intent declares a `capability` (price · shipping · availability · trust · presence) so the engine knows how to score it. Author your own from [pack-template](https://github.com/MentionNetwork/pack-template).
- **Connectors** (`connectors/`) — read/write access to your store for reading product facts, running audits, and applying fixes (Shopify, WooCommerce, Magento…). Build one from [connector-template](https://github.com/MentionNetwork/connector-template).
- **Engines** — the AI engine catalog is registry-delivered data. New LLMs land as config entries, not releases ([engine-catalog](./docs/design/engine-catalog.md)).
- **Providers** — sampling backends: `byok-openrouter` (free path) or `mention-cloud`.

Community packages: `mn-pack-*` and `mn-connector-*`, listed via the [registry](https://github.com/MentionNetwork/registry). See the [architecture doc](./docs/design/architecture.md) for the full design.

## Where it runs

One port-driven engine, embedded four ways:

| | For | Runtime |
|---|---|---|
| 🖥️ **Desktop app** (macOS) | Store owners | Download, paste your store URL, pick a product. SQLite, in-process — zero setup. |
| 🐳 **Self-host** | Teams | `docker compose up` — web UI + REST API on Postgres + BullMQ. |
| ⌨️ **CLI** | Developers / CI | `npx @mention-network/cli scan <url>` — JSON output, threshold exit codes. |
| 📦 **Library** | Builders | `import { scan } from "@mention-network/engine"`. |

The engine is a pure TypeScript library with no I/O of its own — a host injects storage, queue, and sampling. That's why the same pipeline runs on a laptop, a server, or a multi-tenant cloud, and why **your data lives wherever you run it**.

```
packages/
├── engine/            core pipeline + ports (storage · queue · sampling · product facts · competitor pricing)
├── shared/            commerce contracts: Store, Product, Offer, Retailer, Intent, Report, Prescription
├── packs/             pack schema (Apache-2.0) + base/ecommerce + industries/beauty
├── connector-sdk/     SiteConnector interface (Apache-2.0)
├── providers/         byok-openrouter · mention-cloud
├── storage-sqlite/    desktop/CLI storage
├── storage-postgres/  server storage
└── report-ui/         React report components (shared by web + desktop)
connectors/            official connectors (shopify · woocommerce)
apps/                  server · web · cli · desktop
```

## License

- **Engine & apps:** [FSL-1.1-ALv2](./LICENSE.md) — free to use, self-host, fork, and modify. You can't sell a competing product with it for 2 years; after that, each version automatically becomes Apache-2.0. We think that's fair.
- **`packages/packs/schema` & `packages/connector-sdk`:** Apache-2.0 — build on the formats freely, forever.

## Contributing

Easiest first contribution: a **pack for your industry** (pure YAML) or a **connector for your platform**. See [CONTRIBUTING.md](./CONTRIBUTING.md).
