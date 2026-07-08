import { describe, test, expect } from "vitest";
import type { PageFetcherPort } from "@mention-network/engine";
import type { PageBundle } from "@mention-network/shared";
import { pageFetcherFromConnector } from "../src/index.js";
import { FakeConnector, session } from "./fake-connector.js";

const LD = '<script type="application/ld+json">{"@type":"Product","name":"Glow"}</script>';

class FakeFallback implements PageFetcherPort {
  calls: string[] = [];
  // class-field arrows (own properties) so `{ ...new FakeFallback() }` spreads them
  getRobots = async (domain: string) => { this.calls.push(`robots:${domain}`); return "User-agent: *\nDisallow:"; };
  getRaw = async (url: string): Promise<PageBundle> => {
    this.calls.push(`raw:${url}`);
    return { url, rawHtml: "<p>fallback</p>", jsonld: [], status: 200, fetchedAt: "t" };
  };
}

describe("pageFetcherFromConnector", () => {
  test("maps PageSnapshot to PageBundle and parses JSON-LD", async () => {
    const connector = new FakeConnector({
      read: { getPage: async (_s, url) => ({ url, html: `<h1>Glow</h1>${LD}`, fetchedAt: "now" }) },
    });
    const bundle = await pageFetcherFromConnector(connector, session).getRaw("https://x.com/p");
    expect(bundle).toMatchObject({ url: "https://x.com/p", status: 200, fetchedAt: "now" });
    expect(bundle.rawHtml).toContain("<h1>Glow</h1>");
    expect(bundle.jsonld).toEqual([{ "@type": "Product", name: "Glow" }]);
  });

  test("ignores malformed JSON-LD blocks", async () => {
    const connector = new FakeConnector({
      read: { getPage: async (_s, url) => ({ url, html: '<script type="application/ld+json">{oops</script>', fetchedAt: "t" }) },
    });
    const bundle = await pageFetcherFromConnector(connector, session).getRaw("https://x.com/p");
    expect(bundle.jsonld).toEqual([]);
  });

  test("delegates to the fallback when the connector getPage throws", async () => {
    const connector = new FakeConnector({ read: { getPage: async () => { throw new Error("boom"); } } });
    const fallback = new FakeFallback();
    const bundle = await pageFetcherFromConnector(connector, session, fallback).getRaw("https://x.com/p");
    expect(bundle.rawHtml).toBe("<p>fallback</p>");
    expect(fallback.calls).toContain("raw:https://x.com/p");
  });

  test("rethrows when the connector fails and there is no fallback", async () => {
    const connector = new FakeConnector({ read: { getPage: async () => { throw new Error("boom"); } } });
    await expect(pageFetcherFromConnector(connector, session).getRaw("https://x.com/p")).rejects.toThrow("boom");
  });

  test("getRobots delegates to the fallback, else null", async () => {
    const fallback = new FakeFallback();
    expect(await pageFetcherFromConnector(new FakeConnector(), session, fallback).getRobots("x.com")).toContain("User-agent");
    expect(await pageFetcherFromConnector(new FakeConnector(), session).getRobots("x.com")).toBeNull();
  });

  test("exposes getRendered only when the fallback provides it", async () => {
    const withRendered: PageFetcherPort = { ...new FakeFallback(), getRendered: async () => "<html/>" };
    expect(pageFetcherFromConnector(new FakeConnector(), session, withRendered).getRendered).toBeDefined();
    expect(pageFetcherFromConnector(new FakeConnector(), session, new FakeFallback()).getRendered).toBeUndefined();
  });
});
