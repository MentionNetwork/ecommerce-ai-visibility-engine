import type { SiteConnector, Session, ChangePlan, Diff, ApplyResult } from "@mention-network/connector-sdk";
import type { Prescription } from "@mention-network/shared";

export interface PrescriptionRunner {
  /** plan + dryRun in one step; returns the preview a UI shows the merchant. */
  preview(rx: Prescription): Promise<{ plan: ChangePlan; diff: Diff }>;
  /** Applies a previously previewed plan; rejects a plan that doesn't exactly match a previewed plan. */
  apply(plan: ChangePlan): Promise<ApplyResult>;
  rollback(applyId: string): Promise<void>;
}

/**
 * Wraps connector.write and makes dry-run-before-apply a mechanical
 * guarantee instead of a convention. The gate matches the exact previewed
 * plan (by content), not merely the prescriptionId — a caller cannot swap
 * in tampered mutations under an id that was legitimately previewed.
 */
export function prescriptionRunner(connector: SiteConnector, session: Session): PrescriptionRunner {
  const write = connector.write;
  if (!write) throw new Error("connector is read-only — it declares no write capabilities");

  const previewed = new Map<string, string>();

  return {
    async preview(rx: Prescription) {
      const plan = await write.plan(session, rx);
      const diff = await write.dryRun(session, plan);
      previewed.set(plan.prescriptionId, JSON.stringify(plan));
      return { plan, diff };
    },
    async apply(plan: ChangePlan) {
      const stored = previewed.get(plan.prescriptionId);
      if (stored === undefined || JSON.stringify(plan) !== stored) {
        throw new Error(
          `plan ${plan.prescriptionId} was not previewed or differs from the previewed plan — run preview (dry-run) before apply`,
        );
      }
      return write.apply(session, plan);
    },
    async rollback(applyId: string) {
      return write.rollback(session, applyId);
    },
  };
}
