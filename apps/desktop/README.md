# apps/desktop — Mention Network macOS app

Electron app: URL-first onboarding → mock scan → report preview, styled with MN design tokens (`@mention-network/report-ui/tokens.css`).

## Run

```bash
pnpm install
pnpm --filter @mention-network/desktop dev     # dev with HMR
pnpm --filter @mention-network/desktop build && npx electron apps/desktop
```

## Architecture

- `src/main/` — BrowserWindow + IPC bridge; spawns the engine host
- `src/main/engine-host.ts` — runs in a **utilityProcess** (crash-safe, non-blocking). Currently MOCK-FIRST: URL-pattern detect + MockSamplingProvider + KBeauty fixture report. The real engine plugs in behind the same messages.
- `src/preload/` — contextBridge, typed `window.mn` API
- `src/renderer/` — React, follows the frontend template conventions; all styling via design tokens, no hardcoded colors

Coming next: Keychain (safeStorage) for BYOK/Cloud keys, SQLite storage, resume-able scans, PDF export via printToPDF, auto-update → desktop-releases.
