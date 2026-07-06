import { useEffect, useState } from "react";
import type { ConnectorInfo } from "../../../preload/index";

type Step = "pick" | "guide" | "consent" | "testing" | "done";

/**
 * Connect flow — every connector carries its own onboarding (manifest.setup),
 * so this screen renders install steps for ANY platform, incl. community ones.
 */
export function Connect({ displayName, onBack }: { displayName: string; onBack: () => void }) {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [picked, setPicked] = useState<ConnectorInfo | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [token, setToken] = useState("");

  useEffect(() => {
    void window.mn.connectors().then(setConnectors);
  }, []);

  const connect = async () => {
    if (!picked) return;
    setStep("testing");
    const r = await window.mn.testConnection(picked.platform, token);
    setStep(r.ok ? "done" : "consent");
  };

  return (
    <div style={{ width: 560, display: "flex", flexDirection: "column", gap: "var(--mn-space-4)" }}>
      <div>
        <div className="overline">Connect your site</div>
        <h1 style={{ fontSize: "var(--mn-text-2xl)", fontWeight: 700, color: "var(--mn-text-strong)" }}>{displayName}</h1>
        <p style={{ fontSize: "var(--mn-text-sm)", color: "var(--mn-text-secondary)", marginTop: 4 }}>
          Connecting unlocks the deep audit and lets approved fixes be applied — with a diff preview and rollback, always.
        </p>
      </div>

      {step === "pick" && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--mn-space-3)" }}>
          <div className="overline">Which platform runs your site?</div>
          {connectors.map((c) => (
            <button
              key={c.name}
              className="row-toggle"
              style={{ border: "1px solid var(--mn-border)", borderRadius: 10, padding: "12px 14px" }}
              onClick={() => {
                setPicked(c);
                setStep("guide");
              }}
            >
              <span style={{ fontWeight: 600 }}>{c.label}</span>
              <span className="chip">{c.capabilities.read.length} read</span>
              <span className="chip">{c.capabilities.write.length} write</span>
              <div style={{ flex: 1 }} />
              <span style={{ color: "var(--mn-text-placeholder)" }}>›</span>
            </button>
          ))}
          <p style={{ fontSize: "var(--mn-text-xs)", color: "var(--mn-text-placeholder)" }}>
            Missing your platform? Anyone can add one — connectors are community-extensible (mn-connector-*).
          </p>
        </div>
      )}

      {picked && step === "guide" && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--mn-space-4)" }}>
          <div className="overline">Set up — {picked.label}</div>
          {picked.setup.steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: "var(--mn-space-3)" }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  borderRadius: "50%",
                  background: "var(--mn-info-bg)",
                  color: "var(--mn-info-fg)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {i + 1}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: "var(--mn-text-base)" }}>{s.title}</div>
                {s.body && (
                  <div style={{ fontSize: "var(--mn-text-sm)", color: "var(--mn-text-secondary)", marginTop: 2 }}>{s.body}</div>
                )}
              </div>
            </div>
          ))}
          {picked.auth.kind === "api_key" && (
            <input
              className="input"
              placeholder="Paste your token here"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          )}
          <div style={{ display: "flex", gap: "var(--mn-space-2)", justifyContent: "flex-end" }}>
            <button className="btn-primary" style={{ background: "var(--mn-bg-muted)", color: "var(--mn-text-primary)", boxShadow: "none", border: "1px solid var(--mn-border)" }} onClick={() => setStep("pick")}>
              Back
            </button>
            <button
              className="btn-primary"
              disabled={picked.auth.kind === "api_key" && !token.trim()}
              onClick={() => setStep("consent")}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {picked && (step === "consent" || step === "testing") && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--mn-space-3)" }}>
          <div className="overline">Permissions — approve before connecting</div>
          <p style={{ fontSize: "var(--mn-text-sm)", color: "var(--mn-text-secondary)" }}>
            {picked.label} connector requests exactly these capabilities, nothing more:
          </p>
          {picked.auth.scopes.map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--mn-text-base)" }}>
              <span className="badge success">✓</span> {s}
            </div>
          ))}
          <p style={{ fontSize: "var(--mn-text-xs)", color: "var(--mn-text-placeholder)" }}>
            Every write goes through a diff preview first and can be rolled back. Credentials stay on this Mac (Keychain).
          </p>
          <div style={{ display: "flex", gap: "var(--mn-space-2)", justifyContent: "flex-end" }}>
            <button className="btn-primary" style={{ background: "var(--mn-bg-muted)", color: "var(--mn-text-primary)", boxShadow: "none", border: "1px solid var(--mn-border)" }} onClick={() => setStep("guide")}>
              Back
            </button>
            <button className="btn-primary" onClick={() => void connect()} disabled={step === "testing"}>
              {step === "testing" ? "Testing connection…" : "Approve & connect"}
            </button>
          </div>
        </div>
      )}

      {picked && step === "done" && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--mn-space-3)", alignItems: "center", textAlign: "center" }}>
          <span className="badge success" style={{ fontSize: "var(--mn-text-base)", padding: "6px 14px" }}>
            Connected via {picked.name}
          </span>
          <p style={{ fontSize: "var(--mn-text-sm)", color: "var(--mn-text-secondary)" }}>
            Deep audit is now available. (Mock — real connector plugs in via SiteConnector.)
          </p>
          <button className="btn-primary" onClick={onBack}>
            Back to report
          </button>
        </div>
      )}

      {step !== "done" && (
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", color: "var(--mn-text-secondary)", fontSize: "var(--mn-text-sm)", cursor: "pointer", fontFamily: "var(--mn-font)" }}
        >
          ← Back to report
        </button>
      )}
    </div>
  );
}
