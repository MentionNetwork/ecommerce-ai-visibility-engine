# Audit Engine — on-store scoring against a criteria rubric

> **Status:** design spec (v1 scope). Complements [architecture.md](./architecture.md).

The engine already measures **AI-answer visibility** (does AI mention your store). This spec adds the second measurement engine: an **audit** that scores a store/product against a rubric of concrete criteria (robots access, schema, served-vs-rendered HTML, structural trust…), each scored `0 / 50 / 100 × weight`. It is the foundation of the product's **Scorecard** and, later, the **Action Plan**.

## 0. Scope

**In scope (v1):** the audit subsystem — a criteria rubric as data (audit-packs), a page-fetch port, deterministic check-runners, and an `AuditReport`. On-store criteria only, scored by deterministic HTTP+parse checks.

**Deferred to later specs (declared here, not built):**
- `llm_judge` check-runner for content-quality criteria (a no-op returning `pending` in v1).
- Off-store signals (Reddit/reviews/backlinks) and offer competitiveness (price/shipping) criteria.
- Prescription generation (turning gaps into a prioritized Action Plan).
- Unifying `AuditReport` + `CommerceReport` into one `StoreReport`.
- History / re-scan deltas.

The audit runs **parallel to** the existing scan pipeline and does not modify it.

## 1. Data model — audit-pack (a new pack format)

Criteria are **data**, delivered like intent-packs but in a distinct format (they are structurally different: an intent is a question asked to AI; a criterion is a check run against a store). Each criterion names a `check` that points to an engine check-runner — the same indirection the intent taxonomy uses with `capability`.

```yaml
# packages/packs/audit/on-store-access.yaml
id: on-store-access
type: audit                    # distinct from base/industry intent-packs
area: on_store                 # on_store | off_store | offer
version: 0.1.0
engineApi: ^0.1.0
label: { en: "AI access" }
criteria:
  - id: access.robots
    label: { en: "AI crawlers allowed" }
    group: access
    weight: critical           # critical ×3 | high ×2 | medium ×1
    scope: store               # store | product_page
    check: robots_allows_bot   # → engine check-runner id
    scoring:
      "0":   "AI crawlers blocked in robots.txt or at the edge"
      "50":  "Some AI crawlers allowed, some blocked"
      "100": "All major AI crawlers allowed"
```

Contracts added to `@mention-network/shared`:

```ts
export type CriterionWeight = "critical" | "high" | "medium";   // ×3 / ×2 / ×1
export type AuditArea       = "on_store" | "off_store" | "offer";
export type CriterionScope  = "store" | "product_page";

export interface Criterion {
  id: string;
  label: Record<string, string>;
  group: string;                 // "access" | "schema" | "trust" | "content" …
  area: AuditArea;
  weight: CriterionWeight;
  scope: CriterionScope;
  check: string;                 // → check-runner id in the engine
  params?: Record<string, string>;  // runner input, e.g. page_exists → { page: "about" }
  scoring: Record<"0" | "50" | "100", string>;
}

export interface AuditPack {
  id: string;
  type: "audit";
  area: AuditArea;
  version: string;
  engineApi: string;
  label: Record<string, string>;
  criteria: Criterion[];
}

/** Numeric weight for scoring. */
export const WEIGHT_FACTOR: Record<CriterionWeight, number> = { critical: 3, high: 2, medium: 1 };
```

Audit-packs are delivered through the existing `PackSourcePort` (filtered by `type: "audit"`). A JSON schema `packages/packs/audit/audit.schema.json` (Apache-2.0, sibling of `pack.schema.json`) validates them; the existing `validate.mjs` is extended to validate audit-packs too.

## 2. Engine architecture — fetch once, run runners

Audit **logic lives in the open engine** (it ships the deterministic check-runners); only page I/O is an injected port. This keeps the free tier able to audit a store with no proprietary data.

```ts
// ── Input port (new) — desktop/server/cloud fetch differently ──
export interface PageBundle {
  url: string;
  rawHtml: string;             // server-sent HTML (served-vs-rendered, alt, schema)
  renderedHtml?: string;       // post-JS; present only if the fetcher supports headless
  jsonld: unknown[];           // parsed JSON-LD blocks
  status: number;
  fetchedAt: string;
}

export interface PageFetcherPort {
  getRobots(domain: string): Promise<string | null>;
  getRaw(url: string): Promise<PageBundle>;         // engine ships a default (fetch + parse)
  getRendered?(url: string): Promise<string>;       // optional headless; absent → served-vs-rendered = not_applicable
}
```

Fetch once, build a context, run every runner against it (no per-runner network):

```ts
export interface AuditContext {
  target: ScanTarget;
  robots: string | null;
  productPage: PageBundle | null;
  storePages: Record<string, PageBundle>;   // homepage, about, policies… fetched per criteria scope
}

export type CheckResult =
  | { score: 0 | 50 | 100; evidence?: string }
  | { status: "pending" | "not_applicable"; evidence?: string };

export type CheckRunner = (criterion: Criterion, ctx: AuditContext) => Promise<CheckResult> | CheckResult;
```

The engine keeps a registry `check-id → CheckRunner`. A criterion whose `check` has no registered runner resolves to `status: "pending"` (this is how `llm_judge` behaves in v1).

**AuditPipeline** (in `packages/engine`, parallel to `ScanPipeline`):

```
1. loadAuditPacks   ← PackSourcePort, filter type "audit"
2. buildContext     ← PageFetcherPort: robots (from store.domain) + the product page (from target.product.url)
                      + the store pages the criteria require (page keys collected from criteria params, e.g.
                      about/contact/policy). Each URL fetched once and cached in AuditContext.
3. runChecks        ← per criterion: runner = REGISTRY[criterion.check];
                      result = await runner(criterion, ctx); unknown check → pending
4. score            ← group scores + overall weighted (SCORED criteria only)
5. AuditReport
```

Principles: runners are pure functions `(criterion, ctx) → CheckResult` (testable from fixture bundles, no network); missing `getRendered` degrades the served-vs-rendered check to `not_applicable` (never fails the whole audit); the open/paid seam is clean (deterministic runners ship open; `getRendered` headless and `llm_judge` plug in later).

## 3. AuditReport

```ts
export interface CriterionResult {
  criterionId: string;
  score: 0 | 50 | 100 | null;        // null when pending
  status: "scored" | "pending" | "not_applicable";
  weight: CriterionWeight;
  evidence?: string;                  // "robots.txt disallows GPTBot (line 4)"
}

export interface GroupScore { group: string; area: AuditArea; score: number; weightSum: number; }

export interface AuditReport {
  id: string;
  target: ScanTarget;
  overallScore: number;               // weighted 0–100 over SCORED criteria only
  scoredCount: number;
  pendingCount: number;
  groups: GroupScore[];
  criteria: CriterionResult[];
  generatedAt: string;
}
```

`overallScore = Σ(score × WEIGHT_FACTOR[weight]) / Σ(WEIGHT_FACTOR[weight])` over `scored` criteria only — `pending` and `not_applicable` do not drag the score down (honest: "scored 12 of 18 criteria"). `evidence` lets the report point at the exact problem.

## 4. v1 check-runners + shipped ruleset

Deterministic runners shipped in v1 (cover Access + Schema + structural Trust):

| check-id | Scores | Reads |
|---|---|---|
| `robots_allows_bot` | robots.txt allows GPTBot / ClaudeBot / Google-Extended / Applebot-Extended | `robots` |
| `served_html_has_product_data` | product name/price present in **rawHtml** (not JS-only) | `rawHtml` (+`renderedHtml` to compare when present) |
| `schema_present` | JSON-LD `Product` + `Offer` present | `jsonld` |
| `schema_enriched` | brand / GTIN / AggregateRating / FAQ / Review present | `jsonld` |
| `img_alt` | product images carry alt text | `rawHtml` |
| `page_exists` | About / Contact / Policy page reachable (target per criterion) | `storePages` |
| `llm_judge` | **no-op → `pending`** (implemented in a later spec) | — |

Ruleset shipped in `packages/packs/audit/` (v1):
- `on-store-access` — robots, served-vs-rendered, image alt.
- `on-store-schema` — Product/Offer, enriched fields, FAQ/Review.
- `on-store-trust` — About/contact/policy (structural).

Content-quality criteria (unique descriptions, buying guides, comparisons) are declared in the ruleset with `check: llm_judge` → they render as `pending` until a later spec implements the judge. Off-store and offer criteria are out of this spec.

## 5. Open / paid seam

- **Open (in the engine, v1):** the deterministic runners + the default fetch-based `PageFetcherPort` (raw HTML + robots). A BYOK user audits their own store locally, no proprietary data.
- **Injected later:** a headless-capable `getRendered` (server/cloud), the `llm_judge` runner (BYOK or Cloud), off-store signals, and offer scoring.

## 6. Testing (TDD)

- **Runners:** pure functions tested from fixture `PageBundle`/robots strings — each runner covers its `0 / 50 / 100` cases plus `not_applicable`. No network.
- **Pipeline:** `FakePageFetcher` (returns fixtures) + `FakePackSource` (audit-packs) → assert `AuditReport` (overallScore math, `scoredCount`/`pendingCount`, `llm_judge` → pending, group scores).
- **Ruleset:** AJV validation of every shipped audit-pack against `audit.schema.json` (extend `validate.mjs`).

## 7. File layout

```
packages/shared/src/index.ts          + Criterion, AuditPack, AuditArea, CriterionWeight/Scope, WEIGHT_FACTOR,
                                         PageBundle, AuditContext, CheckResult, CriterionResult, GroupScore, AuditReport
                                         + optional `url?: string` on Product (the product page the audit fetches)
packages/engine/src/audit/
  ├── ports.ts                        PageFetcherPort
  ├── context.ts                      buildContext(target, packs, fetcher)
  ├── runners.ts                      CHECK_RUNNERS registry + the v1 deterministic runners
  ├── score.ts                        group + overall weighting
  └── pipeline.ts                     AuditPipeline
packages/packs/audit/
  ├── audit.schema.json               Apache-2.0
  ├── on-store-access.yaml
  ├── on-store-schema.yaml
  └── on-store-trust.yaml
packages/packs/validate.mjs           extended to validate audit-packs
```

## 8. Deferred (later specs)

`llm_judge` content scoring · off-store signals (`OffStoreSignalsPort`) · offer competitiveness · Prescription generator + fixability resolver (Action Plan) · `StoreReport` unifying audit + visibility + surfaces · history / re-scan deltas.
