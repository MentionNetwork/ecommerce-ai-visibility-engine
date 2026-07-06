import { describe, test, expect } from "vitest";
import type { Pack, PackIntent, Scan, DetectedRetailer } from "../src/domain.js";
import type { ScanTarget } from "@mention-network/shared";

describe("engine domain", () => {
  test("a PackIntent declares a scoring capability", () => {
    const intent: PackIntent = {
      intent: "cheapest", label: { en: "Cheapest" }, weight: 0.8, capability: "price",
      funnel: "decision", prompts: [{ template: "Cheapest {product}", tags: { branded: false, geo: "none" } }],
    };
    expect(intent.capability).toBe("price");
  });

  test("a Scan carries a commerce ScanTarget", () => {
    const target: ScanTarget = {
      store: { id: "s1", domain: "kbeautyarabia.com", displayName: "KBeauty Arabia" },
      product: { id: "p1", title: "X", category: "c", attributes: {}, variants: [], offer: { price: { amount: 1, currency: "USD" }, availability: "in_stock", source: "manual" } },
      geo: "Dubai", language: "en",
    };
    const scan: Scan = { id: "1", target, plan: { prompts: [], packIds: [] }, status: "planned", createdAt: "t" };
    expect(scan.target.store.domain).toBe("kbeautyarabia.com");
  });

  test("a DetectedRetailer records the AI-cited URL", () => {
    const dr: DetectedRetailer = {
      domain: "amazon.ae", displayName: "Amazon.ae", isMine: false,
      citedUrl: "https://amazon.ae/x", position: 1, sampleId: "s1", engine: "chatgpt",
    };
    expect(dr.citedUrl).toContain("amazon.ae");
  });
});
