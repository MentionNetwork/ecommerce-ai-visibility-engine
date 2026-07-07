import type { AuditPack, PageBundle } from "@mention-network/shared";
import type { PageFetcherPort, AuditPackSource } from "../../src/audit/ports.js";

export class FakePageFetcher implements PageFetcherPort {
  calls: string[] = [];
  constructor(
    private readonly robots: string | null,
    private readonly pages: Record<string, Partial<PageBundle>> = {},
    private readonly options: { throwRobots?: boolean; throwRawUrls?: string[] } = {},
  ) {}
  async getRobots(domain: string) {
    this.calls.push(`robots:${domain}`);
    if (this.options.throwRobots) throw new Error("robots fetch failed");
    return this.robots;
  }
  async getRaw(url: string): Promise<PageBundle> {
    this.calls.push(`raw:${url}`);
    if (this.options.throwRawUrls?.includes(url)) throw new Error(`raw fetch failed: ${url}`);
    const p = this.pages[url] ?? {};
    return { url, rawHtml: p.rawHtml ?? "", jsonld: p.jsonld ?? [], status: p.status ?? 200, fetchedAt: "t", renderedHtml: p.renderedHtml };
  }
}

export class FakeAuditPackSource implements AuditPackSource {
  constructor(private readonly packs: AuditPack[]) {}
  async listAuditPacks() { return this.packs; }
}
