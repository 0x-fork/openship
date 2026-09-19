# Cloud production-path verification — 2026-09-19

Both production builds passed from a clean source snapshot containing the Cloud changes, without local `.env` files. Dependencies were installed with Bun 1.3.3 and `--frozen-lockfile`.

The compiled API and standalone Next.js dashboard ran together in production mode with isolated Postgres and Redis. Two real application users signed in through the dashboard’s API proxy. Oblien HTTP responses and payment events were simulated; no live payment was made.

All 17 runtime checks passed:

- Fresh Postgres database migrated and two customers seeded.
- Compiled API starts in production Cloud mode with Postgres and Redis.
- Standalone dashboard starts with runtime API routing.
- Both customers sign in through the dashboard proxy and read enabled billing with zero free credits.
- Each customer receives a distinct namespace with resource limits.
- Billing SSR succeeds and layout/tab share exactly one state request.
- Checkout uses the authenticated namespace and deployed return URL without granting access early.
- Signed provider event updates only the paid customer; unsigned events are rejected.
- Concurrent billing SSR requests keep the paid and free customers isolated.
- Portal, cancellation and resumption stay scoped to the signed-in customer.
- Top-up checkout reaches Oblien for the correct namespace.
- Billing SSR survives an 11-second upstream response without duplicate work.
- Provider failure renders the recoverable error, not an organization activation message.
- API startup registers an active signed account-wide billing webhook.
- Container readiness checks are read-only, handle masked secrets, and reject confirmed mismatches.
- Compiled API refuses an enabled but incomplete billing configuration before serving requests.
- Built pricing page hydrates in Chromium with live API data and no client exceptions.

An additional 78 API/startup tests and 40 dashboard billing tests passed, as did both application type checks.

A separate read-only check using the local SaaS configuration reached Oblien successfully. Private credentials, the catalog, automatic zero-credit policy, existing namespace allowance and subscription, and active account-wide webhook registration passed. The two purchase flags were disabled in that local configuration. Oblien returned a masked webhook secret, so secret equality was explicitly skipped; this does not verify a signed delivery or the deployed API's environment.

This run used macOS with Node 22 and Postgres 14. The Linux Docker images were not executed because the local Docker daemon was unavailable. The production environment, public webhook delivery, and real payment completion still require verification on the deployed account.

After pushing all required source files, rebuild both API and dashboard from that revision. Keep production credentials in the API runtime environment and enable the purchase flags there. For the root SaaS Compose stack:

```sh
docker compose up -d --build api dashboard
docker compose exec api bun run --cwd apps/api cloud:check
```

See [Cloud launch configuration](openship-cloud-launch.md#enable-purchases-in-the-deployed-saas).
