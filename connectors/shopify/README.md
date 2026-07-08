# connector-shopify (placeholder)

The official Shopify connector is **promoted from the battle-tested connector layer of the commercial Mention Network Shopify App** once the connector-sdk contract stabilizes — not written from scratch. It will then move to its own repository (`MentionNetwork/connector-shopify`).

Note on naming: on Shopify this ships inside a Shopify **App**; "connector" is the engine-side artifact.

## Read-surface checklist (what the App's connector layer should expose)

From the Admin API: `getProduct` / `listProducts` (products, variants, prices, stock), `getMetafields` (specs/attributes), `listCollections` (internal linking), `getShippingSettings` (free-shipping threshold and zones), `getRelatedProducts` (recommendations). From the Merchant API: `getMerchantFeedStatus` (shopping-feed listing). Plus `getPage` for served product HTML.

## How the engine consumes it

Through [`@mention-network/connector-bridge`](../../packages/connector-bridge) — see [docs/design/connector-integration.md](../../docs/design/connector-integration.md):

```ts
const facts   = productFactsFromConnector(shopifyConnector, session);   // → ProductFactsPort
const fetcher = pageFetcherFromConnector(shopifyConnector, session, httpFetcher); // → PageFetcherPort
const runner  = prescriptionRunner(shopifyConnector, session);          // plan → dry-run → apply → rollback
```
