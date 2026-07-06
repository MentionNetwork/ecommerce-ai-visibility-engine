import type {
  SampleRequest,
  SampleResult,
  CitationRef,
  ScanTarget,
  Offer,
  Product,
  CommerceReport,
} from "@mention-network/shared";
import type {
  StoragePort,
  JobQueuePort,
  SamplingProviderPort,
  PackSourcePort,
  ProductFactsPort,
  CompetitorPricingPort,
  EngineContext,
  EngineHooks,
} from "../src/ports.js";
import type { Scan, ScanCheckpoint, Pack } from "../src/domain.js";

export class InMemoryStorage implements StoragePort {
  scans = new Map<string, Scan>();
  checkpoints = new Map<string, ScanCheckpoint[]>();
  reports = new Map<string, CommerceReport>();
  async saveScan(scan: Scan) {
    this.scans.set(scan.id, structuredClone(scan));
  }
  async getScan(id: string) {
    const s = this.scans.get(id);
    return s ? structuredClone(s) : null;
  }
  async saveCheckpoint(scanId: string, cp: ScanCheckpoint) {
    const a = this.checkpoints.get(scanId) ?? [];
    a.push(cp);
    this.checkpoints.set(scanId, a);
  }
  async latestCheckpoint(scanId: string) {
    const a = this.checkpoints.get(scanId) ?? [];
    return a.at(-1) ?? null;
  }
  async saveReport(report: CommerceReport) {
    this.reports.set(report.id, structuredClone(report));
  }
  async getReport(id: string) {
    const r = this.reports.get(id);
    return r ? structuredClone(r) : null;
  }
}

export class NoopQueue implements JobQueuePort {
  async enqueue() {
    return "job";
  }
  process() {}
}

export class FakePackSource implements PackSourcePort {
  constructor(private readonly packs: Pack[]) {}
  async listPacks() {
    return this.packs;
  }
}

/** My store's product facts — in tests, just hands back a fixed offer. */
export class FakeProductFacts implements ProductFactsPort {
  constructor(private readonly offer: Offer) {}
  async getFacts(product: Product) {
    return { variants: product.variants, attributes: product.attributes, offer: this.offer };
  }
}

/** Competitor pricing lookup — in tests, a fixed map keyed by domain. */
export class FakeCompetitorPricing implements CompetitorPricingPort {
  constructor(private readonly prices: Map<string, Offer> = new Map()) {}
  async getOffer(input: { domain: string; citedUrl?: string }): Promise<Offer | null> {
    return this.prices.get(input.domain) ?? null;
  }
}

/** Responder decides what an engine "answers" for a given request. */
export type Responder = (
  req: SampleRequest,
) => { text: string; citations?: CitationRef[] };

export class FakeSampling implements SamplingProviderPort {
  calls: SampleRequest[] = [];
  private n = 0;
  constructor(
    private readonly engines: string[],
    private readonly responder: Responder = () => ({ text: "" }),
  ) {}
  async capabilities() {
    return this.engines.map((engine) => ({
      engine,
      backend: "api" as const,
      geos: ["us"],
      languages: ["en"],
    }));
  }
  async sample(req: SampleRequest): Promise<SampleResult> {
    this.calls.push(req);
    const r = this.responder(req);
    return {
      id: `${req.engine}:${this.n++}`,
      engine: req.engine,
      sampledAt: "2026-01-01T00:00:00.000Z",
      response: { text: r.text },
      citations: r.citations ?? [],
    };
  }
  async estimate(reqs: SampleRequest[]) {
    return { credits: reqs.length };
  }
}

export function makeCtx(opts: {
  engines: string[];
  packs: Pack[];
  responder?: Responder;
  hooks?: EngineHooks;
  productFacts?: ProductFactsPort;
  competitorPricing?: CompetitorPricingPort;
}): EngineContext & {
  storage: InMemoryStorage;
  sampling: FakeSampling;
} {
  return {
    storage: new InMemoryStorage(),
    queue: new NoopQueue(),
    sampling: new FakeSampling(opts.engines, opts.responder),
    packs: new FakePackSource(opts.packs),
    hooks: opts.hooks,
    productFacts: opts.productFacts,
    competitorPricing: opts.competitorPricing,
  };
}

// --- Pack fixtures -----------------------------------------------------------

export const ecommercePack: Pack = {
  id: "ecommerce",
  type: "base",
  label: { en: "Online store essentials" },
  intents: [
    {
      intent: "where-to-buy",
      label: { en: "Where to buy" },
      weight: 1.0,
      capability: "presence",
      funnel: "discovery",
      prompts: [
        { template: "Where to buy {product} in {city}", tags: { branded: false, geo: "city" } },
        { template: "Where can I buy {product} online", tags: { branded: false, geo: "none" } },
      ],
    },
    {
      intent: "trusted",
      label: { en: "Trusted stores" },
      weight: 0.8,
      capability: "trust",
      funnel: "consideration",
      prompts: [{ template: "Is {store} a trustworthy store", tags: { branded: true, geo: "none" } }],
    },
  ],
};

export const beautyPack: Pack = {
  id: "beauty",
  type: "industry",
  industry: "beauty",
  label: { en: "Beauty" },
  intents: [
    {
      intent: "authenticity",
      label: { en: "Authenticity" },
      weight: 1.0,
      capability: "trust",
      funnel: "decision",
      prompts: [{ template: "Does {store} sell authentic products", tags: { branded: true, geo: "none" } }],
    },
  ],
};

// --- Scan target fixture -----------------------------------------------------

const product: Product = {
  id: "p1",
  title: "Glow Serum",
  category: "serum",
  industry: "beauty",
  attributes: {},
  variants: [],
  offer: { price: { amount: 28, currency: "USD" }, availability: "in_stock", source: "connector" },
};

export const target: ScanTarget = {
  store: { id: "s1", domain: "glowbeauty.ae", displayName: "Glow Beauty", platform: "shopify" },
  product,
  geo: "Dubai",
  language: "en",
};
