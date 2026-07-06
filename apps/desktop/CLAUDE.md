# apps/desktop — conventions

Electron macOS app. Structure follows lab3-ai/Codebase-Template adapted for desktop:
- `src/renderer/` follows the frontend template: `components/{ui,layout}`, `screens/`, `hooks/`, styles use MN design tokens (`@mention-network/report-ui/tokens.css`) — never hardcode colors.
- `src/main/` + `src/main/engine-host.ts` follow backend module discipline: engine work runs in a utilityProcess, never in main or renderer.
- IPC: renderer → preload (contextBridge, typed `window.mn`) → main → engine-host (MessagePort). No Node in renderer.
- Mock-first: engine-host currently serves MockSamplingProvider + KBeauty fixtures; the real engine plugs in via the same SamplingProviderPort without touching the renderer.
- Files kebab-case, components PascalCase, conventional commits.
