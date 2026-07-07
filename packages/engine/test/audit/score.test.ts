import { describe, test, expect } from "vitest";
import type { Criterion, CriterionResult } from "@mention-network/shared";
import { scoreAudit } from "../../src/audit/score.js";

function crit(id: string, group: string, weight: Criterion["weight"]): Criterion {
  return { id, label: { en: id }, group, area: "on_store", weight, scope: "store", check: "x", scoring: { "0": "", "50": "", "100": "" } };
}
function res(criterionId: string, weight: CriterionResult["weight"], score: 0 | 50 | 100 | null, status: CriterionResult["status"]): CriterionResult {
  return { criterionId, weight, score, status };
}

describe("scoreAudit", () => {
  test("weights the overall score and ignores pending", () => {
    const criteria = [crit("a", "access", "critical"), crit("b", "schema", "medium")];
    const results = [res("a", "critical", 100, "scored"), res("b", "medium", 0, "scored")];
    // (100×3 + 0×1) / (3+1) = 75
    const out = scoreAudit(criteria, results);
    expect(out.overallScore).toBe(75);
    expect(out.scoredCount).toBe(2);
  });

  test("pending criteria don't drag the score down and are counted", () => {
    const criteria = [crit("a", "access", "critical"), crit("b", "content", "high")];
    const results = [res("a", "critical", 100, "scored"), res("b", "high", null, "pending")];
    const out = scoreAudit(criteria, results);
    expect(out.overallScore).toBe(100); // only 'a' counts
    expect(out.pendingCount).toBe(1);
  });

  test("groups roll up per group with their own weighting", () => {
    const criteria = [crit("a", "access", "critical"), crit("b", "access", "medium")];
    const results = [res("a", "critical", 100, "scored"), res("b", "medium", 50, "scored")];
    const out = scoreAudit(criteria, results);
    const access = out.groups.find((g) => g.group === "access")!;
    // (100×3 + 50×1) / 4 = 87.5 → 88
    expect(access.score).toBe(88);
    expect(access.area).toBe("on_store");
  });

  test("no scored criteria yields overall 0", () => {
    const criteria = [crit("a", "access", "critical")];
    const results = [res("a", "critical", null, "not_applicable")];
    expect(scoreAudit(criteria, results).overallScore).toBe(0);
  });
});
