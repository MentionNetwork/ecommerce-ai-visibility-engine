import { randomUUID } from "node:crypto";
import type { ScanTarget, SampleRequest, Offer } from "@mention-network/shared";
import type { EngineContext } from "./ports.js";
import type { Scan, ScanPlan, PlannedPrompt, Pack, CommerceReport } from "./domain.js";
import { detectStoreMention, extractRetailers } from "./detect.js";
import { scoreUnits, type SampledUnit } from "./score.js";

/**
 * Scan pipeline — a resumable state machine:
 *   plan → sample → detect → score → report
 * Every step checkpoints through StoragePort, so desktop can quit mid-scan
 * and resume, and server workers can retry safely.
 *
 * SaaS wrapping happens ONLY via ctx.hooks (credit checks, usage tracking) —
 * never by forking this pipeline.
 */
export class ScanPipeline {
  constructor(private readonly ctx: EngineContext) {}

  async createScan(target: ScanTarget): Promise<Scan> {
    const packs = selectPacks(await this.ctx.packs.listPacks(), target);
    const engines = (await this.ctx.sampling.capabilities()).map((c) => c.engine);
    const plan = buildPlan(packs, target, engines);

    const scan: Scan = {
      id: randomUUID(),
      target,
      plan,
      status: "planned",
      createdAt: nowIso(),
      tenantId: this.ctx.tenantId ?? null,
    };

    const veto = await this.ctx.hooks?.beforeScan?.(scan);
    if (veto && !veto.proceed) throw new Error(veto.reason ?? "scan vetoed");

    await this.ctx.storage.saveScan(scan);
    await this.ctx.storage.saveCheckpoint(scan.id, {
      step: "plan",
      completedUnits: plan.packIds,
      updatedAt: nowIso(),
    });
    return scan;
  }

  async run(scanId: string): Promise<CommerceReport> {
    const scan = await this.ctx.storage.getScan(scanId);
    if (!scan) throw new Error(`scan not found: ${scanId}`);
    const store = scan.target.store;

    // SAMPLE
    const units = await this.sample(scan);
    await this.ctx.storage.saveCheckpoint(scanId, {
      step: "sample",
      completedUnits: units.map((u) => u.sample.id),
      updatedAt: nowIso(),
    });

    // DETECT
    for (const u of units) {
      u.mention = detectStoreMention(store, u.sample);
      u.retailers = extractRetailers(store, u.sample);
    }
    await this.ctx.storage.saveCheckpoint(scanId, {
      step: "detect",
      completedUnits: units.filter((u) => u.mention).map((u) => u.sample.id),
      updatedAt: nowIso(),
    });

    // SCORE
    const myOffer = await this.myOffer(scan);
    const competitorOffers = await this.competitorOffers(units);
    const engines = [...new Set(scan.plan.prompts.flatMap((p) => p.engines))];
    const scored = scoreUnits(units, engines, store, { myOffer, competitorOffers });
    await this.ctx.storage.saveCheckpoint(scanId, { step: "score", completedUnits: [], updatedAt: nowIso() });

    // REPORT
    const report: CommerceReport = {
      id: randomUUID(),
      scanId,
      target: scan.target,
      ...scored,
      samples: units.map((u) => u.sample),
      generatedAt: nowIso(),
    };
    await this.ctx.storage.saveCheckpoint(scanId, { step: "report", completedUnits: [report.id], updatedAt: nowIso() });

    await this.ctx.hooks?.afterReport?.(report);
    await this.ctx.storage.saveReport(report);
    return report;
  }

  /** My store's true offer — connector/manual facts win, else the target's own product offer. */
  private async myOffer(scan: Scan): Promise<Offer> {
    if (this.ctx.productFacts) return (await this.ctx.productFacts.getFacts(scan.target.product)).offer;
    return scan.target.product.offer;
  }

  /** Competitor offers, one lookup per cited domain (never mine), keyed by domain for scoring. */
  private async competitorOffers(units: SampledUnit[]): Promise<Map<string, Offer>> {
    const map = new Map<string, Offer>();
    if (!this.ctx.competitorPricing) return map;

    const seen = new Map<string, string>(); // domain -> citedUrl
    for (const u of units) {
      for (const r of u.retailers) {
        if (!r.isMine && !seen.has(r.domain)) seen.set(r.domain, r.citedUrl);
      }
    }
    for (const [domain, citedUrl] of seen) {
      const offer = await this.ctx.competitorPricing.getOffer({ domain, citedUrl });
      if (offer) map.set(domain, offer);
    }
    return map;
  }

  /** SAMPLE — one request per prompt×engine, batched per engine so a hook can veto a whole engine. */
  private async sample(scan: Scan): Promise<SampledUnit[]> {
    const { prompts } = scan.plan;
    const engines = [...new Set(prompts.flatMap((p) => p.engines))];
    const out: SampledUnit[] = [];

    for (const engine of engines) {
      const enginePrompts = prompts.filter((p) => p.engines.includes(engine));
      const batch: SampleRequest[] = enginePrompts.map((p, i) => ({
        engine,
        prompt: p.text,
        geo: scan.target.geo ?? null,
        language: scan.target.language,
        idempotencyKey: `${scan.id}:${engine}:${i}`,
        metadata: { intent: p.intent, packId: p.packId },
      }));

      const veto = await this.ctx.hooks?.beforeSampleBatch?.(scan.id, batch);
      if (veto && !veto.proceed) throw new Error(veto.reason ?? "sample batch vetoed");

      for (let i = 0; i < batch.length; i++) {
        out.push({
          prompt: enginePrompts[i],
          sample: await this.ctx.sampling.sample(batch[i]),
          mention: null,
          retailers: [],
        });
      }
    }
    return out;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Base commerce pack always, followed by any industry pack matching
 * target.product.industry. Order is stable: base first, then industry.
 */
export function selectPacks(all: Pack[], target: ScanTarget): Pack[] {
  const base = all.filter((p) => p.type === "base");
  const industryKey = target.product.industry;
  const industry = industryKey
    ? all.filter((p) => p.type === "industry" && p.industry === industryKey)
    : [];
  return [...base, ...industry];
}

function buildPlan(packs: Pack[], target: ScanTarget, engines: string[]): ScanPlan {
  const vars = promptVars(target);
  const prompts: PlannedPrompt[] = [];
  for (const pack of packs) {
    for (const intent of pack.intents) {
      for (const p of intent.prompts) {
        prompts.push({
          intent: intent.intent,
          capability: intent.capability,
          packId: pack.id,
          text: expand(p.template, vars),
          weight: intent.weight,
          engines,
          tags: {
            intent: intent.intent,
            funnel: intent.funnel,
            branded: p.tags.branded,
            geo: p.tags.geo,
            language: target.language,
          },
        });
      }
    }
  }
  return { prompts, packIds: packs.map((p) => p.id) };
}

/** Placeholder values drawn from the scan target; unknown keys fall back to `your <key>`. */
export function promptVars(target: ScanTarget): Record<string, string> {
  return {
    store: target.store.displayName,
    product: target.product.title,
    category: target.product.category,
    brand: target.product.brand ?? target.product.title,
    city: target.geo ?? "your area",
    domain: target.store.domain,
  };
}

function expand(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `your ${k}`);
}
