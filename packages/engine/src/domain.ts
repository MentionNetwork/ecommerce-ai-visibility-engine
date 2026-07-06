import type {
  ScanTarget, PromptTags, IntentCapability, IntentTier, CommerceReport,
} from "@mention-network/shared";

export type ScanStatus = "planned" | "sampling" | "analyzing" | "completed" | "failed";

// Pack data the engine consumes to build a plan. Mirrors pack YAML; a PackSource adapter parses YAML into these.
export interface PackPromptTemplate {
  template: string;
  tags: { branded?: boolean; geo?: "none" | "city" | "country" };
  variants?: Array<{ lang: string; template?: string }>;
}

export interface PackIntent {
  intent: string;
  label: Record<string, string>;
  weight: number;
  /** Which scoring logic runs for this intent. */
  capability: IntentCapability;
  tier?: IntentTier; // defaults to "pack" when omitted; base pack intents are "core"
  funnel?: "discovery" | "consideration" | "decision";
  prompts: PackPromptTemplate[];
}

export interface Pack {
  id: string;
  type: "base" | "industry";
  /** Industry packs select by industry key (e.g. "beauty"); base commerce pack has none. */
  industry?: string;
  label: Record<string, string>;
  intents: PackIntent[];
}

export interface PlannedPrompt {
  intent: string;
  capability: IntentCapability;
  packId: string;
  text: string;
  tags: PromptTags;
  weight: number;
  engines: string[];
}

export interface ScanPlan { prompts: PlannedPrompt[]; packIds: string[]; }

export interface Scan {
  id: string;
  target: ScanTarget;
  plan: ScanPlan;
  status: ScanStatus;
  createdAt: string;
  tenantId?: string | null;
}

export interface ScanCheckpoint {
  step: "plan" | "sample" | "detect" | "score" | "report";
  completedUnits: string[];
  updatedAt: string;
}

/** My store matched in one AI answer. */
export interface Mention {
  sampleId: string;
  engine: string;
  matchType: "domain" | "name";
  position?: number;
  citedUrl?: string;
}

/** A competing retailer found in one AI answer, anchored to the URL the AI cited. */
export interface DetectedRetailer {
  domain: string;
  displayName: string;
  isMine: boolean;
  citedUrl: string;
  position: number;
  sampleId: string;
  engine: string;
}

export type { CommerceReport };
