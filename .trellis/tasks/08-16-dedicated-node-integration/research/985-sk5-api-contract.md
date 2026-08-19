# 985Proxy static residential API findings

Date: 2026-08-16
Source: https://docs.985proxy.com/

## Gateway and authentication

- Production gateway: `https://open-api.985proxy.com`.
- Sandbox gateway: `https://sandbox-open-api.985proxy.com`.
- Requests use the account `apikey` header and JSON for POST bodies.
- The API documentation states that UTC is the service timezone and that `code=0` is success. Any other code is an upstream failure, not an empty result.

## Relevant static endpoints

- Inventory: `POST /res_static/inventory`.
- Price preview: `POST /res_static/calculate`.
- Purchase: `POST /res_static/buy`.
- Result query: `POST /res_static/order_result`.
- IP list/detail endpoints are preferred for new operational reads; the result page explicitly warns against relying on old order data for long-term reads.

## Request/response implications

- Price and purchase bodies use `static_proxy_type`, `time_period`, and `buy_data[]` with `country`, `city`, and `count`.
- Purchase results can be asynchronous. An order result can report `success_node_count=0` while the order is still pending and individual node `ip`, `port`, credentials, and expiry are null.
- The adapter must therefore model `PENDING` separately from `COMPLETED`, poll with a bounded retry policy, and persist the upstream order number before any retry.
- Inventory freshness must be checked immediately before the purchase call. A local stale snapshot may not authorize a purchase.
- The SK5/dedicated SKU gate must reject before invoking `/res_static/buy`; the purchase call counter in the out-of-stock test must remain zero.

## Current code alignment

`apps/api/src/modules/providers/adapters/nine-eight-five.adapter.ts` already maps the static inventory, buy, and order-result envelopes, but its inventory model is generic residential inventory. Dedicated SK5 must add a dedicated resource/profile and reservation gate rather than reusing static proxy fulfillment or treating an empty list as success.

## Operational evidence

The following official documentation pages were inspected:

- Overview: https://docs.985proxy.com/
- Business list: https://docs.985proxy.com/414120986e0
- Price calculation: https://docs.985proxy.com/414122338e0
- Order result: https://docs.985proxy.com/414122933e0
- IP list: https://docs.985proxy.com/414119981e0

No API key, app secret, VPS password, or customer credential is recorded in this artifact.
