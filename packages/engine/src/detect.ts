import type { Store, SampleResult } from "@mention-network/shared";
import type { Mention, DetectedRetailer } from "./domain.js";

function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^www\./, "");
}

function isSelf(target: string, domain: string): boolean {
  const d = normalizeDomain(domain);
  return d === target || d.endsWith(`.${target}`);
}

/** Second-level label, subdomain and TLD dropped: "noon.com" → "Noon"; "shop.glow-beauty.com" → "Glow Beauty". */
export function displayNameFromDomain(domain: string): string {
  const host = normalizeDomain(domain);
  const labels = host.split(".");
  const sld = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  return sld.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** My store in one answer: domain citation (with position + citedUrl) beats a bare name mention. */
export function detectStoreMention(store: Store, sample: SampleResult): Mention | null {
  const target = normalizeDomain(store.domain);
  for (const c of sample.citations) {
    if (isSelf(target, c.domain)) {
      return { sampleId: sample.id, engine: sample.engine, matchType: "domain", position: c.position, citedUrl: c.url };
    }
  }
  const name = store.displayName.trim().toLowerCase();
  if (name && sample.response.text.toLowerCase().includes(name)) {
    return { sampleId: sample.id, engine: sample.engine, matchType: "name" };
  }
  return null;
}

/** Every cited domain becomes a candidate retailer, anchored to its cited URL. Deduped by domain, best position wins. */
export function extractRetailers(store: Store, sample: SampleResult): DetectedRetailer[] {
  const target = normalizeDomain(store.domain);
  const byDomain = new Map<string, DetectedRetailer>();
  for (const c of sample.citations) {
    const domain = normalizeDomain(c.domain);
    const existing = byDomain.get(domain);
    if (existing && existing.position <= c.position) continue;
    byDomain.set(domain, {
      domain,
      displayName: displayNameFromDomain(domain),
      isMine: isSelf(target, domain),
      citedUrl: c.url,
      position: c.position,
      sampleId: sample.id,
      engine: sample.engine,
    });
  }
  return [...byDomain.values()].sort((a, b) => a.position - b.position);
}
