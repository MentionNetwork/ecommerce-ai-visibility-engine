import { describe, test, expect } from "vitest";
import type { CollectionRef, ShippingSettings, MerchantFeedStatus } from "../src/index.js";

describe("connector shapes", () => {
  test("a CollectionRef identifies a collection", () => {
    const c: CollectionRef = { id: "gid://shopify/Collection/1", title: "Serums", productCount: 12 };
    expect(c.title).toBe("Serums");
  });

  test("ShippingSettings carries a free-shipping threshold", () => {
    const s: ShippingSettings = { freeShipping: true, threshold: { amount: 200, currency: "AED" }, regions: ["AE"] };
    expect(s.threshold?.amount).toBe(200);
  });

  test("MerchantFeedStatus reports listing state", () => {
    const m: MerchantFeedStatus = { status: "disapproved", issues: ["missing gtin"] };
    expect(m.status).toBe("disapproved");
  });
});
