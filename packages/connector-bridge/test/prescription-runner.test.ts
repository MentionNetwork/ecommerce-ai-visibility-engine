import { describe, test, expect } from "vitest";
import type { SiteConnector } from "@mention-network/connector-sdk";
import type { Prescription } from "@mention-network/shared";
import { PRESCRIPTION_SCHEMA_VERSION } from "@mention-network/shared";
import { prescriptionRunner } from "../src/index.js";
import { FakeConnector, session } from "./fake-connector.js";

const rx: Prescription = {
  id: "rx1",
  schemaVersion: PRESCRIPTION_SCHEMA_VERSION,
  target: { storeId: "s1", productId: "p1" },
  actions: [{ type: "schema_org.upsert", target: "product:p1", payload: {} }],
  createdAt: "t",
};

function writingConnector() {
  const calls: string[] = [];
  const write: SiteConnector["write"] = {
    plan: async (_s, r) => { calls.push("plan"); return { prescriptionId: r.id, mutations: [{ action: "schema_org.upsert", target: "product:p1", summary: "add Offer schema" }] }; },
    dryRun: async (_s, p) => { calls.push("dryRun"); return { entries: [{ target: p.prescriptionId, before: "", after: "Offer schema" }] }; },
    apply: async (_s, p) => { calls.push("apply"); return { applyId: `apply-${p.prescriptionId}`, applied: 1 }; },
    rollback: async (_s, id) => { calls.push(`rollback:${id}`); },
  };
  return { connector: new FakeConnector({ write }), calls };
}

describe("prescriptionRunner", () => {
  test("throws for a read-only connector", () => {
    expect(() => prescriptionRunner(new FakeConnector(), session)).toThrow(/read-only/);
  });

  test("preview runs plan then dryRun and returns both", async () => {
    const { connector, calls } = writingConnector();
    const { plan, diff } = await prescriptionRunner(connector, session).preview(rx);
    expect(calls).toEqual(["plan", "dryRun"]);
    expect(plan.prescriptionId).toBe("rx1");
    expect(diff.entries[0].after).toBe("Offer schema");
  });

  test("apply succeeds only after preview", async () => {
    const { connector } = writingConnector();
    const runner = prescriptionRunner(connector, session);
    const { plan } = await runner.preview(rx);
    const result = await runner.apply(plan);
    expect(result).toEqual({ applyId: "apply-rx1", applied: 1 });
  });

  test("apply rejects a plan that was never previewed", async () => {
    const { connector, calls } = writingConnector();
    const runner = prescriptionRunner(connector, session);
    await expect(runner.apply({ prescriptionId: "rx-unseen", mutations: [] })).rejects.toThrow(/preview/);
    expect(calls).not.toContain("apply");
  });

  test("apply rejects a tampered plan sharing a previewed prescriptionId", async () => {
    const { connector, calls } = writingConnector();
    const runner = prescriptionRunner(connector, session);
    await runner.preview(rx);
    await expect(
      runner.apply({
        prescriptionId: "rx1",
        mutations: [{ action: "content.publish", target: "page:x", summary: "tampered" }],
      }),
    ).rejects.toThrow(/preview/);
    expect(calls).not.toContain("apply");
  });

  test("rollback passes through", async () => {
    const { connector, calls } = writingConnector();
    await prescriptionRunner(connector, session).rollback("apply-rx1");
    expect(calls).toContain("rollback:apply-rx1");
  });
});
