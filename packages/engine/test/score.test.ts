import { describe, test, expect } from "vitest";
import type { Store, Offer } from "@mention-network/shared";
import { scoreUnits, type SampledUnit } from "../src/score.js";
import type { PlannedPrompt } from "../src/domain.js";

const store: Store = { id: "s1", domain: "glowbeauty.ae", displayName: "Glow Beauty" };
const myOffer: Offer = { price: { amount: 28, currency: "USD" }, availability: "in_stock", source: "connector" };

function prompt(intent: string, capability: PlannedPrompt["capability"], weight = 1): PlannedPrompt {
  return { intent, capability, packId: "ecommerce", text: `q ${intent}`, weight, engines: ["chatgpt"], tags: { intent } };
}
function unit(u: Partial<SampledUnit> & { engine?: string; intent?: string; capability?: PlannedPrompt["capability"] }): SampledUnit {
  const engine = u.engine ?? u.sample?.engine ?? "chatgpt";
  const sample = u.sample ?? { id: "x0", engine, sampledAt: "t", response: { text: "" }, citations: [] };
  return {
    prompt: u.prompt ?? prompt(u.intent ?? "where-to-buy", u.capability ?? "presence"),
    sample: { ...sample, engine } as any,
    mention: u.mention ?? null,
    retailers: u.retailers ?? [],
  };
}

describe("scoreUnits — retailers", () => {
  test("ranks retailers by share of AI mentions and flags my store", () => {
    const units: SampledUnit[] = [
      unit({ retailers: [{ domain: "noon.com", displayName: "Noon", isMine: false, citedUrl: "u", position: 1, sampleId: "a", engine: "chatgpt" }] }),
      unit({ retailers: [{ domain: "noon.com", displayName: "Noon", isMine: false, citedUrl: "u", position: 1, sampleId: "b", engine: "chatgpt" }] }),
      unit({ retailers: [{ domain: "glowbeauty.ae", displayName: "x", isMine: true, citedUrl: "u", position: 1, sampleId: "c", engine: "chatgpt" }] }),
    ];
    const { retailers } = scoreUnits(units, ["chatgpt"], store, { myOffer, competitorOffers: new Map() });
    expect(retailers[0]).toMatchObject({ domain: "noon.com", shareOfVoice: 67 });
    const mine = retailers.find((r) => r.isMine)!;
    expect(mine.displayName).toBe("Glow Beauty");
    expect(mine.shareOfVoice).toBe(33);
  });

  test("assigns priceRank from my offer + scraped competitor offers", () => {
    const competitorOffers = new Map<string, Offer>([
      ["noon.com", { price: { amount: 32, currency: "USD" }, availability: "in_stock", source: "scrape" }],
    ]);
    const units: SampledUnit[] = [
      unit({ retailers: [{ domain: "noon.com", displayName: "Noon", isMine: false, citedUrl: "u", position: 1, sampleId: "a", engine: "chatgpt" }] }),
      unit({ retailers: [{ domain: "glowbeauty.ae", displayName: "x", isMine: true, citedUrl: "u", position: 1, sampleId: "c", engine: "chatgpt" }] }),
    ];
    const { retailers } = scoreUnits(units, ["chatgpt"], store, { myOffer, competitorOffers });
    expect(retailers.find((r) => r.isMine)?.priceRank).toBe(1); // $28 < $32
    expect(retailers.find((r) => r.domain === "noon.com")?.priceRank).toBe(2);
  });
});

describe("scoreUnits — perIntent factGap", () => {
  test("flags when I am cheapest but not mentioned for the price intent", () => {
    const competitorOffers = new Map<string, Offer>([
      ["noon.com", { price: { amount: 32, currency: "USD" }, availability: "in_stock", source: "scrape" }],
    ]);
    const units: SampledUnit[] = [
      unit({ intent: "cheapest", capability: "price",
        mention: null,
        retailers: [{ domain: "noon.com", displayName: "Noon", isMine: false, citedUrl: "u", position: 1, sampleId: "a", engine: "chatgpt" }] }),
    ];
    const { perIntent } = scoreUnits(units, ["chatgpt"], store, { myOffer, competitorOffers });
    const cheapest = perIntent.find((i) => i.intent === "cheapest")!;
    expect(cheapest.mine.mentioned).toBe(false);
    expect(cheapest.factGap).toMatch(/cheapest/i);
  });

  test("does not flag factGap from a pricier retailer cited only under a different intent", () => {
    const competitorOffers = new Map<string, Offer>([
      ["noon.com", { price: { amount: 32, currency: "USD" }, availability: "in_stock", source: "scrape" }],
    ]);
    const units: SampledUnit[] = [
      // "cheapest" is a price-capability intent whose own cells cite NO retailers and never mention my store.
      unit({ intent: "cheapest", capability: "price", mention: null, retailers: [] }),
      // "shipping" is an unrelated intent that happens to cite a pricier competitor.
      unit({ intent: "shipping", capability: "presence",
        mention: null,
        retailers: [{ domain: "noon.com", displayName: "Noon", isMine: false, citedUrl: "u", position: 1, sampleId: "b", engine: "chatgpt" }] }),
    ];
    const { perIntent } = scoreUnits(units, ["chatgpt"], store, { myOffer, competitorOffers });
    const cheapest = perIntent.find((i) => i.intent === "cheapest")!;
    expect(cheapest.mine.mentioned).toBe(false);
    expect(cheapest.factGap).toBeUndefined();
  });

  test("does not claim cheapest when a cited competitor within the intent is actually cheaper than me", () => {
    const competitorOffers = new Map<string, Offer>([
      ["noon.com", { price: { amount: 32, currency: "USD" }, availability: "in_stock", source: "scrape" }],
      ["amazon.ae", { price: { amount: 20, currency: "USD" }, availability: "in_stock", source: "scrape" }],
    ]);
    const units: SampledUnit[] = [
      unit({ intent: "cheapest", capability: "price",
        mention: null,
        retailers: [
          { domain: "noon.com", displayName: "Noon", isMine: false, citedUrl: "u", position: 1, sampleId: "a", engine: "chatgpt" },
          { domain: "amazon.ae", displayName: "Amazon", isMine: false, citedUrl: "u", position: 2, sampleId: "a", engine: "chatgpt" },
        ] }),
    ];
    const { perIntent } = scoreUnits(units, ["chatgpt"], store, { myOffer, competitorOffers }); // my price is $28
    const cheapest = perIntent.find((i) => i.intent === "cheapest")!;
    expect(cheapest.mine.mentioned).toBe(false);
    expect(cheapest.factGap).toBeUndefined();
  });
});

describe("scoreUnits — factChecks", () => {
  test("catches an AI price claim that differs from my true price", () => {
    const units: SampledUnit[] = [
      unit({ engine: "chatgpt",
        mention: { sampleId: "c", engine: "chatgpt", matchType: "name" },
        sample: { id: "c", engine: "chatgpt", sampledAt: "t", response: { text: "Glow Beauty sells it for $45." }, citations: [] } as any }),
    ];
    const { factChecks } = scoreUnits(units, ["chatgpt"], store, { myOffer, competitorOffers: new Map() });
    expect(factChecks[0]).toMatchObject({ engine: "chatgpt", kind: "price_wrong" });
    expect(factChecks[0].truth).toContain("28");
  });

  test("does not false-positive on a non-USD store when AI quotes a converted USD price", () => {
    const aedOffer: Offer = { price: { amount: 100, currency: "AED" }, availability: "in_stock", source: "connector" };
    const units: SampledUnit[] = [
      unit({ engine: "chatgpt",
        mention: { sampleId: "c", engine: "chatgpt", matchType: "name" },
        sample: { id: "c", engine: "chatgpt", sampledAt: "t", response: { text: "Glow Beauty sells it for $27." }, citations: [] } as any }),
    ];
    const { factChecks } = scoreUnits(units, ["chatgpt"], store, { myOffer: aedOffer, competitorOffers: new Map() });
    expect(factChecks.find((f) => f.kind === "price_wrong")).toBeUndefined();
  });
});
