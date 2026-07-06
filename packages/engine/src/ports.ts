/**
 * Engine ports — the three seams that let one pipeline run everywhere:
 * server (Postgres + BullMQ), desktop/CLI (SQLite + in-process), cloud (multi-tenant).
 * Implementations are injected; the engine imports none of them.
 */

import type { SampleRequest, SampleResult, EngineId, Offer, Variant, Product } from "@mention-network/shared";
import type { Scan, ScanCheckpoint, CommerceReport, Pack } from "./domain.js";

/**
 * Where packs come from — bundled YAML (desktop/CLI), the registry, or a DB
 * (server/cloud). The engine selects base+industry packs from this list;
 * the adapter just delivers them.
 */
export interface PackSourcePort {
  listPacks(): Promise<Pack[]>;
}

export interface StoragePort {
  saveScan(scan: Scan): Promise<void>;
  getScan(id: string): Promise<Scan | null>;
  saveCheckpoint(scanId: string, checkpoint: ScanCheckpoint): Promise<void>;
  latestCheckpoint(scanId: string): Promise<ScanCheckpoint | null>;
  saveReport(report: CommerceReport): Promise<void>;
  getReport(id: string): Promise<CommerceReport | null>;
}

export interface JobQueuePort {
  enqueue(jobType: string, payload: unknown, opts?: { delayMs?: number }): Promise<string>;
  process(jobType: string, handler: (payload: unknown) => Promise<void>): void;
}

export interface EngineCapability {
  engine: EngineId;
  backend: "api" | "browser";
  geos: string[];
  languages: string[];
}

export interface SamplingProviderPort {
  capabilities(): Promise<EngineCapability[]>;
  sample(req: SampleRequest): Promise<SampleResult>;
  estimate(reqs: SampleRequest[]): Promise<{ credits: number | null }>;
}

/** Optional — semantic question suggestion. Pipeline runs fine without it. */
export interface EmbeddingProviderPort {
  embed(texts: string[]): Promise<number[][]>;
}

/** Facts for MY store's product — connector (Shopify) → manual → scrape. Optional: BYOK can pass a manual Offer. */
export interface ProductFactsPort {
  getFacts(product: Product): Promise<{ variants: Variant[]; attributes: Record<string, string>; offer: Offer }>;
}

/** Facts for a competitor — scrape the AI-cited URL, or fall back to a Cloud pricing dataset. */
export interface CompetitorPricingPort {
  getOffer(input: { domain: string; citedUrl?: string }): Promise<Offer | null>;
}

/**
 * Lifecycle hooks — how a SaaS wraps the engine WITHOUT forking it
 * (credit checks, usage tracking, tenant limits). All optional.
 * A hook returning { proceed: false } vetoes the step with a typed reason.
 */
export interface EngineHooks {
  beforeScan?(scan: Scan): Promise<{ proceed: boolean; reason?: string }>;
  beforeSampleBatch?(scanId: string, batch: SampleRequest[]): Promise<{ proceed: boolean; reason?: string }>;
  afterReport?(report: CommerceReport): Promise<void>;
  onError?(scanId: string, step: string, error: unknown): Promise<void>;
}

export interface EngineContext {
  storage: StoragePort;
  queue: JobQueuePort;
  sampling: SamplingProviderPort;
  packs: PackSourcePort;
  embedding?: EmbeddingProviderPort;
  productFacts?: ProductFactsPort;
  competitorPricing?: CompetitorPricingPort;
  hooks?: EngineHooks;
  /** Multi-tenant marker for cloud; null for self-host/desktop. */
  tenantId?: string | null;
}
