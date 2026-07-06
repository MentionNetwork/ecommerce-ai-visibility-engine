import { describe, test, expect } from "vitest";
import type { SampleRequest } from "@mention-network/shared";
import { ScanPipeline } from "../src/pipeline.js";
import { makeCtx, ecommercePack, beautyPack, target, FakeProductFacts, FakeCompetitorPricing } from "./fakes.js";

describe("createScan", () => {
  test("selects base + matching industry pack and expands every prompt", async () => {
    const ctx = makeCtx({ engines: ["chatgpt", "claude"], packs: [ecommercePack, beautyPack] });
    const scan = await new ScanPipeline(ctx).createScan(target);

    // ecommerce: 2 + 1 = 3 prompts; beauty: 1 prompt => 4 total
    expect(scan.plan.packIds).toEqual(["ecommerce", "beauty"]);
    expect(scan.plan.prompts).toHaveLength(4);
    expect(scan.status).toBe("planned");

    // every template placeholder resolved
    for (const p of scan.plan.prompts) expect(p.text).not.toContain("{");

    const buy = scan.plan.prompts.find((p) => p.intent === "where-to-buy")!;
    expect(buy.packId).toBe("ecommerce");
    expect(buy.weight).toBe(1.0);
    expect(buy.engines).toEqual(["chatgpt", "claude"]);
    expect(buy.tags.intent).toBe("where-to-buy");

    // branded prompt mentions the store's name
    const trusted = scan.plan.prompts.find((p) => p.intent === "trusted")!;
    expect(trusted.text).toContain("Glow Beauty");
  });

  test("omits industry pack when the product has no industry", async () => {
    const ctx = makeCtx({ engines: ["chatgpt"], packs: [ecommercePack, beautyPack] });
    const t = { ...target, product: { ...target.product, industry: undefined } };
    const scan = await new ScanPipeline(ctx).createScan(t);
    expect(scan.plan.packIds).toEqual(["ecommerce"]);
    expect(scan.plan.prompts).toHaveLength(3);
  });

  test("persists the scan and a plan checkpoint", async () => {
    const ctx = makeCtx({ engines: ["chatgpt"], packs: [ecommercePack] });
    const scan = await new ScanPipeline(ctx).createScan(target);
    expect(await ctx.storage.getScan(scan.id)).toEqual(scan);
    expect(await ctx.storage.latestCheckpoint(scan.id)).toMatchObject({ step: "plan" });
  });

  test("honors hooks.beforeScan veto", async () => {
    const ctx = makeCtx({
      engines: ["chatgpt"],
      packs: [ecommercePack],
      hooks: { beforeScan: async () => ({ proceed: false, reason: "no credits" }) },
    });
    await expect(new ScanPipeline(ctx).createScan(target)).rejects.toThrow("no credits");
  });
});

describe("run — sampling", () => {
  test("samples every planned prompt on every engine", async () => {
    const ctx = makeCtx({ engines: ["chatgpt", "claude"], packs: [ecommercePack] });
    const pipeline = new ScanPipeline(ctx);
    const scan = await pipeline.createScan(target); // 3 prompts (base pack only)
    await pipeline.run(scan.id);

    expect(ctx.sampling.calls).toHaveLength(6); // 3 prompts × 2 engines
    expect(new Set(ctx.sampling.calls.map((c: SampleRequest) => c.engine))).toEqual(new Set(["chatgpt", "claude"]));
    expect(ctx.sampling.calls.every((c: SampleRequest) => c.prompt.length > 0)).toBe(true);
  });

  test("honors hooks.beforeSampleBatch veto before any sampling", async () => {
    const ctx = makeCtx({
      engines: ["chatgpt"],
      packs: [ecommercePack],
      hooks: { beforeSampleBatch: async () => ({ proceed: false, reason: "batch blocked" }) },
    });
    const pipeline = new ScanPipeline(ctx);
    const scan = await pipeline.createScan(target);
    await expect(pipeline.run(scan.id)).rejects.toThrow("batch blocked");
    expect(ctx.sampling.calls).toHaveLength(0);
  });

  test("throws when the scan does not exist", async () => {
    const ctx = makeCtx({ engines: ["chatgpt"], packs: [ecommercePack] });
    await expect(new ScanPipeline(ctx).run("missing")).rejects.toThrow(/not found/i);
  });
});

describe("run — report", () => {
  // chatgpt cites my store (domain, pos 1) on every prompt → 100% visible.
  // claude never cites me and surfaces competing retailers instead.
  const responder = (req: { engine: string; prompt: string }) => {
    if (req.engine === "chatgpt") {
      return {
        text: "Options.",
        citations: [{ position: 1, url: "https://glowbeauty.ae/p", domain: "glowbeauty.ae" }],
      };
    }
    if (req.prompt.includes("trustworthy")) return { text: "Yes, Glow Beauty is reliable." };
    return {
      text: "Try Noon or Amazon.",
      citations: [{ position: 1, url: "https://noon.com/p", domain: "noon.com" }],
    };
  };

  test("produces a CommerceReport with my store ranked among retailers", async () => {
    const ctx = makeCtx({ engines: ["chatgpt", "claude"], packs: [ecommercePack], responder });
    const pipeline = new ScanPipeline(ctx);
    const t = { ...target, product: { ...target.product, industry: undefined } };
    const scan = await pipeline.createScan(t);
    const report = await pipeline.run(scan.id);

    expect(report.perEngine.find((e) => e.engine === "chatgpt")).toMatchObject({ mentioned: true, rank: 1 });
    expect(report.retailers.some((r) => r.isMine)).toBe(true);
    expect(await ctx.storage.getReport(report.id)).toEqual(report);
  });

  test("wires ctx.productFacts and ctx.competitorPricing into myOffer/competitorOffers and priceRank", async () => {
    // Single answer cites both the store and a competitor (noon.com), so extractRetailers
    // sees both domains and the pipeline must look up an offer for each.
    const pricedResponder = () => ({
      text: "You can buy it from Glow Beauty or Noon.",
      citations: [
        { position: 1, url: "https://glowbeauty.ae/p", domain: "glowbeauty.ae" },
        { position: 2, url: "https://noon.com/p", domain: "noon.com" },
      ],
    });

    const ctx = makeCtx({
      engines: ["chatgpt"],
      packs: [ecommercePack],
      responder: pricedResponder,
      // Deliberately different from target.product.offer's $28 fallback, so the
      // assertion below only passes if myOffer really came from productFacts.
      productFacts: new FakeProductFacts({
        price: { amount: 25, currency: "USD" },
        availability: "in_stock",
        source: "connector",
      }),
      competitorPricing: new FakeCompetitorPricing(
        new Map([
          ["noon.com", { price: { amount: 32, currency: "USD" }, availability: "in_stock", source: "scrape" }],
        ]),
      ),
    });

    const pipeline = new ScanPipeline(ctx);
    const t = { ...target, product: { ...target.product, industry: undefined } };
    const scan = await pipeline.createScan(t);
    const report = await pipeline.run(scan.id);

    const mine = report.retailers.find((r) => r.domain === "glowbeauty.ae");
    const competitor = report.retailers.find((r) => r.domain === "noon.com");

    // myOffer came from productFacts ($25), not the fallback target.product.offer ($28).
    expect(mine?.offer?.price.amount).toBe(25);
    // competitor offer came from competitorPricing, keyed by the cited domain.
    expect(competitor?.offer?.price.amount).toBe(32);
    // Both priced retailers got ranked by price.
    expect(mine?.priceRank).toBe(1);
    expect(competitor?.priceRank).toBe(2);
  });

  test("calls afterReport hook", async () => {
    let hooked: string | null = null;
    const ctx = makeCtx({
      engines: ["chatgpt"],
      packs: [ecommercePack],
      responder,
      hooks: {
        afterReport: async (rep) => {
          hooked = rep.id;
        },
      },
    });
    const pipeline = new ScanPipeline(ctx);
    const scan = await pipeline.createScan(target);
    const report = await pipeline.run(scan.id);
    expect(hooked).toBe(report.id);
  });
});
