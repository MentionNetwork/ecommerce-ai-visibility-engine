/**
 * Typed mirror of tokens.css — for chart configs, Electron windows, printToPDF
 * styling, and anywhere CSS variables can't reach. Keep both files in sync.
 * Provenance: see tokens.css header.
 */
export const tokens = {
  brand: "#0052ff",
  brandAccent: "#5de1f6",
  focusRing: "rgba(0, 82, 255, 0.15)",

  text: {
    strong: "#1a1d21",
    primary: "#303030",
    secondary: "#616161",
    placeholder: "#8a8a8a",
    overline: "#98a1a9",
    inverse: "#ffffff",
  },

  bg: {
    app: "#f6f6f7",
    surface: "#ffffff",
    subtle: "#f1f1f1",
    muted: "#f6f8fb",
  },

  border: {
    default: "#e3e3e3",
    soft: "#ebebeb",
    card: "#e6ecf2",
    divider: "#f0f2f5",
  },

  action: { default: "#303030", hover: "#3d3d3d" },

  status: {
    success: { bg: "#cdfed4", fg: "#014b40" },
    info: { bg: "#eaf4ff", fg: "#003a5a" },
    danger: { bg: "#fee2e1", fg: "#8e1f0b" }, // TODO: verify against .pen
  },

  chart: { fill: "#0052ff", track: "#e3e8ef" },

  font: {
    family: '"Inter", -apple-system, "Segoe UI", system-ui, sans-serif',
    size: { "3xl": 30, "2xl": 24, base: 14, sm: 13, xs: 12, "2xs": 11 },
  },

  radius: { sm: 8, md: 12, lg: 16, pill: 999 },

  shadow: {
    card: "0 1px 3px rgba(0, 0, 0, 0.05)",
    button: "0 1px 1px rgba(0, 0, 0, 0.15)",
    dropdown: "0 4px 12px rgba(0, 0, 0, 0.08)",
    modal: "0 12px 32px rgba(0, 0, 0, 0.18)",
  },

  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
} as const;

export type Tokens = typeof tokens;
