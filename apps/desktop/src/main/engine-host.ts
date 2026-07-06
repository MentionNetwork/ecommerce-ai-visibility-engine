/**
 * Engine host — Electron utilityProcess. MOCK-FIRST, but the pack pipeline is REAL:
 * loads actual pack YAML from packages/packs, expands prompt templates, and computes
 * scores from pack weights. Only the AI answers are mocked (deterministic), so the
 * real SamplingProvider swaps in without touching anything else.
 */
import { load } from "js-yaml";

// Real pack data, bundled at build time (sync with packages/packs).
import basePackRaw from "../../../../packages/packs/base/ecommerce/pack.yaml?raw";
import intWhereToBuy from "../../../../packages/packs/base/ecommerce/intents/where-to-buy.yaml?raw";
import intTrusted from "../../../../packages/packs/base/ecommerce/intents/trusted.yaml?raw";
import intPrice from "../../../../packages/packs/base/ecommerce/intents/price.yaml?raw";
import intShipping from "../../../../packages/packs/base/ecommerce/intents/shipping.yaml?raw";
import beautyPackRaw from "../../../../packages/packs/industries/beauty/pack.yaml?raw";
import intAuthenticity from "../../../../packages/packs/industries/beauty/intents/authenticity.yaml?raw";
import intIngredientSafety from "../../../../packages/packs/industries/beauty/intents/ingredient-safety.yaml?raw";

/** Marketplace store patterns — a captured store handle on a known marketplace. */
const DETECTION_PATTERNS = [
  { id: "shopee-store", pattern: /^https?:\/\/shopee\.[a-z.]+\/(?!universal-link)([A-Za-z0-9_.]+)$/ },
  { id: "amazon-store", pattern: /^https?:\/\/(?:www\.)?amazon\.[a-z.]+\/stores\/([^/]+)/ },
  { id: "tiktok-shop", pattern: /^https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]+)/ },
];

interface StoreDetection {
  domain: string;
  displayName: string;
  platform: "shopify" | "woocommerce" | "marketplace" | "custom";
}

const ENGINES = [
  { engine: "chatgpt", label: "ChatGPT" },
  { engine: "google-ai-mode", label: "Google AI Mode" },
  { engine: "gemini", label: "Gemini" },
  { engine: "claude", label: "Claude" },
];

interface IntentDef {
  intent: string;
  label: { en: string };
  weight: number;
  funnel: string;
  prompts: Array<{ template: string; tags: { branded: boolean; geo: string } }>;
}

interface PackDef {
  id: string;
  label: { en: string };
  intents: IntentDef[];
}

const BASE_ECOMMERCE: PackDef = {
  ...(load(basePackRaw) as { id: string; label: { en: string } }),
  intents: [intWhereToBuy, intTrusted, intPrice, intShipping].map((r) => load(r) as IntentDef),
};
const BEAUTY: PackDef = {
  ...(load(beautyPackRaw) as { id: string; label: { en: string } }),
  intents: [intAuthenticity, intIngredientSafety].map((r) => load(r) as IntentDef),
};

function detect(rawUrl: string): StoreDetection {
  const url = rawUrl.trim();
  const isUrlLike = /^https?:\/\//i.test(url) || url.includes(".");

  // Bare brand name (no domain yet) — still index it as a custom store by name.
  if (!isUrlLike) return { domain: url, displayName: url, platform: "custom" };

  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  for (const p of DETECTION_PATTERNS) {
    const m = normalized.match(p.pattern);
    if (m) {
      return {
        domain: new URL(normalized).hostname.replace(/^www\./, ""),
        displayName: m[1] ?? normalized,
        platform: "marketplace",
      };
    }
  }
  // Cannot reliably tell Shopify vs WooCommerce from the URL alone — default custom.
  const domain = new URL(normalized).hostname.replace(/^www\./, "");
  return { domain, displayName: domain, platform: "custom" };
}

/** TODO(real): industry via Cloud /v1/detect. Mock: beauty markers in the store name. */
function detectIndustry(storeName: string): string | null {
  return /beauty|cosmetic|skin|serum/i.test(storeName) ? "beauty" : null;
}

function expand(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => ctx[k] ?? `your ${k}`);
}

/** Deterministic pseudo-random so reports are stable per store. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function buildPlan(store: StoreDetection) {
  const industry = detectIndustry(store.displayName);
  const packs = [BASE_ECOMMERCE, ...(industry === "beauty" ? [BEAUTY] : [])];
  const ctx = { store: store.displayName, product: "your best-selling product", category: "products", city: "Dubai" };
  const intents = packs.flatMap((pack) =>
    pack.intents.map((it) => ({
      packId: pack.id,
      packLabel: pack.label.en,
      intent: it.intent,
      label: it.label.en,
      weight: it.weight,
      funnel: it.funnel,
      prompts: it.prompts.map((p) => ({ text: expand(p.template, ctx), tags: p.tags })),
    })),
  );
  return {
    packsUsed: packs.map((p) => ({ id: p.id, label: p.label.en, intents: p.intents.length })),
    intents,
    questionCount: intents.reduce((n, it) => n + it.prompts.length, 0),
  };
}

const EXCERPTS_HIT = [
  "…{store} is a solid option — reliable shipping and authentic stock…",
  "…among the stores worth checking, {store} carries it at a fair price…",
  "…{store} is frequently recommended by shoppers in the region…",
];
const THIRD_PARTY = ["reddit.com", "trustpilot.com", "youtube.com", "vogue.com"];
const COMPETITOR_DOMAINS = ["noon.com", "amazon.ae", "stylekorean.com", "yesstyle.com"];

async function scan(url: string, emit: (event: string, payload: unknown) => void) {
  const store = detect(url);
  const plan = buildPlan(store);
  emit("plan", { packsUsed: plan.packsUsed, questionCount: plan.questionCount, engines: ENGINES.length });

  // Mock sampling: one pass per engine, deterministic outcomes per prompt×engine.
  const results = new Map<string, { mentioned: boolean; position: number | null; excerpt: string | null; cited: string[] }>();
  for (const { engine } of ENGINES) {
    emit("progress", { engine, status: "sampling" });
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
    for (const it of plan.intents) {
      for (const p of it.prompts) {
        const h = hash(`${store.domain}|${engine}|${p.text}`);
        const mentioned = h % 100 < (engine === "claude" ? 22 : 58);
        const cited: string[] = [];
        if (mentioned) {
          cited.push(store.domain);
          cited.push(COMPETITOR_DOMAINS[h % COMPETITOR_DOMAINS.length]);
          if (h % 3 === 0) cited.push(THIRD_PARTY[h % THIRD_PARTY.length]);
        } else {
          cited.push(COMPETITOR_DOMAINS[h % COMPETITOR_DOMAINS.length]);
          cited.push(THIRD_PARTY[(h >> 3) % THIRD_PARTY.length]);
        }
        results.set(`${engine}|${p.text}`, {
          mentioned,
          position: mentioned ? 1 + (h % 4) : null,
          excerpt: mentioned ? EXCERPTS_HIT[h % EXCERPTS_HIT.length].replaceAll("{store}", store.displayName) : null,
          cited,
        });
      }
    }
    emit("progress", { engine, status: "done" });
  }

  // REAL aggregation logic: weights come from the packs.
  const perEngine = ENGINES.map(({ engine, label }) => {
    const cells = plan.intents.flatMap((it) => it.prompts.map((p) => results.get(`${engine}|${p.text}`)!));
    const hits = cells.filter((c) => c.mentioned);
    const visibility = cells.length ? Math.round((hits.length / cells.length) * 100) : 0;
    const avgPos = hits.length ? hits.reduce((s, c) => s + (c.position ?? 0), 0) / hits.length : null;
    return { engine, label, mentioned: hits.length > 0, visibility: hits.length ? visibility : null, avgPos };
  });
  const rankOrder = [...perEngine].filter((e) => e.mentioned).sort((a, b) => (b.visibility ?? 0) - (a.visibility ?? 0));
  const perEngineRows = perEngine.map((e) => ({
    ...e,
    rank: e.mentioned ? rankOrder.findIndex((r) => r.engine === e.engine) + 2 : null, // +2: mock assumes a competitor always takes rank #1
  }));

  const perIntent = plan.intents.map((it) => {
    const perPrompt = it.prompts.map((p) => ({
      text: p.text,
      tags: p.tags,
      perEngine: ENGINES.map(({ engine, label }) => {
        const r = results.get(`${engine}|${p.text}`)!;
        return { engine, label, mentioned: r.mentioned, excerpt: r.excerpt };
      }),
    }));
    const enginesHit = ENGINES.filter(({ engine }) => it.prompts.some((p) => results.get(`${engine}|${p.text}`)!.mentioned));
    const cells = perPrompt.flatMap((p) => p.perEngine);
    const visibility = Math.round((cells.filter((c) => c.mentioned).length / cells.length) * 100);
    return {
      intent: it.intent,
      label: it.label,
      packId: it.packId,
      weight: it.weight,
      funnel: it.funnel,
      mentioned: enginesHit.length > 0,
      coverage: `${enginesHit.length}/${ENGINES.length}`,
      visibility: enginesHit.length ? visibility : null,
      prompts: perPrompt,
    };
  });

  const wSum = perIntent.reduce((s, it) => s + it.weight, 0);
  const visibilityScore = Math.round(perIntent.reduce((s, it) => s + (it.visibility ?? 0) * it.weight, 0) / wSum);
  const mentionedPos = perEngineRows.filter((e) => e.avgPos !== null).map((e) => e.avgPos!) as number[];
  const avgPosition = mentionedPos.length ? Math.round(mentionedPos.reduce((a, b) => a + b, 0) / mentionedPos.length) : null;

  const missing = perIntent.filter((i) => !i.mentioned).map((i) => i.label.toLowerCase());
  const engineHits = perEngineRows.filter((e) => e.mentioned).length;
  const verdict =
    `You show up in ${engineHits} of ${ENGINES.length} AI engines` +
    (missing.length ? ` — but you're missing from ${missing.join(" and ")} questions` : "") +
    (avgPosition && avgPosition > 1 ? `, and you're rarely #1.` : ".");

  // Market position: fixture retailers (PDF reference) + the scanned store slotted in.
  const marketPosition = [
    { rank: 1, retailer: "Noon", isMine: false, coverage: "4/4", shareOfVoice: 19.0 },
    { rank: 2, retailer: store.displayName, isMine: true, coverage: `${engineHits}/4`, shareOfVoice: 14.3 },
    { rank: 3, retailer: "Amazon.ae", isMine: false, coverage: "2/4", shareOfVoice: 9.5 },
    { rank: 4, retailer: "Chemist Warehouse", isMine: false, coverage: "2/4", shareOfVoice: 9.5 },
    { rank: 5, retailer: "StyleKorean", isMine: false, coverage: "2/4", shareOfVoice: 9.5 },
    { rank: 6, retailer: "YesStyle", isMine: false, coverage: "1/4", shareOfVoice: 4.8 },
  ];

  const counts = new Map<string, number>();
  for (const r of results.values()) for (const d of r.cited) counts.set(d, (counts.get(d) ?? 0) + 1);
  const citationRank = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count], i) => ({
      rank: i + 1,
      domain,
      count,
      type: domain === store.domain ? "your_store" : THIRD_PARTY.includes(domain) ? "third_party" : "competitor",
    }));

  return {
    store,
    packsUsed: plan.packsUsed,
    questionCount: plan.questionCount,
    visibilityScore,
    avgPosition,
    verdict,
    perEngine: perEngineRows.map(({ avgPos: _a, ...row }) => row),
    perIntent,
    marketPosition,
    citationRank,
    generatedAt: new Date().toISOString(),
  };
}

/** Mock registry — will be replaced by a fetch from MentionNetwork/registry. Each
 *  connector CARRIES ITS OWN setup instructions (manifest.setup) — the app renders them automatically. */
const CONNECTORS = [
  {
    name: "mn-connector-shopify",
    platform: "shopify",
    label: "Shopify",
    auth: { kind: "oauth2", scopes: ["read products", "read pages & metadata", "write metadata (schema.org)"] },
    capabilities: { read: ["site", "products", "pages", "meta", "structured_data"], write: ["schema_org.upsert", "meta.update"] },
    setup: {
      steps: [
        { title: "Click Connect below to open Shopify", body: "You'll be asked to approve the listed permissions on your store." },
        { title: "Approve the permissions", body: "We only request what's listed — read first, write only for fixes you approve." },
      ],
      docsUrl: "https://github.com/MentionNetwork/registry",
    },
  },
  {
    name: "mn-connector-woocommerce",
    platform: "woocommerce",
    label: "WooCommerce",
    auth: { kind: "api_key", scopes: ["read products", "read orders", "update products"] },
    capabilities: { read: ["products", "pages", "meta", "sitemap"], write: ["product.update", "meta.update", "content.publish"] },
    setup: {
      steps: [
        { title: "Open WP Admin → WooCommerce → Settings → Advanced → REST API" },
        { title: "Add key → Description \"Mention Network\", Permissions Read/Write → Generate", body: "Copy the Consumer key and Consumer secret — WooCommerce shows them only once." },
        { title: "Paste both below" },
      ],
      docsUrl: "https://github.com/MentionNetwork/registry",
    },
  },
  {
    name: "mn-connector-joomla",
    platform: "joomla",
    label: "Joomla",
    auth: { kind: "api_key", scopes: ["read articles", "update meta"] },
    capabilities: { read: ["site", "pages", "meta"], write: ["meta.update"] },
    setup: {
      steps: [
        { title: "Open Joomla Admin → Users → Manage → your user" },
        { title: "Open the \"Joomla API Token\" tab → click Generate", body: "Requires Joomla 4+. The token inherits your user's permissions." },
        { title: "Paste the token below" },
      ],
      docsUrl: "https://github.com/MentionNetwork/registry",
    },
  },
];

process.parentPort.on("message", (e) => {
  const { id, method, params } = e.data as { id: number; method: string; params: { url?: string } };
  const emit = (event: string, payload: unknown) => process.parentPort.postMessage({ event, payload });
  const reply = (payload: unknown) => process.parentPort.postMessage({ id, payload });

  if (method === "detect") reply(detect(params.url ?? ""));
  else if (method === "connectors") reply(CONNECTORS);
  else if (method === "testConnection")
    void new Promise((r) => setTimeout(r, 900)).then(() => reply({ ok: true, domain: params.url ?? "site" }));
  else if (method === "scan") void scan(params.url ?? "", emit).then(reply);
  else reply({ error: `unknown method: ${method}` });
});
