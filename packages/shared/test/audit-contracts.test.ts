import { describe, test, expect } from "vitest";
import { WEIGHT_FACTOR } from "../src/index.js";
import type {
  Criterion, AuditPack, AuditContext, CheckResult, CriterionResult, AuditReport, Product,
} from "../src/index.js";

describe("audit contracts", () => {
  test("WEIGHT_FACTOR maps the three weights", () => {
    expect(WEIGHT_FACTOR).toEqual({ critical: 3, high: 2, medium: 1 });
  });

  test("a Criterion declares a check, weight, scope and 0/50/100 copy", () => {
    const c: Criterion = {
      id: "access.robots", label: { en: "AI crawlers allowed" }, group: "access", area: "on_store",
      weight: "critical", scope: "store", check: "robots_allows_bot",
      scoring: { "0": "blocked", "50": "partial", "100": "allowed" },
    };
    expect(c.check).toBe("robots_allows_bot");
  });

  test("an AuditPack carries criteria", () => {
    const p: AuditPack = {
      id: "on-store-access", type: "audit", area: "on_store", version: "0.1.0", engineApi: "^0.1.0",
      label: { en: "AI access" }, criteria: [],
    };
    expect(p.type).toBe("audit");
  });

  test("a CheckResult is either a score or a status", () => {
    const scored: CheckResult = { score: 100, evidence: "ok" };
    const pending: CheckResult = { status: "pending" };
    expect("score" in scored).toBe(true);
    expect("status" in pending).toBe(true);
  });

  test("an AuditReport rolls up scored criteria", () => {
    const r: AuditReport = {
      id: "a1", target: {
        store: { id: "s", domain: "x.com", displayName: "X" },
        product: { id: "p", title: "T", category: "c", url: "https://x.com/p", attributes: {}, variants: [], offer: { price: { amount: 1, currency: "USD" }, availability: "in_stock", source: "manual" } },
      },
      overallScore: 67, scoredCount: 2, pendingCount: 1, groups: [], criteria: [], generatedAt: "t",
    };
    expect(r.overallScore).toBe(67);
    const prod: Product = r.target.product;
    expect(prod.url).toBe("https://x.com/p");
  });
});
