import type {
  Store, Offer, SampleResult, RetailerScore, PerEngineScore, PerIntentScore, FactCheck, CommerceReport,
} from "@mention-network/shared";
import type { PlannedPrompt, Mention, DetectedRetailer } from "./domain.js";

/** One prompt sampled on one engine, with its mention verdict and detected competing retailers. */
export interface SampledUnit {
  prompt: PlannedPrompt;
  sample: SampleResult;
  mention: Mention | null;
  retailers: DetectedRetailer[];
}

export type ScoreResult = Pick<
  CommerceReport,
  "visibilityScore" | "avgPosition" | "perEngine" | "perIntent" | "retailers" | "factChecks"
>;

export interface ScoreOpts {
  myOffer: Offer;
  competitorOffers: Map<string, Offer>;
}

function pct(hits: number, total: number): number {
  return total === 0 ? 0 : Math.round((hits / total) * 100);
}

/** Aggregate sampled units into report-level scores. Weights come from the packs. */
export function scoreUnits(units: SampledUnit[], engines: string[], store: Store, opts: ScoreOpts): ScoreResult {
  const perEngine = scorePerEngine(units, engines);
  const retailers = scoreRetailers(units, engines, store, opts);
  const perIntent = scorePerIntent(units, opts);

  const wSum = perIntent.reduce((s, i) => s + intentWeight(units, i.intent), 0);
  const visibilityScore =
    wSum === 0
      ? 0
      : Math.round(
          perIntent.reduce((s, i) => s + (i.mine.visibility ?? 0) * intentWeight(units, i.intent), 0) / wSum,
        );

  const positions = units
    .map((u) => u.mention?.position)
    .filter((p): p is number => typeof p === "number");
  const avgPosition = positions.length
    ? Math.round(positions.reduce((a, b) => a + b, 0) / positions.length)
    : null;

  const factChecks = checkFacts(units, store, opts);
  return { visibilityScore, avgPosition, perEngine, perIntent, retailers, factChecks };
}

function scorePerEngine(units: SampledUnit[], engines: string[]): PerEngineScore[] {
  const rows = engines.map((engine) => {
    const cells = units.filter((u) => u.sample.engine === engine);
    const hits = cells.filter((u) => u.mention).length;
    return { engine, mentioned: hits > 0, visibility: pct(hits, cells.length), rank: null as number | null };
  });

  rows
    .filter((r) => r.mentioned)
    .sort((a, b) => (b.visibility ?? 0) - (a.visibility ?? 0))
    .forEach((r, i) => (r.rank = i + 1));
  return rows;
}

function scoreRetailers(units: SampledUnit[], engines: string[], store: Store, opts: ScoreOpts): RetailerScore[] {
  const all = units.flatMap((u) => u.retailers);
  const totalMentions = all.length;

  const byDomain = new Map<string, DetectedRetailer[]>();
  for (const r of all) {
    const hits = byDomain.get(r.domain);
    if (hits) hits.push(r);
    else byDomain.set(r.domain, [r]);
  }

  const rows: RetailerScore[] = [...byDomain.entries()].map(([domain, hits]) => {
    const isMine = hits[0].isMine;
    const enginesHit = new Set(hits.map((h) => h.engine));
    const offer = isMine ? opts.myOffer : opts.competitorOffers.get(domain);
    // "Won" an intent by landing the top-cited slot in at least one sampled answer for it.
    const intentsWon = [
      ...new Set(
        units
          .filter((u) => u.retailers.some((r) => r.domain === domain && r.position === 1))
          .map((u) => u.prompt.intent),
      ),
    ];
    return {
      id: domain,
      domain,
      displayName: isMine ? store.displayName : hits[0].displayName,
      isMine,
      resolvedVia: "domain",
      citedUrl: hits[0].citedUrl,
      offer,
      shareOfVoice: pct(hits.length, totalMentions),
      aiCoverage: `${enginesHit.size}/${engines.length}`,
      intentsWon,
    };
  });

  const priced = rows.filter((r) => r.offer).sort((a, b) => a.offer!.price.amount - b.offer!.price.amount);
  priced.forEach((r, i) => (r.priceRank = i + 1));

  return rows.sort((a, b) => b.shareOfVoice - a.shareOfVoice);
}

function scorePerIntent(units: SampledUnit[], opts: ScoreOpts): PerIntentScore[] {
  const intents = [...new Set(units.map((u) => u.prompt.intent))];
  return intents.map((intent) => {
    const cells = units.filter((u) => u.prompt.intent === intent);
    const capability = cells[0].prompt.capability;
    const hitCells = cells.filter((u) => u.mention);
    const enginesHit = new Set(hitCells.map((u) => u.sample.engine));
    const mine = {
      mentioned: enginesHit.size > 0,
      rank: null as number | null,
      visibility: pct(hitCells.length, cells.length),
    };

    let factGap: string | undefined;
    if (capability === "price" && !mine.mentioned) {
      const myPrice = opts.myOffer.price.amount;
      // Scope to retailers actually cited within THIS intent's own units, not the whole report.
      const citedInIntent = cells.flatMap((u) => u.retailers);
      const pricedCompetitors = citedInIntent
        .filter((r) => !r.isMine)
        .map((r) => opts.competitorOffers.get(r.domain))
        .filter((offer): offer is Offer => offer != null);
      // Only claim "you are the cheapest" when I am genuinely the minimum among cited, priced competitors.
      const iAmCheapest = pricedCompetitors.length > 0 && pricedCompetitors.every((offer) => offer.price.amount > myPrice);
      if (iAmCheapest) {
        factGap = `You are the cheapest at ${money(opts.myOffer)}, but AI omits you for the cheapest-price question and recommends pricier retailers instead.`;
      }
    }
    return { intent, capability, mine, factGap };
  });
}

function checkFacts(units: SampledUnit[], store: Store, opts: ScoreOpts): FactCheck[] {
  const out: FactCheck[] = [];
  const truePrice = opts.myOffer.price.amount;
  for (const u of units) {
    if (!u.mention) continue;
    // A bare "$" price only maps to myOffer.price.amount when my store's own currency is USD.
    if (opts.myOffer.price.currency !== "USD") continue;
    const claimed = firstPrice(u.sample.response.text);
    if (claimed == null) continue;
    const delta = Math.abs(claimed - truePrice) / truePrice;
    if (delta > 0.1) {
      out.push({
        engine: u.sample.engine,
        claim: `${store.displayName} sells it for ${claimed}`,
        truth: `Actually ${money(opts.myOffer)} (${opts.myOffer.source})`,
        kind: "price_wrong",
        severity: delta > 0.3 ? "high" : "medium",
      });
    }
  }
  return out;
}

function money(o: Offer): string {
  return `${o.price.currency === "USD" ? "$" : ""}${o.price.amount}`;
}

function firstPrice(text: string): number | null {
  const m = text.match(/\$\s?(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function intentWeight(units: SampledUnit[], intent: string): number {
  return units.find((u) => u.prompt.intent === intent)?.prompt.weight ?? 0;
}
