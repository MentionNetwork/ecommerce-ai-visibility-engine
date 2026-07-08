# Connector Integration — how platform apps plug into the engine

> **Status:** design spec. Complements [architecture.md](./architecture.md) and [audit-engine.md](./audit-engine.md).

A **connector** (e.g. the Shopify App's integration layer, the WooCommerce plugin) implements the `SiteConnector` contract from `@mention-network/connector-sdk` (Apache-2.0). The engine itself never imports a connector — it speaks **ports** (`ProductFactsPort`, `PageFetcherPort`) and emits platform-agnostic **`Prescription`s**. This spec defines the three pieces that make the two sides meet:

1. an **expanded `SiteConnector.read`** surface sized to what the audit rubric actually needs to read from a store platform;
2. a new **`@mention-network/connector-bridge`** package that adapts a connected `SiteConnector` into the engine's ports and enforces the safe write path;
3. the **integration model**: how a commercial platform app (like a Shopify App) grows into an official open connector.

## 0. Scope

**In scope:** connector-sdk `read` expansion + new shared shapes; the `connector-bridge` package (`productFactsFromConnector`, `pageFetcherFromConnector`, `prescriptionRunner`) with a `FakeConnector` test double; this design doc + `connectors/shopify/README` refresh.

**Out of scope (unchanged / deferred):** writing a real Shopify or WooCommerce connector (that arrives via the promotion path, §4); a network-backed default `PageFetcherPort` (separate follow-up); any change to the engine's pipelines or ports.

## 1. Why the read surface grows

The audit rubric scores criteria that need **platform data a public crawl cannot see reliably** — collection membership (internal linking), metafields (specs/attributes), shipping settings (free-shipping thresholds), recommendation blocks, and merchant-feed status. Today `SiteConnector.read` only offers `getSite / getPage / listProducts? / getStructuredData? / getMeta? / getSitemap?`, with `listProducts` returning `unknown[]`.

Two changes (both pre-1.0; no compatibility burden):

**a) `listProducts` returns real contracts.** `@mention-network/shared` already defines `Product`/`Variant`/`Offer` — the shared dictionary all three tracks (engine, OSS apps, platform apps) speak. Connectors now return those instead of `unknown`.

**b) New optional read methods, each mapped to rubric needs:**

```ts
// packages/connector-sdk/src/index.ts
read: {
  getSite(session): Promise<Record<string, unknown>>;
  getPage(session, urlOrId): Promise<PageSnapshot>;
  listProducts?(session): Promise<Product[]>;                       // was unknown[]
  getProduct?(session, productId): Promise<Product | null>;         // product-at-store scans + facts
  listCollections?(session, productId?): Promise<CollectionRef[]>;  // internal-linking: product ∈ collection?
  getMetafields?(session, productId): Promise<Record<string, string>>; // specs / attributes
  getShippingSettings?(session): Promise<ShippingSettings | null>;  // free-shipping threshold & regions
  getRelatedProducts?(session, productId): Promise<Product[] | null>; // recommendations block present?
  getMerchantFeedStatus?(session, productId?): Promise<MerchantFeedStatus | null>; // shopping-feed listing
  getStructuredData?(session, scope): Promise<unknown[]>;
  getMeta?(session, scope): Promise<unknown>;
  getSitemap?(session): Promise<unknown>;
}
```

`ReadCap` gains: `"collections" | "metafields" | "shipping_settings" | "recommendations" | "merchant_feed_status"` — a connector declares in its manifest which it supports, and consumers degrade when a capability is absent.

**New shared shapes** (in `@mention-network/shared`, since platform apps and the engine both consume them):

```ts
export interface CollectionRef { id: string; title: string; productCount?: number; }

export interface ShippingSettings {
  freeShipping: boolean;
  /** Order value at which shipping becomes free; absent when freeShipping covers all orders. */
  threshold?: Money;
  regions?: string[];
}

export interface MerchantFeedStatus {
  status: "approved" | "pending" | "disapproved" | "not_submitted";
  issues?: string[];
}
```

## 2. `@mention-network/connector-bridge` (new package, FSL)

The license/dependency seam is deliberate:

```
connector-sdk (Apache-2.0)  ◄── connector-bridge (FSL) ──►  engine ports (FSL)
   no engine imports               imports both                no connector imports
```

The engine stays pure ports; the sdk stays a freely-buildable contract; the bridge is the only place that knows both.

### 2.1 `productFactsFromConnector`

```ts
function productFactsFromConnector(connector: SiteConnector, session: Session): ProductFactsPort
```

Implements the engine's `ProductFactsPort.getFacts(product)`:
- `connector.read.getProduct` present → fetch by `product.id`; merge `getMetafields` (when present) into `attributes`; return `{ variants, attributes, offer }` with `offer.source: "connector"`.
- `getProduct` absent or the product not found → **fall back to the facts already on the passed `product`** (source unchanged). The bridge degrades; it never throws for a missing capability.

### 2.2 `pageFetcherFromConnector`

```ts
function pageFetcherFromConnector(connector: SiteConnector, session: Session, fallback?: PageFetcherPort): PageFetcherPort
```

Adapts audit fetching:
- `getRaw(url)` → `connector.read.getPage(session, url)` mapped `PageSnapshot → PageBundle` (parse JSON-LD blocks out of the HTML; `status` 200 on success). On connector error → delegate to `fallback` when provided, else rethrow (the audit's own `buildContext` already degrades).
- `getRobots(domain)` → connectors don't serve robots; delegate to `fallback`, else `null`.
- `getRendered` → present only when the fallback provides it.

### 2.3 `prescriptionRunner` — the safe write path

This is where a platform app plugs in for "treat". It wraps `connector.write` and **enforces the order the sdk documents but nothing currently enforces**: you cannot apply a plan that was never dry-run.

```ts
interface PrescriptionRunner {
  /** plan + dryRun in one step; returns the preview a UI shows the merchant. */
  preview(rx: Prescription): Promise<{ plan: ChangePlan; diff: Diff }>;
  /** applies a previously previewed plan; rejects a plan that was not previewed. */
  apply(plan: ChangePlan): Promise<ApplyResult>;
  rollback(applyId: string): Promise<void>;
}
function prescriptionRunner(connector: SiteConnector, session: Session): PrescriptionRunner
```

- Constructed only when `connector.write` exists; otherwise the factory throws (`read-only connector`).
- `preview` = `write.plan(rx)` then `write.dryRun(plan)`; the runner records the plan's `prescriptionId` as previewed.
- `apply(plan)` rejects (throws) unless that plan was previewed by this runner — dry-run-before-apply becomes a mechanical guarantee, not a convention.
- `rollback` passes through.

### 2.4 Testing

`FakeConnector` (in the bridge's tests): configurable read methods (present/absent, canned `Product`/`PageSnapshot` data, throwing modes) and a write half that records `plan/dryRun/apply/rollback` calls. All bridge behavior — capability fallbacks, PageSnapshot→PageBundle mapping, the apply-without-preview rejection — is covered by fixture-driven Vitest, no network.

## 3. How a platform app connects (runtime model)

Two phases, deliberately:

**Phase now — shared contracts.** A commercial platform app (e.g. the Shopify App) keeps its own backend but builds its platform-API layer as an **isolated connector module** implementing `SiteConnector`, and speaks `@mention-network/shared` types (`Product`, `Prescription`, `Criterion`…) end to end. Nothing forces it to embed the engine yet; the contract keeps the two codebases convergent instead of drifting.

**Phase converge — embed the audit engine first.** When the shared scoring framework unifies, the app backend embeds `@mention-network/engine`'s **audit pipeline** as a library (it is the largest area of duplicated logic), wiring it through `connector-bridge`:

```ts
const facts   = productFactsFromConnector(shopifyConnector, session);
const fetcher = pageFetcherFromConnector(shopifyConnector, session, httpFetcher);
const audit   = new AuditPipeline({ auditPacks, fetcher });
const report  = await audit.run(target);           // scorecard
// … engine turns gaps into Prescriptions …
const runner  = prescriptionRunner(shopifyConnector, session);
const { diff } = await runner.preview(rx);          // merchant reviews the diff
await runner.apply(plan);                           // only after preview
```

The visibility (sampling) pipeline can follow the same route later; audit goes first.

## 4. Promotion path for the Shopify connector

Unchanged from the existing plan, now with the contract sized for it: the Shopify App's isolated connector layer — once battle-tested in production — is promoted to the official open `mn-connector-shopify` and moves to its own repository. The read surface in §1 is the checklist of what that layer should expose from day one (Admin API: products, metafields, collections, shipping settings, recommendations; Merchant API: feed status) so promotion is a move, not a rewrite.

## 5. Read-surface ↔ rubric mapping

| Read capability | Feeds |
|---|---|
| `getProduct` / `listProducts` / `getMetafields` | product facts (price-rank, fact-checks), specifications criteria |
| `listCollections` / `getRelatedProducts` | internal-linking criterion (reachable / related-out) |
| `getShippingSettings` | shipping-competitiveness criterion |
| `getMerchantFeedStatus` | shopping-feed listing criterion |
| `getPage` (via `pageFetcherFromConnector`) | every page-scoped audit criterion (schema, readability, safety) |

## 6. File layout

```
packages/shared/src/index.ts        + CollectionRef, ShippingSettings, MerchantFeedStatus
packages/connector-sdk/src/index.ts   read expansion + ReadCap additions
packages/connector-bridge/            new package (FSL)
  ├── src/product-facts.ts            productFactsFromConnector
  ├── src/page-fetcher.ts             pageFetcherFromConnector
  ├── src/prescription-runner.ts      prescriptionRunner
  ├── src/index.ts                    exports
  └── test/                           FakeConnector + fixture tests
connectors/shopify/README.md          refresh: read-surface checklist + bridge usage
```
