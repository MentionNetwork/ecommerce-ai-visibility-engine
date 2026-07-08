import type { SiteConnector, Session } from "@mention-network/connector-sdk";
import type { PageFetcherPort } from "@mention-network/engine";
import type { PageBundle } from "@mention-network/shared";

const LD_BLOCK = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function parseJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(LD_BLOCK)) {
    try { out.push(JSON.parse(m[1])); } catch { /* malformed block — skip */ }
  }
  return out;
}

/**
 * Adapts a connected SiteConnector into the audit's PageFetcherPort.
 * Page fetches go through the connector; robots (and optional headless
 * rendering) come from the fallback fetcher when provided.
 */
export function pageFetcherFromConnector(
  connector: SiteConnector,
  session: Session,
  fallback?: PageFetcherPort,
): PageFetcherPort {
  const fetcher: PageFetcherPort = {
    async getRobots(domain: string) {
      return fallback ? fallback.getRobots(domain) : null;
    },
    async getRaw(url: string): Promise<PageBundle> {
      try {
        const snapshot = await connector.read.getPage(session, url);
        return {
          url: snapshot.url,
          rawHtml: snapshot.html,
          jsonld: parseJsonLd(snapshot.html),
          status: 200,
          fetchedAt: snapshot.fetchedAt,
        };
      } catch (err) {
        if (fallback) return fallback.getRaw(url);
        throw err;
      }
    },
  };
  if (fallback?.getRendered) {
    fetcher.getRendered = (url: string) => fallback.getRendered!(url);
  }
  return fetcher;
}
