import { useEffect, useState } from "react";
import type { ScanPlanInfo, ScanReport } from "../../../preload/index";

const ENGINE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  "google-ai-mode": "Google AI Mode",
  gemini: "Gemini",
  claude: "Claude",
};

export function Scanning({ url, onDone }: { url: string; onDone: (report: ScanReport) => void }) {
  const [status, setStatus] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<ScanPlanInfo | null>(null);

  useEffect(() => {
    const off = window.mn.onProgress((p) => setStatus((s) => ({ ...s, [p.engine]: p.status })));
    const offPlan = window.mn.onPlan(setPlan);
    void window.mn.scan(url).then(onDone);
    return () => {
      off();
      offPlan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const engines = Object.keys(ENGINE_LABELS);

  return (
    <div className="card" style={{ width: 440, display: "flex", flexDirection: "column", gap: "var(--mn-space-4)" }}>
      <div>
        <div className="overline">Running diagnosis</div>
        <h2 style={{ fontSize: "var(--mn-text-2xl)", fontWeight: 700, color: "var(--mn-text-strong)" }}>
          Asking the AI engines…
        </h2>
        {plan && (
          <p style={{ fontSize: "var(--mn-text-sm)", color: "var(--mn-text-secondary)", marginTop: 4 }}>
            {plan.questionCount} buying questions from {plan.packsUsed.map((p) => p.label).join(" + ")}
          </p>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {engines.map((engine, i) => (
          <div
            key={engine}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 0",
              borderBottom: i < engines.length - 1 ? "1px solid var(--mn-border-soft)" : "none",
            }}
          >
            <span style={{ fontSize: "var(--mn-text-base)" }}>{ENGINE_LABELS[engine]}</span>
            {status[engine] === "done" ? (
              <span className="badge success">Done</span>
            ) : status[engine] === "sampling" ? (
              <span className="spinner" />
            ) : (
              <span style={{ color: "var(--mn-text-placeholder)", fontSize: "var(--mn-text-xs)" }}>Queued</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
