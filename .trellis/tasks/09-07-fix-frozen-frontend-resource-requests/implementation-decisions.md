# Implementation Decisions

## Manual recharge

- Keep the customer recharge surface, but expose only manual approval.
- The frozen deployment copy submits `POST /api/v1/billing/recharge`.
- The compatibility boundary delegates to the canonical payment-order use case and creates a real `PENDING` order.
- Alipay, WeChat Pay, USDT, gateway initiation, polling, and gateway status UI are removed from the deployment copy.
- Wallet credit is owned by the canonical administrator confirmation use case; the compatibility controller must not mutate the wallet directly.

## Unsupported historical resources

- Referral and API-app resources have no canonical source of truth and must not return fabricated empty data.
- Remove their navigation and requests from the frozen deployment copy. If called directly, return a typed unsupported-capability error.
- Existing canonical API keys may be projected through `/api/v1/users/me/api-key`; do not invent an `api_apps` model.

## Frontend boundary

- Do not modify `apps/web/**` or the recovered source bundle.
- Modify only the generated Zeabur deployment copy under `.tmp/`, preserving the Vite lazy-import graph and same-origin `/api/v1` base.
