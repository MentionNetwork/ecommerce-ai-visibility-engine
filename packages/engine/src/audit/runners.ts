import type { Criterion, AuditContext, CheckResult, CheckRunner } from "@mention-network/shared";

const AI_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended"];

interface RobotsGroup { agents: string[]; disallows: string[] }

function parseRobots(robots: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let cur: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], disallows: [] }; groups.push(cur); }
      cur.agents.push(val);
      lastWasAgent = true;
    } else if (key === "disallow" && cur) {
      cur.disallows.push(val);
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

/** A bot is blocked when its own group (else the * group) disallows the site root. */
export function botBlocked(robots: string, bot: string): boolean {
  const groups = parseRobots(robots);
  const own = groups.find((g) => g.agents.some((a) => a.toLowerCase() === bot.toLowerCase()));
  const star = groups.find((g) => g.agents.includes("*"));
  const group = own ?? star;
  if (!group) return false;
  return group.disallows.some((d) => d === "/");
}

const robots_allows_bot: CheckRunner = (_c, ctx) => {
  if (ctx.robots == null) return { score: 100, evidence: "No robots.txt — nothing blocked" };
  const blocked = AI_BOTS.filter((b) => botBlocked(ctx.robots!, b));
  if (blocked.length === 0) return { score: 100, evidence: "All major AI crawlers allowed" };
  if (blocked.length === AI_BOTS.length) return { score: 0, evidence: `All AI crawlers blocked: ${blocked.join(", ")}` };
  return { score: 50, evidence: `Blocked: ${blocked.join(", ")}` };
};

const served_html_has_product_data: CheckRunner = (_c, ctx) => {
  const p = ctx.productPage;
  if (!p) return { status: "not_applicable", evidence: "No product page fetched" };
  const { title, offer } = ctx.target.product;
  const price = String(offer.price.amount);
  const nameRaw = p.rawHtml.includes(title);
  const priceRaw = p.rawHtml.includes(price);
  if (nameRaw && priceRaw) return { score: 100, evidence: "Product name and price present in served HTML" };
  if (nameRaw || priceRaw) return { score: 50, evidence: `Partial in served HTML (name: ${nameRaw}, price: ${priceRaw})` };
  const r = p.renderedHtml;
  if (r && (r.includes(title) || r.includes(price))) {
    return { score: 0, evidence: "Product data only appears after JavaScript renders — AI sees an empty page" };
  }
  return { score: 0, evidence: "Product name and price not found in served HTML" };
};

function collectNodes(nodes: unknown[]): Record<string, unknown>[] {
  const flat: Record<string, unknown>[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n && typeof n === "object") {
      const obj = n as Record<string, unknown>;
      flat.push(obj);
      if (Array.isArray(obj["@graph"])) (obj["@graph"] as unknown[]).forEach(walk);
    }
  };
  nodes.forEach(walk);
  return flat;
}
function hasType(node: Record<string, unknown>, t: string): boolean {
  const ty = node["@type"];
  return Array.isArray(ty) ? ty.includes(t) : ty === t;
}

const schema_present: CheckRunner = (_c, ctx) => {
  const product = collectNodes(ctx.productPage?.jsonld ?? []).find((n) => hasType(n, "Product"));
  if (!product) return { score: 0, evidence: "No Product schema found" };
  return "offers" in product
    ? { score: 100, evidence: "Product + Offer schema present" }
    : { score: 50, evidence: "Product schema present but no Offer" };
};

const ENRICH_KEYS = ["brand", "gtin", "gtin13", "gtin12", "gtin8", "aggregateRating", "review"];
const schema_enriched: CheckRunner = (_c, ctx) => {
  const nodes = collectNodes(ctx.productPage?.jsonld ?? []);
  const product = nodes.find((n) => hasType(n, "Product"));
  if (!product) return { score: 0, evidence: "No Product schema to enrich" };
  const hasFaq = nodes.some((n) => hasType(n, "FAQPage"));
  const present = ENRICH_KEYS.filter((k) => k in product).length + (hasFaq ? 1 : 0);
  if (present >= 3) return { score: 100, evidence: `${present} enriched fields present` };
  if (present >= 1) return { score: 50, evidence: `${present} enriched field(s) present` };
  return { score: 0, evidence: "No enriched schema fields (brand/GTIN/ratings/reviews/FAQ)" };
};

const img_alt: CheckRunner = (_c, ctx) => {
  const html = ctx.productPage?.rawHtml;
  if (!html) return { status: "not_applicable", evidence: "No product page fetched" };
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  if (imgs.length === 0) return { status: "not_applicable", evidence: "No <img> tags found" };
  const withAlt = imgs.filter((t) => /\balt\s*=\s*("[^"]+"|'[^']+')/i.test(t)).length;
  const ratio = withAlt / imgs.length;
  if (ratio === 1) return { score: 100, evidence: "All product images have alt text" };
  if (ratio >= 0.5) return { score: 50, evidence: `${withAlt}/${imgs.length} images have alt text` };
  return { score: 0, evidence: `Only ${withAlt}/${imgs.length} images have alt text` };
};

const page_exists: CheckRunner = (c, ctx) => {
  const key = c.params?.page;
  if (!key) return { status: "not_applicable", evidence: "No page param on criterion" };
  const page = ctx.storePages[key];
  if (page && page.status >= 200 && page.status < 400) return { score: 100, evidence: `${key} page found` };
  return { score: 0, evidence: `${key} page missing` };
};

const llm_judge: CheckRunner = () => ({ status: "pending" });

export const CHECK_RUNNERS: Record<string, CheckRunner> = {
  robots_allows_bot,
  served_html_has_product_data,
  schema_present,
  schema_enriched,
  img_alt,
  page_exists,
  llm_judge,
};
