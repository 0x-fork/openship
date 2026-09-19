# Cloud production-path verification — 2026-09-19

## Release status: live hosted checkout is blocked

A direct check with the supplied staging credentials reached Oblien successfully
but `POST https://api.oblien.com/billing/checkout` returned HTTP 400:

```json
{
  "success": false,
  "error": "ER_CANT_AGGREGATE_NCOLLATIONS",
  "code": "ER_CANT_AGGREGATE_NCOLLATIONS",
  "message": "Failed to create subscription checkout"
}
```

The failure reproduced for the full Openship Hobby/monthly request and a minimal
documented Pro request containing only `namespace`, `kind: "subscription"`, and
`planTierId: "pro"`. The latter used direct HTTP without the SDK, return URLs, or
an idempotency key. No checkout URL was returned and no payment was attempted.
The disposable namespace was not created: this staging key's create request
separately returned `namespace_limit_exceeded`. Checkout permits an absent
namespace under the documented contract; no existing customer was used for this
probe. These results do not verify the deployed production account.

Oblien must inspect the failing SQL statement and fix its incompatible string
collations before hosted checkout can pass. Openship now records the upstream
operation, HTTP status, and bounded error code without logging credentials,
customer namespaces, SQL, or provider messages. Provider SQL failures are mapped
to HTTP 503; checkout returns `OBLIEN_CHECKOUT_UNAVAILABLE`. This behavior was
confirmed against the live failure through the updated wrapper. The error
handling passed 66 targeted billing tests, API type checking, and the production
API build.

The simulated application checks below remain useful regression coverage. They
do not establish live checkout or payment readiness. Re-test hosted checkout,
payment, and signed webhook delivery on the intended account after the provider
fix.

## Application verification with a simulated provider

Both production builds passed from a clean source snapshot containing the Cloud billing and onboarding changes, without local `.env` files. Dependencies were installed with Bun 1.3.3 and `--frozen-lockfile`. This update requires rebuilding and deploying both API and dashboard.

The compiled API and standalone Next.js dashboard ran together in production mode with isolated Postgres and Redis. Two real application users signed in through the dashboard’s API proxy. Oblien HTTP responses and payment events were simulated; no live payment was made.

All 27 runtime and browser checks passed:

- Fresh Postgres database migrated and two customers seeded.
- Compiled API starts in production Cloud mode with Postgres and Redis.
- Standalone dashboard starts with runtime API routing.
- Both customers sign in through the dashboard proxy and read enabled billing with zero free credits.
- Each customer receives a distinct namespace with resource limits.
- A customer without a paid plan cannot buy unusable top-up credits.
- Billing SSR succeeds and layout/tab share exactly one state request.
- Checkout uses the authenticated namespace and deployed return URL without granting access early.
- Paid billing remains available when workspace resource operations fail.
- Signed provider event updates only the paid customer; unsigned events are rejected.
- Concurrent billing SSR requests keep the paid and free customers isolated.
- Portal, cancellation and resumption stay scoped to the signed-in customer.
- Top-up checkout reaches Oblien for the correct namespace.
- Existing-customer checkout remains available when workspace resource operations fail.
- Billing SSR survives an 11-second upstream response without duplicate work.
- Provider failure renders the recoverable error, not an organization activation message.
- API startup registers an active signed account-wide billing webhook.
- Container readiness checks are read-only, handle masked secrets, and reject confirmed mismatches.
- Compiled API refuses an enabled but incomplete billing configuration before serving requests.
- Paid overview, measured usage units, and monthly/yearly plans hydrate against the compiled API.
- A customer without a plan sees zero included credits and a subscription offer on the right, including with a legacy null credit policy.
- Mobile billing fills the viewport, keeps Subscribe above the fold, and restores focus when its navigation drawer closes.
- Every unpaid billing tab offers a useful next step without requesting an unavailable portal or top-up checkout.
- Arabic billing renders in RTL at desktop and mobile widths.
- The subscription offer opens hosted checkout for the signed-in customer's namespace without granting credits before payment.
- All billing views complete without browser exceptions.
- No reseller workspace-quota calls occur across onboarding, billing, checkout, or webhooks.

An additional 189 API billing, provider-contract, preflight, and deployment/service quota tests and 61 dashboard billing/localization tests passed. Both application type checks passed. Tests cover missing catalog data, explicit enterprise unlimited entitlements, purchased-credit history, subscription requirements for top-ups, and pricing appearing only after an explicit deployment action.

A separate read-only check against Oblien confirmed the staging account's automatic defaults: `quotaLimit=0`, `overdraft=0`, `suspendThreshold=0`, `autoApply=true`, and `onOverdraftAction=stop_workspaces`. Public catalog prices and credit allowances supplied the browser fixtures. No account defaults, existing namespace balances, or live subscriptions were changed.

Earlier read-only checks also verified private credential access, an existing namespace's allowance and subscription, and an active account-wide webhook registration. The two purchase flags were disabled in that local configuration. Oblien returned a masked webhook secret, so secret equality was explicitly skipped; this does not verify a signed delivery or the deployed API's environment.

This run used macOS with Node 22 and Postgres 14. The Linux Docker images were not executed because the local Docker daemon was unavailable. The production environment, public webhook delivery, and real payment completion still require verification on the deployed account.

After pushing all required source files, rebuild both API and dashboard from that revision. Keep production credentials in the API runtime environment and enable the purchase flags there. For the root SaaS Compose stack:

```sh
docker compose up -d --build api dashboard
docker compose exec api bun run --cwd apps/api cloud:check
```

See [Cloud launch configuration](openship-cloud-launch.md#enable-purchases-in-the-deployed-saas).

## Earlier follow-up: unlimited reseller accounts

Removed the reseller `/workspace/quota` dependency from namespace onboarding,
resource-policy synchronization, and deployment preflight. Customer ceilings come
from their Openship plan; Oblien owns platform capacity. Billing, checkout, and
plan reads no longer write workspace resource policies. Token issuance, spending,
and webhook synchronization still enforce customer ceilings and credit policy.
Billing and subscription checkout reuse the verified subscription instead of
fetching it twice.

The rebuilt production API passed 20 integration checks with the standalone
dashboard, isolated Postgres and Redis, and simulated Oblien HTTP responses.
The provider fixture returned unlimited reseller quotas and deliberately failed
workspace-management endpoints while paid billing and checkout continued to work.
No reseller workspace-quota requests occurred during onboarding, billing,
checkout, or webhook handling. Free and paid customer isolation, signed webhooks,
portal access, cancellation/resumption, and delayed billing reads also passed.

All 170 targeted billing, provider-contract, preflight, and deployment/service
quota tests passed, along with API type checking and the production API build.
The capacity fix alone required only an API deployment. The subsequent customer
billing changes verified above require both API and dashboard deployments.
Production deployment and live payment completion were not performed in this
verification.
