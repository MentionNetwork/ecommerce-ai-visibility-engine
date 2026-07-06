/**
 * @mention-network/shared — cross-package contracts.
 * Versioned carefully: engine, connectors, apps, and Mention Cloud all speak these types.
 */

export const ENGINE_API_VERSION = "0.1.0";
export const PACK_SCHEMA_VERSION = "0.2.0";
export const PRESCRIPTION_SCHEMA_VERSION = "0.1.0";

/** AI engines are catalog data — never an enum. */
export type EngineId = string;

export interface SampleRequest {
  engine: EngineId;
  prompt: string;
  geo?: string | null;
  language?: string;
  options?: {
    webSearch?: boolean;
    model?: string | null;
  };
  freshness?: "live" | "1h" | "24h" | "7d";
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export interface CitationRef {
  position: number;
  url: string;
  domain: string;
  title?: string;
}

/** Normalized answer from any AI engine — same shape for API and browser backends. */
export interface SampleResult {
  id: string;
  engine: EngineId;
  engineModel?: string;
  adapterVersion?: string;
  geo?: string | null;
  language?: string;
  sampledAt: string;
  response: { text: string };
  citations: CitationRef[];
  searchUsed?: boolean;
  cache?: { hit: boolean; ageSeconds?: number };
  creditsCharged?: number;
}

/** Tags attached to every prompt inside a pack — feed report filters and Search Intent. */
export interface PromptTags {
  intent: string;
  funnel?: "discovery" | "consideration" | "decision";
  branded?: boolean;
  geo?: "none" | "city" | "country";
  language?: string;
}

// ── Commerce facts ───────────────────────────────────────────
export interface Money { amount: number; currency: string; }
export type OfferSource = "connector" | "manual" | "scrape" | "dataset" | "ai_claimed";
export type Availability = "in_stock" | "out" | "preorder";

export interface Offer {
  price: Money;
  shipping?: { free: boolean; etaDays?: number; regions?: string[] };
  availability: Availability;
  /** Provenance = how much to trust this price. connector 100% … ai_claimed ~40%. */
  source: OfferSource;
}

export interface Variant {
  sku: string;
  label: string;
  attributes?: Record<string, string>;
  offer: Offer;
}

// ── What gets scanned ────────────────────────────────────────
export type StorePlatform = "shopify" | "woocommerce" | "custom";

export interface Store {
  id: string;
  domain: string;
  displayName: string;
  platform?: StorePlatform;
}

export interface Product {
  id: string;
  title: string;
  category: string;
  /** Industry key used to select an industry pack (e.g. "beauty"); undefined → base commerce pack only. */
  industry?: string;
  brand?: string;
  attributes: Record<string, string>;
  variants: Variant[];
  offer: Offer;
}

export interface ScanTarget {
  product: Product;
  store: Store;
  geo?: string;
  language?: string;
}

// ── Competitors ──────────────────────────────────────────────
export type RetailerResolution = "domain" | "registry" | "fuzzy_name";

export interface Retailer {
  id: string;
  domain?: string;
  displayName: string;
  isMine: boolean;
  resolvedVia: RetailerResolution;
  citedUrl?: string;
  offer?: Offer;
}

// ── Intent capability (scoring logic selector) ───────────────
export type IntentCapability = "price" | "shipping" | "availability" | "trust" | "presence";
export type IntentTier = "core" | "pack" | "user";

// ── Report ───────────────────────────────────────────────────
export interface PerEngineScore { engine: EngineId; mentioned: boolean; visibility: number | null; rank: number | null; }

export interface RetailerScore extends Retailer {
  shareOfVoice: number;
  aiCoverage: string;
  priceRank?: number;
  intentsWon: string[];
}

export interface PerIntentScore {
  intent: string;
  capability: IntentCapability;
  mine: { mentioned: boolean; rank: number | null; visibility: number | null };
  factGap?: string;
}

export interface FactCheck {
  engine: EngineId;
  claim: string;
  truth: string;
  kind: "price_wrong" | "stock_wrong" | "variant_wrong";
  severity: "low" | "medium" | "high";
}

export interface CommerceReport {
  id: string;
  scanId: string;
  target: ScanTarget;
  visibilityScore: number;
  avgPosition: number | null;
  retailers: RetailerScore[];
  perEngine: PerEngineScore[];
  perIntent: PerIntentScore[];
  factChecks: FactCheck[];
  samples: SampleResult[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Prescription — the platform-agnostic remedy applied by connectors.
// Action types are namespaced strings; connectors declare which they support.
// ---------------------------------------------------------------------------

export interface PrescriptionAction {
  /** e.g. "schema_org.upsert" | "meta.update" | "content.publish" | "listing.update_title" */
  type: string;
  target: string;
  payload: unknown;
}

export interface Prescription {
  id: string;
  schemaVersion: typeof PRESCRIPTION_SCHEMA_VERSION;
  target: { storeId: string; productId: string };
  actions: PrescriptionAction[];
  createdAt: string;
}
