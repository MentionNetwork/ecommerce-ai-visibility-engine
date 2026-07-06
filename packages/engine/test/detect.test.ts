import { describe, test, expect } from "vitest";
import type { Store, SampleResult, CitationRef } from "@mention-network/shared";
import { detectStoreMention, extractRetailers } from "../src/detect.js";

const store: Store = { id: "s1", domain: "glowbeauty.ae", displayName: "Glow Beauty" };

function sample(over: Partial<SampleResult> & { text?: string; citations?: CitationRef[] }): SampleResult {
  return {
    id: over.id ?? "s1", engine: over.engine ?? "chatgpt", sampledAt: "2026-01-01T00:00:00.000Z",
    response: { text: over.text ?? "" }, citations: over.citations ?? [],
  };
}
function cite(domain: string, position = 1): CitationRef { return { position, url: `https://${domain}/x`, domain }; }

describe("detectStoreMention", () => {
  test("matches a cited store domain and carries position + citedUrl", () => {
    const m = detectStoreMention(store, sample({ citations: [cite("noon.com", 1), cite("www.glowbeauty.ae", 2)] }));
    expect(m).toMatchObject({ matchType: "domain", position: 2, citedUrl: "https://www.glowbeauty.ae/x" });
  });
  test("matches a subdomain of the store domain", () => {
    const m = detectStoreMention(store, sample({ citations: [cite("shop.glowbeauty.ae", 3)] }));
    expect(m?.matchType).toBe("domain");
  });
  test("falls back to a name match with no position", () => {
    const m = detectStoreMention(store, sample({ text: "I'd recommend Glow Beauty for that." }));
    expect(m).toMatchObject({ matchType: "name" });
    expect(m?.position).toBeUndefined();
  });
  test("returns null when neither domain nor name appears", () => {
    const m = detectStoreMention(store, sample({ text: "Try Noon or Amazon.", citations: [cite("noon.com")] }));
    expect(m).toBeNull();
  });
  test("prefers a domain citation over a name mention", () => {
    const m = detectStoreMention(store, sample({ text: "Glow Beauty is nice", citations: [cite("glowbeauty.ae", 1)] }));
    expect(m?.matchType).toBe("domain");
  });
});

describe("extractRetailers", () => {
  test("turns each cited domain into a retailer, flagging my store", () => {
    const rs = extractRetailers(store, sample({ citations: [cite("noon.com", 1), cite("glowbeauty.ae", 2), cite("amazon.ae", 3)] }));
    expect(rs.map((r) => r.domain)).toEqual(["noon.com", "glowbeauty.ae", "amazon.ae"]);
    expect(rs.find((r) => r.domain === "glowbeauty.ae")?.isMine).toBe(true);
    expect(rs.find((r) => r.domain === "noon.com")?.isMine).toBe(false);
    expect(rs[0]).toMatchObject({ displayName: "Noon", citedUrl: "https://noon.com/x", position: 1 });
  });
  test("dedupes repeated domains, keeping the best (lowest) position", () => {
    const rs = extractRetailers(store, sample({ citations: [cite("noon.com", 3), cite("noon.com", 1)] }));
    expect(rs).toHaveLength(1);
    expect(rs[0].position).toBe(1);
  });
});
