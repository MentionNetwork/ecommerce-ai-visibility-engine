# Engine Catalog — how AI engines are declared and extended

> **Status:** design note — how AI engines are declared and extended.

How the engine knows about ChatGPT / Claude / Gemini / Google AI Mode, and how a user adds another LLM. The guiding rule: **AI engines are catalog data, never a hardcoded enum.** From `@mention-network/shared`:

```ts
/** AI engines are catalog data — never an enum. */
export type EngineId = string;
```

The core engine never references a specific model. It iterates over whatever the active sampling provider reports it can sample.

---

## Three layers

| Layer | Where | Declares |
|---|---|---|
| **1. Catalog** (metadata) | `registry` repo → `engines.json` (data, no code) | `id`, `label`, `logo`, `marketWeight`, `backend` — *which engines exist and how to display them* |
| **2. Provider** (real backend) | `packages/providers/*`, exposed via `SamplingProviderPort.capabilities()` | *which engines this provider can sample, and how to call each* — e.g. byok-openrouter maps `chatgpt → openai/gpt-4o` |
| **3. Engine core** | `packages/engine` | **nothing engine-specific** — it loops over whatever `capabilities()` returns |

The runtime source of truth is the **active provider's `capabilities()`**. The core asks "what can you sample?" and the provider answers. The core does not know ChatGPT from Claude.

```ts
interface EngineCapability {
  engine: EngineId;              // "chatgpt"
  backend: "api" | "browser";   // decides whether a user can self-add it (see below)
  geos: string[];
  languages: string[];
}
```

> ⚠️ **Current state (2026-07-06):** both providers (`byok-openrouter`, `mention-cloud`) are stubs (`export const TODO`). The only concrete engine list today is the **mock** in `apps/desktop/src/main/engine-host.ts` (`chatgpt, google-ai-mode, gemini, claude`). That is temporary demo data, **not** the real declaration point. When the real providers land, the list must be catalog/config-driven (see Open items).

---

## Adding an engine

Yes, users can add other LLMs — that is the point of catalog-not-enum. There are two cases, split by `backend`.

### Type A — the LLM has an API (routed through OpenRouter)

Covers most models: GPT, Claude, Gemini, Llama, Mistral, DeepSeek, Grok, Qwen… Adding one is a **config entry**, not code — a mapping from an engine id to an OpenRouter model slug:

```jsonc
// engine catalog entry (registry) / provider config
{ "id": "deepseek", "label": "DeepSeek", "backend": "api", "model": "deepseek/deepseek-chat" }
```

The provider's `capabilities()` reads this and surfaces the new engine. No release required — this is the README promise: *"New LLMs land as config entries, not releases."*

### Type B — the LLM/surface has no API (Google AI Mode, AI Overviews)

These are embedded in search and have no callable endpoint. They can only be sampled by a **browser adapter** (`backend: "browser"` — Playwright + residential proxy), which lives in the `mention-cloud` provider. A BYOK self-hoster cannot add these with a config line; it needs the browser adapter. So Type B engines are **gated to Cloud** (or an advanced self-host that writes its own browser adapter).

---

## Runtime resolution flow

```
registry engines.json  ─┐
                        ├─►  provider config  ──►  provider.capabilities()  ──►  engine core
provider model mappings ─┘        (which ids,            (EngineCapability[])      (loops, agnostic)
                                   which models)
report-ui reads label + logo from the catalog for display
```

- **Catalog** answers "what exists / how to show it."
- **Provider** answers "can I sample it, and how."
- An engine is *usable* only when both agree: it's in the catalog AND a live provider reports it in `capabilities()`.

---

## Open items (decide when building the real providers)

1. **`byok-openrouter` must be config-driven** — its engine→model map reads from the registry catalog or a local config/env, never a hardcoded array. "Add an engine = edit code" would break the design.
2. **Replace the mock hardcode** — `apps/desktop/src/main/engine-host.ts` should read the catalog instead of the inline `ENGINES` array.
3. **Catalog entry schema** — formalize `{ id, label, logo, backend, model?, marketWeight? }` (a JSON schema in the `registry` repo, like the pack schema). `model` required for `backend: "api"`, absent for `backend: "browser"`.
4. **Community engines** — a user-supplied catalog entry (Type A) should be loadable without forking, mirroring how community packs/connectors work via the registry.
