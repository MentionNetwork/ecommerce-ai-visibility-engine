import { contextBridge, ipcRenderer } from "electron";

export interface StoreDetection {
  domain: string;
  displayName: string;
  platform: "shopify" | "woocommerce" | "marketplace" | "custom";
}

export interface EngineRow {
  engine: string;
  label: string;
  mentioned: boolean;
  visibility: number | null;
  rank: number | null;
}

export interface PromptEngineResult {
  engine: string;
  label: string;
  mentioned: boolean;
  excerpt: string | null;
}

export interface PromptDetail {
  text: string;
  tags: { branded: boolean; geo: string };
  perEngine: PromptEngineResult[];
}

export interface IntentRow {
  intent: string;
  label: string;
  packId: string;
  weight: number;
  funnel: string;
  mentioned: boolean;
  coverage: string;
  visibility: number | null;
  prompts: PromptDetail[];
}

export interface MarketRow {
  rank: number;
  retailer: string;
  isMine: boolean;
  coverage: string;
  shareOfVoice: number;
}

export interface PackUsed {
  id: string;
  label: string;
  intents: number;
}

export interface ScanPlanInfo {
  packsUsed: PackUsed[];
  questionCount: number;
  engines: number;
}

export interface CitationDomainRow {
  rank: number;
  domain: string;
  count: number;
  type: "your_store" | "competitor" | "third_party";
}

export interface ConnectorSetupStep {
  title: string;
  body?: string;
}

export interface ConnectorInfo {
  name: string;
  platform: string;
  label: string;
  auth: { kind: string; scopes: string[] };
  capabilities: { read: string[]; write: string[] };
  setup: { steps: ConnectorSetupStep[]; docsUrl?: string };
}

export interface ScanReport {
  store: StoreDetection;
  packsUsed: PackUsed[];
  questionCount: number;
  visibilityScore: number;
  avgPosition: number | null;
  verdict: string;
  perEngine: EngineRow[];
  perIntent: IntentRow[];
  marketPosition: MarketRow[];
  citationRank: CitationDomainRow[];
  generatedAt: string;
}

const api = {
  detect: (url: string): Promise<StoreDetection> => ipcRenderer.invoke("mn:detect", url),
  scan: (url: string): Promise<ScanReport> => ipcRenderer.invoke("mn:scan", url),
  onProgress: (cb: (p: { engine: string; status: string }) => void): (() => void) => {
    const handler = (_e: unknown, payload: { engine: string; status: string }) => cb(payload);
    ipcRenderer.on("engine:progress", handler);
    return () => ipcRenderer.removeListener("engine:progress", handler);
  },
  connectors: (): Promise<ConnectorInfo[]> => ipcRenderer.invoke("mn:connectors"),
  testConnection: (platform: string, token: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("mn:testConnection", platform, token),
  onPlan: (cb: (p: ScanPlanInfo) => void): (() => void) => {
    const handler = (_e: unknown, payload: ScanPlanInfo) => cb(payload);
    ipcRenderer.on("engine:plan", handler);
    return () => ipcRenderer.removeListener("engine:plan", handler);
  },
};

contextBridge.exposeInMainWorld("mn", api);
export type MnApi = typeof api;
