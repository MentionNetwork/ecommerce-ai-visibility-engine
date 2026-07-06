# connector-woocommerce (placeholder)

Two halves: a **WooCommerce extension** (PHP, distributed via wordpress.org / the WooCommerce marketplace — GPLv2 per WordPress rules) and this TS connector implementing `SiteConnector`.

It reads product facts (title, price, variants, stock) via the WooCommerce REST API and applies fixes (schema, meta, content) back to the store. Auth is a WooCommerce REST API key pair (consumer key + secret), not a plain WordPress login.
