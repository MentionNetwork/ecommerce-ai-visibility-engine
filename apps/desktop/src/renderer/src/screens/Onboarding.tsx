import { useState } from "react";
import type { StoreDetection } from "../../../preload/index";

const PLATFORM_LABEL: Record<StoreDetection["platform"], string> = {
  shopify: "Shopify store",
  woocommerce: "WooCommerce store",
  marketplace: "Marketplace store",
  custom: "Online store",
};

export function Onboarding({ onStart }: { onStart: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<StoreDetection | null>(null);

  const handleDetect = async () => {
    if (!url.trim()) return;
    setDetecting(true);
    setDetected(await window.mn.detect(url));
    setDetecting(false);
  };

  return (
    <div style={{ width: 520, display: "flex", flexDirection: "column", gap: "var(--mn-space-5)" }}>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "var(--mn-space-2)" }}>
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            margin: "0 auto",
            borderRadius: 10,
            background: "linear-gradient(135deg, var(--mn-brand) 60%, var(--mn-brand-accent))",
          }}
        />
        <h1 style={{ fontSize: "var(--mn-text-2xl)", fontWeight: 700, color: "var(--mn-text-strong)" }}>
          See how AI sells your products
        </h1>
        <p style={{ color: "var(--mn-text-secondary)", fontSize: "var(--mn-text-sm)" }}>
          Paste your store URL — we&apos;ll check how visible your products are in AI answers.
        </p>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--mn-space-3)" }}>
        <div style={{ display: "flex", gap: "var(--mn-space-2)" }}>
          <input
            className="input"
            placeholder="kbeautyarabia.com, yourstore.myshopify.com, shopee.vn/yourshop"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setDetected(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && void handleDetect()}
            autoFocus
          />
          <button className="btn-primary" onClick={() => void handleDetect()} disabled={detecting || !url.trim()}>
            {detecting ? "Detecting…" : "Check"}
          </button>
        </div>

        {detected && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--mn-space-3)" }}>
            <span className="badge info">{PLATFORM_LABEL[detected.platform]}</span>
            <span style={{ fontSize: "var(--mn-text-sm)", color: "var(--mn-text-secondary)", flex: 1 }}>
              {detected.displayName}
            </span>
            <button className="btn-primary" onClick={() => onStart(url)}>
              Run diagnosis
            </button>
          </div>
        )}
      </div>

      <p style={{ textAlign: "center", fontSize: "var(--mn-text-xs)", color: "var(--mn-text-placeholder)" }}>
        Free diagnosis · bring your own OpenRouter key or connect Mention Cloud
      </p>
    </div>
  );
}
