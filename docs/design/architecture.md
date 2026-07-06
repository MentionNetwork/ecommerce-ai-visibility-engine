# Architecture — Ecommerce AI Visibility Engine

> **Status:** design reference for the engine core. Complements the package READMEs.

Shoppers increasingly ask AI assistants *"where do I buy the CosRx PDRN serum?"* or *"cheapest retinol serum with fast shipping to Dubai?"*, and the assistant names a handful of stores. This engine measures whether **your store** is one of them — for **your products**, in a given **location and language**, ranked against the **competing retailers** the AI recommends instead — and produces a report of what to fix.

**Design principle:** the engine is a **pure TypeScript library** driven by ports. It carries no adapters and no I/O of its own; a host injects storage, a job queue, a sampling provider, and (optionally) product-facts and competitor-pricing providers. The same pipeline therefore runs in a desktop app (SQLite, in-process queue), a self-host server (Postgres, BullMQ), or a multi-tenant cloud — one pipeline, many embeddings.

The pipeline is a resumable state machine: `plan → sample → detect → score → report`, checkpointing after each step so a scan survives a crash or app restart.

---

## 1. Atomic unit: Product-at-Store

A scan measures **one product sold by your store, in one location and language, against other retailers**. Store-level visibility is the roll-up of many product scans. This mirrors how a merchant thinks ("is my store showing up for this product?") and maps directly to a per-product report (see §6).

---

## 2. Domain model

```ts
// ── What gets scanned ────────────────────────────────────────
interface Store {
  id; domain;                        // kbeautyarabia.com
  displayName;                       // KBeauty Arabia
  platform?;                         // shopify | woocommerce | custom
}

interface Product {
  id; title;                         // CosRx PDRN Serum
  category;                          // "PDRN serum" → drives the competitor set + pack selection
  industry?;                         // selects an industry pack (e.g. "beauty")
  brand?;                            // manufacturer
  attributes: Record<string,string>; // { ingredient: "PDRN", skinType: "all", crueltyFree: "true" }
  variants: Variant[];               // [{ sku, label: "50ml", offer }, …]
  offer: Offer;                      // default offer (primary variant)
}

interface Variant { sku; label; attributes?: Record<string,string>; offer: Offer; }

interface Offer {
  price: Money;                      // { amount: 28, currency: "USD" }
  shipping?: { free: boolean; etaDays?: number; regions?: string[] };
  availability: "in_stock" | "out" | "preorder";
  /** Provenance = how much to trust this price: connector (exact) … ai_claimed (weak). */
  source: "connector" | "manual" | "scrape" | "dataset" | "ai_claimed";
}

// ── Scan context ─────────────────────────────────────────────
interface ScanTarget { product: Product; store: Store; geo?; language?; }

// ── Competitors (detected + resolved) ────────────────────────
interface Retailer {
  id; domain?; displayName;          // Amazon.ae / Namshi / …
  isMine: boolean;                   // "YOUR STORE" — a first-class flag
  resolvedVia: "domain" | "registry" | "fuzzy_name";
  citedUrl?: string;                 // the URL the AI cited → anchor for reading the competitor's price
  offer?: Offer;
}
```

`Offer.source` lets the engine weight how trustworthy each price is. `Retailer.isMine` makes "your store vs the field" a first-class concept rather than a report-time hack. Commerce facts (`price`, `shipping`, `variants`) feed scoring — they are not display-only.

---

## 3. Scoring model

```ts
interface CommerceReport {
  target: ScanTarget;
  visibilityScore: number;           // % of prompts where the store is mentioned, weighted by intent
  avgPosition: number | null;

  retailers: Array<Retailer & {
    shareOfVoice: number;            // % of AI mentions across the run
    aiCoverage: string;              // "3/4" chatbots mention them
    priceRank?: number;              // true price rank across the table (1 = cheapest)
    intentsWon: string[];
  }>;

  perIntent: Array<{
    intent: string;                  // where_to_buy | trust | cheapest | shipping | availability | …
    capability: IntentCapability;
    mine: { mentioned; rank; visibility };
    factGap?: string;                // e.g. "You are the cheapest at $28, but AI omits you for the cheapest-price question"
  }>;

  perEngine: Array<{ engine; mentioned; visibility; rank }>;

  factChecks: Array<{               // catch AI stating a WRONG fact about your store
    engine; claim; truth;
    kind: "price_wrong" | "stock_wrong" | "variant_wrong";
    severity;
  }>;
}
```

Because scoring understands real product facts, it can produce three things a mention-only tracker cannot:

1. **`priceRank`** — where you sit on price across the whole retailer table.
2. **`factGap`** — *"you're genuinely the cheapest, yet AI still skips you for the price question."* (Emitted only when every priced competitor cited for that intent is strictly more expensive than you.)
3. **`factChecks`** — *"AI is misquoting your price/stock."*

**Variants** do not auto-multiply prompts (that would explode cost, and AI rarely distinguishes "50ml" when answering "where to buy this serum"). A variant is scanned separately only when a pack asks for it (e.g. a makeup pack with a "shade matching" intent).

---

## 4. Intent taxonomy — three tiers

Every intent separates *what it asks* (prompts) from *how it's scored* (`capability`):

```ts
interface Intent {
  id; label; weight;
  capability: "price" | "shipping" | "availability" | "trust" | "presence";
  prompts: PromptTemplate[];
  tier: "core" | "pack" | "user";
}
```

| Tier | Defined by | Scoring |
|---|---|---|
| **Core (5)** | The engine's standard buying questions: `where_to_buy`, `trust`, `cheapest`, `shipping`, `availability` | native, per-capability; standardized so scores are comparable |
| **Pack** | An industry pack (e.g. beauty "shade match") | picks from the existing capabilities |
| **User** | A merchant's own buying questions | declare a `capability` to unlock deep scoring; otherwise scored at `presence` |

The 5 core intents are the fixed backbone; packs and users extend the taxonomy without changing the core. A user-authored intent runs at `presence` (mentioned / rank / share) unless it declares a capability that plugs into existing scoring logic — no new engine code required.

---

## 5. Ports

The engine defines these seams; a host supplies implementations.

| Port | Purpose |
|---|---|
| `SamplingProviderPort` | Ask an AI engine a prompt; returns a normalized `SampleResult`. Reports its own `capabilities()` (which engines, API vs browser backend). |
| `StoragePort` | Persist scans, checkpoints, reports. |
| `JobQueuePort` | Enqueue/process work (in-process for desktop, BullMQ for server). |
| `PackSourcePort` | Deliver packs (bundled YAML, a registry, or a DB). |
| `ProductFactsPort` | Read **your** product's facts — connector (e.g. Shopify API) → manual entry → scraping your own store. |
| `CompetitorPricingPort` | Read a **competitor's** offer. |
| `EngineHooks` | Optional lifecycle hooks (`beforeScan`, `beforeSampleBatch`, `afterReport`) so a host can gate or meter without forking the pipeline. |

**Competitor pricing uses the AI's own citation as the anchor:**

```
detect a retailer in the AI answer  →  take the URL it cited (citedUrl)
   →  read the price at that URL  →  Offer{ source: "scrape" }
   fallback: no citedUrl  →  ai_claimed (low-confidence)
```

Following the cited URL also sidesteps blind product matching across retailers — you read the exact page the AI pointed at. A `CompetitorPricingPort` implementation may scrape ad hoc or serve a hosted, continuously-refreshed dataset.

---

## 6. Report → PDF

`CommerceReport` maps directly to a two-page product report:

| Report section | Field |
|---|---|
| Visibility Score (e.g. 42%, avg #3, verdict) | `visibilityScore`, `avgPosition`, verdict from perIntent gaps |
| Market Position (retailers by share, price, shipping, YOUR STORE) | `retailers[]` |
| AI Chatbot Visibility (per chatbot) | `perEngine[]` |
| Search Intent (buying questions, win/lose) | `perIntent[]` |
| Takeaways | `perIntent[].factGap` + `factChecks[]` |

---

## 7. Extension points

- **Packs** — buying questions as pure YAML data. One base commerce pack (the 5 core intents) plus industry packs.
- **Connectors** — read/write access to a store platform (read product facts, run audits, apply fixes).
- **Engines** — the AI engine catalog is registry-delivered data, not an enum (see [engine-catalog.md](./engine-catalog.md)).
- **Providers** — sampling and competitor-pricing backends are swappable ports.

## 8. Open questions

- Retailer identity resolution beyond exact-domain matching (registry lookup, fuzzy names) when the AI does not cite a URL.
- Per-variant scanning ergonomics for packs that need it.
