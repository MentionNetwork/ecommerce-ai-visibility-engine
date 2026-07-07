import type { Criterion, CriterionResult, GroupScore } from "@mention-network/shared";
import { WEIGHT_FACTOR } from "@mention-network/shared";

export interface AuditScore {
  overallScore: number;
  groups: GroupScore[];
  scoredCount: number;
  pendingCount: number;
}

export function scoreAudit(criteria: Criterion[], results: CriterionResult[]): AuditScore {
  const byId = new Map(criteria.map((c) => [c.id, c]));
  const scored = results.filter((r) => r.status === "scored" && r.score != null);

  const weighted = (rs: CriterionResult[]) => {
    const num = rs.reduce((s, r) => s + r.score! * WEIGHT_FACTOR[r.weight], 0);
    const den = rs.reduce((s, r) => s + WEIGHT_FACTOR[r.weight], 0);
    return { score: den === 0 ? 0 : Math.round(num / den), weightSum: den };
  };

  const groupsMap = new Map<string, CriterionResult[]>();
  for (const r of scored) {
    const g = byId.get(r.criterionId)?.group ?? "unknown";
    (groupsMap.get(g) ?? groupsMap.set(g, []).get(g)!).push(r);
  }
  const groups: GroupScore[] = [...groupsMap.entries()].map(([group, rs]) => ({
    group,
    area: byId.get(rs[0].criterionId)?.area ?? "on_store",
    ...weighted(rs),
  }));

  return {
    overallScore: weighted(scored).score,
    groups,
    scoredCount: scored.length,
    pendingCount: results.filter((r) => r.status === "pending").length,
  };
}
