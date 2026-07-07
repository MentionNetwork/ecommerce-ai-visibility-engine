import type { ScanTarget, Criterion, AuditContext, PageBundle } from "@mention-network/shared";
import type { PageFetcherPort } from "./ports.js";

export async function buildContext(
  target: ScanTarget,
  criteria: Criterion[],
  fetcher: PageFetcherPort,
): Promise<AuditContext> {
  const robots = await fetcher.getRobots(target.store.domain);

  let productPage: PageBundle | null = null;
  if (target.product.url) {
    productPage = await fetcher.getRaw(target.product.url);
    if (fetcher.getRendered) {
      try { productPage.renderedHtml = await fetcher.getRendered(target.product.url); } catch { /* headless optional */ }
    }
  }

  const storePages: Record<string, PageBundle> = {};
  const pageKeys = [...new Set(
    criteria.filter((c) => c.check === "page_exists" && c.params?.page).map((c) => c.params!.page),
  )];
  for (const key of pageKeys) {
    try { storePages[key] = await fetcher.getRaw(`https://${target.store.domain}/${key}`); } catch { /* missing page */ }
  }

  return { target, robots, productPage, storePages };
}
