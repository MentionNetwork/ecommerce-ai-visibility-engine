import { describe, test, expect } from "vitest";
import type { ConnectorManifest } from "../src/index.js";

describe("connector manifest", () => {
  test("declares the store platforms it targets", () => {
    const m: Pick<ConnectorManifest, "targetPlatforms"> = { targetPlatforms: ["shopify", "woocommerce"] };
    expect(m.targetPlatforms).toContain("woocommerce");
  });
});
