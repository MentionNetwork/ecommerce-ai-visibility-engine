/**
 * CitationRankCard — ported from mention-platform-frontend
 * features/report/components/citations/CitationRank.tsx.
 *
 * Kept: semantics (domains ranked by citation count; show top 5 + your store
 * if it ranks below 5; badge by domain type) and layout rhythm.
 * Changed: props-in (no react-query/stores/i18n), styling via MN design tokens
 * only (inline, no Tailwind), so it renders identically in web, desktop, and PDF.
 */
import type { CSSProperties } from "react";

export type CitationDomainType = "your_store" | "competitor" | "third_party";

export interface CitationDomain {
  rank: number;
  domain: string;
  count: number;
  type: CitationDomainType;
}

export interface CitationRankCardProps {
  title?: string;
  description?: string;
  domains: CitationDomain[];
  /** Max rows before collapsing to top-5 + your store (production behavior). */
  maxRows?: number;
}

const BADGE: Record<CitationDomainType, { label: string; bg: string; fg: string }> = {
  your_store: { label: "Your store", bg: "var(--mn-info-bg)", fg: "var(--mn-info-fg)" },
  competitor: { label: "Competitor", bg: "var(--mn-danger-bg)", fg: "var(--mn-danger-fg)" },
  third_party: { label: "Third party", bg: "var(--mn-bg-subtle)", fg: "var(--mn-text-secondary)" },
};

const card: CSSProperties = {
  background: "var(--mn-bg-surface)",
  border: "1px solid var(--mn-border-card)",
  borderRadius: "var(--mn-radius-md)",
  boxShadow: "var(--mn-shadow-card)",
  padding: "var(--mn-space-6)",
  fontFamily: "var(--mn-font)",
};

export function CitationRankCard({
  title = "Citation rank",
  description = "Domains AI engines cite most when answering — where trust actually lives",
  domains,
  maxRows = 5,
}: CitationRankCardProps) {
  const you = domains.find((d) => d.type === "your_store");
  const rows =
    you && you.rank > maxRows
      ? [...domains.slice(0, maxRows), you]
      : domains.slice(0, maxRows + 1);
  const maxCount = Math.max(1, ...rows.map((d) => d.count));

  return (
    <section style={card}>
      <div
        style={{
          fontSize: "var(--mn-text-2xs)",
          fontWeight: 600,
          letterSpacing: "0.4px",
          textTransform: "uppercase",
          color: "var(--mn-text-overline)",
        }}
      >
        {title}
      </div>
      <p style={{ fontSize: "var(--mn-text-sm)", color: "var(--mn-text-secondary)", margin: "4px 0 14px" }}>
        {description}
      </p>

      {rows.length === 0 && (
        <p style={{ fontSize: "var(--mn-text-sm)", color: "var(--mn-text-placeholder)" }}>No citations found yet.</p>
      )}

      {rows.map((d, i) => {
        const badge = BADGE[d.type];
        const gap = you && you.rank > maxRows && i === rows.length - 1;
        return (
          <div
            key={d.domain}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--mn-space-4)",
              padding: "9px 0",
              borderTop: gap ? "1px dashed var(--mn-border)" : i > 0 ? "1px solid var(--mn-border-soft)" : "none",
              background: d.type === "your_store" ? "rgba(0, 82, 255, 0.04)" : "transparent",
              borderRadius: d.type === "your_store" ? 8 : 0,
              paddingLeft: d.type === "your_store" ? 8 : 0,
              paddingRight: d.type === "your_store" ? 8 : 0,
            }}
          >
            <span
              style={{
                width: 24,
                color: "var(--mn-text-secondary)",
                fontVariantNumeric: "tabular-nums",
                fontSize: "var(--mn-text-sm)",
              }}
            >
              {d.rank}
            </span>
            <span
              style={{
                fontWeight: d.type === "your_store" ? 600 : 400,
                fontSize: "var(--mn-text-base)",
                color: "var(--mn-text-primary)",
              }}
            >
              {d.domain}
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "var(--mn-radius-pill)",
                fontSize: "var(--mn-text-2xs)",
                fontWeight: 500,
                background: badge.bg,
                color: badge.fg,
                whiteSpace: "nowrap",
              }}
            >
              {badge.label}
            </span>
            <div style={{ flex: 1 }} />
            <div
              style={{
                width: 110,
                height: 8,
                borderRadius: "var(--mn-radius-pill)",
                background: "var(--mn-chart-track)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.round((d.count / maxCount) * 100)}%`,
                  height: "100%",
                  borderRadius: "var(--mn-radius-pill)",
                  background: "var(--mn-chart-fill)",
                }}
              />
            </div>
            <span
              style={{
                width: 40,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                fontSize: "var(--mn-text-sm)",
                color: "var(--mn-text-primary)",
              }}
            >
              {d.count}
            </span>
          </div>
        );
      })}
    </section>
  );
}
