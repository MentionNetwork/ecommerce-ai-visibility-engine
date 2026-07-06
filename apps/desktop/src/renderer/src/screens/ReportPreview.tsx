import { useState } from "react";
import type { ScanReport, IntentRow } from "../../../preload/index";
import { CitationRankCard } from "@mention-network/report-ui";

function Meter({ value, width = 120 }: { value: number | null; width?: number }) {
  return (
    <div className="meter" style={{ width }}>
      <span style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

function IntentBlock({ row }: { row: IntentRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--mn-border-soft)" }}>
      <button className="row-toggle" onClick={() => setOpen(!open)}>
        <span className={`chevron ${open ? "open" : ""}`}>›</span>
        <span style={{ width: 132, textAlign: "left" }}>{row.label}</span>
        {row.mentioned ? <span className="badge success">Mentioned</span> : <span className="badge danger">Not mentioned</span>}
        <span style={{ color: "var(--mn-text-secondary)", fontSize: "var(--mn-text-sm)" }}>{row.coverage}</span>
        <span className="chip">{row.packId === "ecommerce" ? "Essentials" : row.packId} · w{row.weight}</span>
        <div style={{ flex: 1 }} />
        <Meter value={row.visibility} />
        <span style={{ width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {row.visibility !== null ? `${row.visibility}%` : "—"}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 0 14px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
          {row.prompts.map((p) => {
            const firstHit = p.perEngine.find((e) => e.mentioned && e.excerpt);
            return (
              <div key={p.text} className="prompt-line">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "var(--mn-text-sm)", color: "var(--mn-text-primary)" }}>“{p.text}”</span>
                  <span className="chip">{p.tags.branded ? "branded" : "unbranded"}</span>
                  {p.tags.geo !== "none" && <span className="chip">geo: {p.tags.geo}</span>}
                  <div style={{ flex: 1 }} />
                  <span style={{ display: "flex", gap: 4 }}>
                    {p.perEngine.map((e) => (
                      <span key={e.engine} className={`engine-dot ${e.mentioned ? "hit" : "miss"}`} title={`${e.label}: ${e.mentioned ? "mentioned" : "not mentioned"}`}>
                        {e.label[0]}
                      </span>
                    ))}
                  </span>
                </div>
                {firstHit && (
                  <div style={{ fontSize: "var(--mn-text-xs)", color: "var(--mn-text-secondary)", marginTop: 4 }}>
                    {firstHit.label}: <em>{firstHit.excerpt}</em>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ReportPreview({ report, onRestart, onConnect }: { report: ScanReport; onRestart: () => void; onConnect: () => void }) {
  return (
    <div style={{ width: 680, display: "flex", flexDirection: "column", gap: "var(--mn-space-4)", paddingBottom: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--mn-bg-app)",
          padding: "10px 0 12px",
          borderBottom: "1px solid var(--mn-border-soft)",
        }}
      >
        <div>
          <div className="overline">Product AI Visibility Report</div>
          <h1 style={{ fontSize: "var(--mn-text-2xl)", fontWeight: 700, color: "var(--mn-text-strong)" }}>
            {report.store.displayName}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn-primary"
            style={{ background: "var(--mn-brand)", boxShadow: "var(--mn-shadow-button)" }}
            onClick={onConnect}
          >
            Connect site to fix →
          </button>
          <button className="btn-primary" onClick={onRestart}>
            New scan
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {report.packsUsed.map((p) => (
          <span key={p.id} className="chip">
            📦 {p.label} · {p.intents} intents
          </span>
        ))}
        <span className="chip">{report.questionCount} questions × 4 engines</span>
      </div>

      <div className="card" style={{ display: "flex", gap: "var(--mn-space-8)", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 40, fontWeight: 700, color: "var(--mn-brand)" }}>{report.visibilityScore}%</div>
          <div className="overline">Visible</div>
        </div>
        <div>
          <div style={{ fontSize: 40, fontWeight: 700, color: "var(--mn-text-strong)" }}>#{report.avgPosition ?? "—"}</div>
          <div className="overline">Avg. position</div>
        </div>
        <p style={{ flex: 1, fontSize: "var(--mn-text-sm)", color: "var(--mn-text-secondary)" }}>{report.verdict}</p>
      </div>

      <div className="card">
        <div className="overline" style={{ marginBottom: "var(--mn-space-3)" }}>
          Market position — share of AI mentions
        </div>
        {report.marketPosition.map((m, i) => (
          <div
            key={m.rank}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--mn-space-4)",
              padding: "9px 0",
              borderBottom: i < report.marketPosition.length - 1 ? "1px solid var(--mn-border-soft)" : "none",
              background: m.isMine ? "rgba(0, 82, 255, 0.04)" : "transparent",
              borderRadius: m.isMine ? 8 : 0,
              paddingLeft: m.isMine ? 8 : 0,
              paddingRight: m.isMine ? 8 : 0,
            }}
          >
            <span style={{ width: 24, color: "var(--mn-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{m.rank}</span>
            <span style={{ fontWeight: m.isMine ? 600 : 400 }}>{m.retailer}</span>
            {m.isMine && <span className="badge info">Your store</span>}
            <span style={{ color: "var(--mn-text-secondary)", fontSize: "var(--mn-text-sm)" }}>{m.coverage}</span>
            <div style={{ flex: 1 }} />
            <Meter value={m.shareOfVoice * 4} width={100} />
            <span style={{ width: 48, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.shareOfVoice.toFixed(1)}%</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="overline" style={{ marginBottom: "var(--mn-space-3)" }}>
          AI chatbot visibility
        </div>
        {report.perEngine.map((row, i) => (
          <div
            key={row.engine}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--mn-space-4)",
              padding: "10px 0",
              borderBottom: i < report.perEngine.length - 1 ? "1px solid var(--mn-border-soft)" : "none",
            }}
          >
            <span style={{ width: 140 }}>{row.label}</span>
            {row.mentioned ? <span className="badge success">Mentioned</span> : <span className="badge danger">Not mentioned</span>}
            <div style={{ flex: 1 }} />
            <Meter value={row.visibility} />
            <span style={{ width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {row.visibility !== null ? `${row.visibility}%` : "—"}
            </span>
            <span style={{ width: 32, textAlign: "right", color: "var(--mn-text-secondary)" }}>
              {row.rank !== null ? `#${row.rank}` : "—"}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="overline" style={{ marginBottom: "var(--mn-space-2)" }}>
          Which buying questions you win — click to see the actual prompts
        </div>
        {report.perIntent.map((row) => (
          <IntentBlock key={row.intent} row={row} />
        ))}
      </div>

      <CitationRankCard domains={report.citationRank} />

      <p style={{ textAlign: "center", fontSize: "var(--mn-text-xs)", color: "var(--mn-text-placeholder)" }}>
        Prompts & weights load from real packs (packages/packs) — AI answers are mocked until the engine lands
      </p>
    </div>
  );
}
