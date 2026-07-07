import type { AuditPack, PageBundle } from "@mention-network/shared";

/** Fetch pages for the audit. Desktop/server/cloud supply different implementations. */
export interface PageFetcherPort {
  getRobots(domain: string): Promise<string | null>;
  getRaw(url: string): Promise<PageBundle>;
  /** Optional headless render. Absent → the served-vs-rendered check degrades to not_applicable. */
  getRendered?(url: string): Promise<string>;
}

/** Delivers audit-packs (data). Kept separate from the intent PackSourcePort. */
export interface AuditPackSource {
  listAuditPacks(): Promise<AuditPack[]>;
}
