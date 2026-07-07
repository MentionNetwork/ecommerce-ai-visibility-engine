import { describe, test, expect } from "vitest";
import type { AuditContext, Criterion, PageBundle } from "@mention-network/shared";
import { CHECK_RUNNERS, botBlocked } from "../../src/audit/runners.js";

function crit(over: Partial<Criterion> & { check: string }): Criterion {
  return {
    id: "c", label: { en: "c" }, group: "g", area: "on_store", weight: "critical",
    scope: "product_page", scoring: { "0": "", "50": "", "100": "" }, ...over,
  };
}
function page(over: Partial<PageBundle>): PageBundle {
  return { url: "https://x.com/p", rawHtml: "", jsonld: [], status: 200, fetchedAt: "t", ...over };
}
function ctx(over: Partial<AuditContext>): AuditContext {
  return {
    target: {
      store: { id: "s", domain: "x.com", displayName: "X" },
      product: { id: "p", title: "Glow Serum", category: "serum", url: "https://x.com/p", attributes: {}, variants: [], offer: { price: { amount: 28, currency: "USD" }, availability: "in_stock", source: "manual" } },
    },
    robots: null, productPage: null, storePages: {}, ...over,
  };
}
const run = (check: string, c: Partial<Criterion>, x: Partial<AuditContext>) =>
  CHECK_RUNNERS[check](crit({ check, ...c }), ctx(x));

describe("botBlocked", () => {
  test("blocks a bot disallowed in its own group", () => {
    expect(botBlocked("User-agent: GPTBot\nDisallow: /", "GPTBot")).toBe(true);
  });
  test("falls back to the * group", () => {
    expect(botBlocked("User-agent: *\nDisallow: /", "ClaudeBot")).toBe(true);
  });
  test("allows when the group has an empty Disallow", () => {
    expect(botBlocked("User-agent: *\nDisallow:", "GPTBot")).toBe(false);
  });
});

describe("robots_allows_bot", () => {
  test("100 when robots.txt is absent", () => {
    expect(run("robots_allows_bot", {}, { robots: null })).toMatchObject({ score: 100 });
  });
  test("0 when every AI bot is blocked by *", () => {
    expect(run("robots_allows_bot", {}, { robots: "User-agent: *\nDisallow: /" })).toMatchObject({ score: 0 });
  });
  test("50 when only some bots are blocked", () => {
    expect(run("robots_allows_bot", {}, { robots: "User-agent: GPTBot\nDisallow: /" })).toMatchObject({ score: 50 });
  });
});

describe("served_html_has_product_data", () => {
  test("100 when name and price are in raw HTML", () => {
    expect(run("served_html_has_product_data", {}, { productPage: page({ rawHtml: "<h1>Glow Serum</h1> $28" }) })).toMatchObject({ score: 100 });
  });
  test("0 when data only appears after render (JS trap)", () => {
    expect(run("served_html_has_product_data", {}, { productPage: page({ rawHtml: "<div id=app></div>", renderedHtml: "Glow Serum 28" }) })).toMatchObject({ score: 0 });
  });
  test("not_applicable with no product page", () => {
    expect(run("served_html_has_product_data", {}, { productPage: null })).toMatchObject({ status: "not_applicable" });
  });
});

describe("schema_present", () => {
  const productLd = { "@type": "Product", name: "Glow Serum", offers: { "@type": "Offer", price: 28 } };
  test("100 for Product + Offer", () => {
    expect(run("schema_present", {}, { productPage: page({ jsonld: [productLd] }) })).toMatchObject({ score: 100 });
  });
  test("50 for Product without Offer", () => {
    expect(run("schema_present", {}, { productPage: page({ jsonld: [{ "@type": "Product", name: "x" }] }) })).toMatchObject({ score: 50 });
  });
  test("0 with no Product schema", () => {
    expect(run("schema_present", {}, { productPage: page({ jsonld: [] }) })).toMatchObject({ score: 0 });
  });
  test("finds a Product inside @graph", () => {
    expect(run("schema_present", {}, { productPage: page({ jsonld: [{ "@graph": [productLd] }] }) })).toMatchObject({ score: 100 });
  });
});

describe("schema_enriched", () => {
  test("100 with 3+ enriched fields", () => {
    const ld = { "@type": "Product", brand: "CosRx", gtin13: "1", aggregateRating: { ratingValue: 4 } };
    expect(run("schema_enriched", {}, { productPage: page({ jsonld: [ld] }) })).toMatchObject({ score: 100 });
  });
  test("0 with a bare Product", () => {
    expect(run("schema_enriched", {}, { productPage: page({ jsonld: [{ "@type": "Product" }] }) })).toMatchObject({ score: 0 });
  });
});

describe("img_alt", () => {
  test("100 when all images have alt", () => {
    expect(run("img_alt", {}, { productPage: page({ rawHtml: '<img src=a alt="a"><img src=b alt="b">' }) })).toMatchObject({ score: 100 });
  });
  test("50 for partial alt coverage", () => {
    expect(run("img_alt", {}, { productPage: page({ rawHtml: '<img src=a alt="a"><img src=b>' }) })).toMatchObject({ score: 50 });
  });
  test("not_applicable with no images", () => {
    expect(run("img_alt", {}, { productPage: page({ rawHtml: "<p>no images</p>" }) })).toMatchObject({ status: "not_applicable" });
  });
});

describe("page_exists", () => {
  test("100 when the target store page was fetched OK", () => {
    expect(run("page_exists", { params: { page: "about" } }, { storePages: { about: page({ status: 200 }) } })).toMatchObject({ score: 100 });
  });
  test("0 when the target store page is missing", () => {
    expect(run("page_exists", { params: { page: "about" } }, { storePages: {} })).toMatchObject({ score: 0 });
  });
});

describe("llm_judge", () => {
  test("is pending in v1", () => {
    expect(run("llm_judge", {}, {})).toMatchObject({ status: "pending" });
  });
});
