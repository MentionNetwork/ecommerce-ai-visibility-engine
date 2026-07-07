import { describe, test, expect } from "vitest";
import type { Criterion, ScanTarget } from "@mention-network/shared";
import { buildContext } from "../../src/audit/context.js";
import { FakePageFetcher } from "./fakes.js";

const target: ScanTarget = {
  store: { id: "s", domain: "glow.ae", displayName: "Glow" },
  product: { id: "p", title: "Serum", category: "serum", url: "https://glow.ae/serum", attributes: {}, variants: [], offer: { price: { amount: 28, currency: "USD" }, availability: "in_stock", source: "manual" } },
};
function crit(over: Partial<Criterion> & { check: string }): Criterion {
  return { id: "c", label: { en: "c" }, group: "g", area: "on_store", weight: "high", scope: "store", scoring: { "0": "", "50": "", "100": "" }, ...over };
}

describe("buildContext", () => {
  test("fetches robots, the product page, and store pages required by page_exists criteria", async () => {
    const fetcher = new FakePageFetcher("User-agent: *\nDisallow:", {
      "https://glow.ae/serum": { rawHtml: "<h1>Serum</h1>" },
      "https://glow.ae/about": { status: 200 },
    });
    const criteria = [
      crit({ id: "robots", check: "robots_allows_bot" }),
      crit({ id: "about", check: "page_exists", params: { page: "about" } }),
    ];
    const ctx = await buildContext(target, criteria, fetcher);
    expect(ctx.robots).toContain("User-agent");
    expect(ctx.productPage?.rawHtml).toContain("Serum");
    expect(ctx.storePages.about?.status).toBe(200);
    expect(fetcher.calls).toContain("raw:https://glow.ae/about");
  });

  test("null product page when the product has no url", async () => {
    const fetcher = new FakePageFetcher(null);
    const ctx = await buildContext({ ...target, product: { ...target.product, url: undefined } }, [], fetcher);
    expect(ctx.productPage).toBeNull();
  });
});
