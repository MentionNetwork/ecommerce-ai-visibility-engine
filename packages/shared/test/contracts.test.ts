import { describe, test, expect } from "vitest";
import type {
  Store, Product, Offer, ScanTarget, Retailer, CommerceReport, IntentCapability,
} from "../src/index.js";
import { PACK_SCHEMA_VERSION } from "../src/index.js";

describe("commerce contracts", () => {
  test("a ScanTarget composes Store + Product + Offer", () => {
    const offer: Offer = { price: { amount: 28, currency: "USD" }, availability: "in_stock", source: "connector" };
    const store: Store = { id: "s1", domain: "kbeautyarabia.com", displayName: "KBeauty Arabia", platform: "shopify" };
    const product: Product = {
      id: "p1", title: "CosRx PDRN Serum", category: "PDRN serum",
      attributes: { ingredient: "PDRN" }, variants: [{ sku: "50ml", label: "50ml", offer }], offer,
    };
    const target: ScanTarget = { product, store, geo: "Dubai", language: "en" };
    expect(target.store.domain).toBe("kbeautyarabia.com");
    expect(target.product.offer.source).toBe("connector");
  });

  test("a Retailer can carry a scraped competitor offer and isMine flag", () => {
    const r: Retailer = {
      id: "amazon-ae", domain: "amazon.ae", displayName: "Amazon.ae", isMine: false,
      resolvedVia: "domain", citedUrl: "https://amazon.ae/x",
      offer: { price: { amount: 32, currency: "USD" }, availability: "in_stock", source: "scrape" },
    };
    expect(r.isMine).toBe(false);
    expect(r.offer?.source).toBe("scrape");
  });

  test("PACK_SCHEMA_VERSION is bumped to 0.2.0", () => {
    expect(PACK_SCHEMA_VERSION).toBe("0.2.0");
    const caps: IntentCapability[] = ["price", "shipping", "availability", "trust", "presence"];
    expect(caps).toHaveLength(5);
  });

  test("CommerceReport holds retailers, perIntent, factChecks", () => {
    const report: CommerceReport = {
      id: "r1", scanId: "scan1",
      target: {
        store: { id: "s1", domain: "kbeautyarabia.com", displayName: "KBeauty Arabia" },
        product: { id: "p1", title: "X", category: "c", attributes: {}, variants: [], offer: { price: { amount: 1, currency: "USD" }, availability: "in_stock", source: "manual" } },
      },
      visibilityScore: 42, avgPosition: 3,
      retailers: [], perEngine: [], perIntent: [], factChecks: [], samples: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(report.visibilityScore).toBe(42);
  });
});
