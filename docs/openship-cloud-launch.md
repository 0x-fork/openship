# Openship Cloud release gate

Cloud uses Oblien Mode B. Oblien owns hosted checkout, payment collection,
subscription renewals, credit grants, usage enforcement, and workspace lifecycle.
Openship owns customer identity, project/build orchestration, application
permissions, and the dashboard. It calls the provider APIs for infrastructure;
it does not operate a hypervisor or maintain an independent payment ledger.

The Docker deployment path passed 31 live staging checks on 2026-09-17, including
rollback, volume restore, cold restart, HTTPS and resource cleanup. After Oblien's
billing fixes, fresh namespace defaults, subscription ownership, Docker metering,
usage-driven exhaustion, automatic billing shutdown, manual suspension and
customer isolation pass live checks. The customer cycle is **not ready to
launch**: this key still cannot register `opsh.io` routes. Signup → payment →
public webhook also remains unverified.
The final two-customer isolation/lifecycle run passed all 52 checks at 04:31 UTC.
See [the current provider test report](./oblien-staging-cycle-report.md). Keep
public purchases disabled until these checks pass.

## What is connected

- `oblien@2.3.2` supplies the official billing module. Openship validates the
  returned namespace, subscription shape, hosted URL, and agreement between the
  namespace subscription and its entitlement. Its JSON transport rejects
  credential redirects, bounds request time, checks both HTTP and body failures,
  preserves SDK request cancellation, and keeps provider error bodies private.
  Workspace limits now return HTTP 409 in the live API; compatibility handling
  also rejects the older HTTP 200 `valid:false / NAMESPACE_LIMIT_REACHED` response.
- Public prices and credit packs come from `/billing/catalog`. Marketing and
  the dashboard use the same catalog as checkout. Internal plan IDs remain
  stable: `starter → hobby`, `pro → pro`, `team → scale`.
- Purchases use `/billing/checkout` with the authenticated organization's
  namespace, the selected interval, and a scoped idempotency key. Checkout first
  requires the new namespace subscription API, so older provider deployments
  cannot silently fall back to shared customer billing.
- The namespace portal provides invoices, payment methods, and cancellation.
  Customers can also cancel or resume renewal from Overview. Both actions are
  repeatable; cancellation preserves the paid period. They remain available
  when new purchases are disabled. Portal/cancel/resume require `billing:admin`.
- Paid plan/interval changes use a replacement checkout. Oblien starts a new
  full-price cycle after payment without automatic proration. The dashboard
  discloses these terms, displays scheduled cancellation, and supports yearly
  plans and resubscribing after an ended subscription.
- Signed Oblien events trigger a fresh entitlement read. The browser return URL
  never grants access. Failed synchronization returns 503 for retry; repeated
  deliveries are deduplicated. A five-minute reconciliation job repairs missed
  events without resetting quotas or granting credits.
- Every customer runtime uses a namespace token and explicitly supplies the
  namespace on workspace creation. Namespace ownership is immutable and unique
  in the database. Admin-only Pages/routing operations check every referenced
  resource's namespace on the SaaS, including desktop/self-hosted calls.
- New billable work requires a current entitlement and usable provider balance.
  Openship does not apply the spend gate before Stop/Delete. Scoped inspection,
  repeated Stop and Delete pass during billing and manual suspension. Accepted
  asynchronous workspace deletions are confirmed before completing local
  teardown; failed inspection or timeout leaves cleanup retryable.
- New namespaces get explicit resource ceilings. Verified active entitlements
  synchronize those ceilings with the plan and the reseller account's capacity,
  without changing credits or usage. Builds, updates, rollbacks and direct
  Start/Restart and project resume check the actual CPU/RAM allocation and service
  allowance before starting containers. Service deployments record the applied
  limits for their exact container identity; a stopped Cloud Docker host can use
  that record without booting for inspection. Missing legacy allocations require
  inspection on a reachable host or redeployment. Editing future resource settings
  does not change the allocation of an existing container.
- Organization locks serialize project creation, service creation/enabling,
  and deployment reservations. Native apps and Compose containers share the
  service allowance; redeploying an existing app does not count it twice.
  Disabling a service definition does not release its slot while its active
  container remains. Unlimited project plans retain their advertised allowance.
- Route removal calls the provider APIs and certificate status comes from the
  provider. Compose volumes persist inside the project's Docker workspace;
  unsupported mounts on legacy native workspaces fail before deployment.
- The direct Stripe webhook returns 410. The old automatic quota-grant/reset
  functions refuse execution. Historical billing rows are retained for migration.

## Compose on Docker workspaces, 2026-09-17

Oblien's live image catalog now includes `oblien/docker:29` (`id: docker`,
label: Docker + Compose). The entry advertises Docker Engine 29 running at boot,
Compose, Buildx/BuildKit, and persistent containers and volumes. Its current
`vm_defaults` are 2 vCPUs, 4096 MiB RAM, 32768 MiB disk, a Docker-capable kernel,
and a `docker-ready` readiness check. These are catalog defaults, not verified
minimum resource requirements. Openship now uses the published SDK 2.3.2.

New Compose and multi-application projects now use this model:

| Project | Execution |
| --- | --- |
| Compose stack | One permanent Docker workspace per project and environment; services run as containers within it |
| Single application | Native Cloud application workspace |
| Additional service on an explicitly single-application project | Native service workspace |
| Static site | Oblien Pages |

Keep the Compose workspace across application redeploys so its named volumes
survive container replacement. Production, staging, and previews use separate
workspace bindings, even when billed under the same customer namespace. Services
within one workspace share its resource capacity and failure boundary; container
limits still need to fit the workspace allocation.

Migration `0132_cloud_docker_workspace.sql` persists the project/namespace/VM
binding. Provisioning reserves an idempotency key before creating the VM and
records its ID before waiting for readiness. Retries reconnect to that disk;
they never replace a missing workspace with an empty one. The workspace becomes
permanent before customer containers or volumes are written. Allocations grow
when service limits and build headroom require it; applying a growth restarts
the VM, so the deploy restores previously running containers afterwards.

`CloudDockerRuntime` connects the existing Docker adapter through Oblien's
authenticated runtime proxy. Its bridge listens only on workspace loopback.
Builds, pulls and generated configuration files execute in that workspace.
Service controls, logs, monitoring, terminal and volume backup/restore address
Docker container IDs. The VM identity remains separate in deployment metadata.
Static sub-apps in a stack run as containers; independent static sites retain
Oblien Pages.

Only selected public endpoints and explicit composite-routing ports are
published on the host. Each receives a distinct, stable host port; private
services communicate over Docker DNS. An owned Page anchors each free or custom
hostname, and Oblien edge routes proxy to the VM's published port. Live routing
edits assemble the whole table before replacing it, including internal API paths
and multi-service path routing. Custom-domain ownership and multi-host routing
are covered internally; live TLS was tested with `preview.oblien.com`.

Named volumes, image-declared volumes and writable relative binds retain their
identity across redeploys. Rollback recreates containers from retained images
and frozen configuration. Retention removes containers/images, preserving the
shared workspace and data. Project teardown inventories routing Pages, including
disabled ones, and deletes the VM only after route cleanup succeeds. Monitoring
does not start a stopped VM; explicit Start or Deploy resumes it.

Existing native Cloud deployments keep `CloudComposeSupport` and their original
workspace IDs. They are not migrated implicitly. Moving a shared Docker project
to another billing organization or back to a self-hosted instance requires a
separate data migration; transfer fails before local records are deleted.

The live staging test used the newly supplied test credentials and an isolated
namespace with finite test credit and resource limits. All 31 checks passed:
provider idempotency, workspace permanence, authenticated Docker access, binary
command streams, two image builds, internal DNS, two public ports, logs/usage,
volume archive and restore, redeploy, image rollback, image retention, individual
service stop/start, whole-VM stop/start, and Page/workspace/namespace cleanup.
The disposable resources were deleted. This did not exercise a paid checkout.

Run from the repository root with a confirmed staging credential file:

```sh
bun packages/adapters/scripts/verify-cloud-docker.ts \
  --staging-env /path/to/staging.env \
  --public-domain preview.oblien.com
```

The script records a private resource manifest and check report, grants finite
credit only to its new namespace, and cleans up in `finally`. Its temporary VM
also has an expiry. It does not change account defaults or existing customers.

Sources: [live image API](https://oblien.com/docs/api/images),
[workspace creation](https://oblien.com/docs/api/workspaces), and the authenticated
`GET /workspace/images?search=docker` catalog response.

## Newly supplied staging key, 2026-09-17

- Default-created namespaces inherit enough capacity for Docker: the provider
  reports per-workspace limits of 32 CPUs, 65536 MiB RAM and 256000 MiB disk.
  The earlier namespace-count and 10 GB disk blockers do not apply to this key.
- New-namespace defaults are now `quotaLimit=0`, `overdraft=0`,
  `suspendThreshold=0`, `autoApply=true`, and `stop_workspaces`. This change affects
  onboarding; existing customer policies and usage were not reset.
- After the provider fixes, both `namespaces.create` and `namespaces.ensure`
  immediately inherit zero-credit policies. Unpaid namespaces return their own
  free/null subscription state and billing period, rather than the account
  owner's plan. Repeating ensure preserves an existing fixture's allowance.
  Openship retains its subscription/entitlement consistency checks.
- Live tests confirm VM/Page isolation, concurrent workspace-cap enforcement,
  CPU/RAM/disk resize ceilings, and actual HTTP 409 limit responses. Docker CPU
  and memory usage now debit namespace credits. Subsequent usage exhausted a
  positive fixture balance and stopped its VM automatically while the other
  customer's VM kept running. Inspection and repeated Stop worked during
  billing suspension. Restoring credit required an explicit Start of the same VM.
- Manual namespace suspension now stops the Docker VM, including after billing
  restoration and an explicit restart. The final 04:31 UTC test passed both
  manual suspensions. Credit increases do not override manual suspension;
  explicit namespace activation and VM Start are required. Scoped Stop and
  Delete work under both suspension types. Earlier failed observations are
  retained as history in the provider report.
- The key cannot register `opsh.io` routes (`403 domain_not_allowed`, rechecked
  at 04:29 UTC). Slug availability returns true but does not establish permission
  to publish. Give the intended account domain access. Preview-domain HTTPS
  works and passed all 31 Docker checks again with SDK 2.3.2 at 03:51 UTC.
- No public staging API origin exists yet. Signed callback handling is tested
  internally. After the API is deployed, use its public HTTPS origin for webhook
  registration and verify a real test-payment delivery before enabling purchases.

## Observed account configuration, 2026-09-15

Checks against the configured credentials, followed by staging default-policy
setup after the user confirmed the account. Billing endpoints and the webhook
registry were rechecked at 20:15 UTC:

| Check | Result |
| --- | --- |
| Oblien authentication/catalog | Reachable; three priced plans and five packs |
| Automatic namespace defaults | Changed from unlimited to `quotaLimit=0`, `overdraft=0`, `suspendThreshold=0`, `autoApply=true` for staging |
| Exhaustion action | `stop_workspaces` |
| Subscription and top-up flags | Both disabled |
| Staging webhook registry | No webhooks registered |
| `.env.local-saas` callback | Needs an explicit public HTTPS callback |
| Account identity | User confirmed `.env.local-saas` is staging/test; `.env.saas` contains the same Oblien credentials |
| New subscription API with staging key | Read returned 200 with the correct namespace for existing and unused namespaces; cancel/resume returned the expected `404 no_subscription` for the unused namespace |
| Portal for an unused staging namespace | Returned the documented `404 no_customer` |

The earlier `401 authentication_required` blocker is resolved. The same staging
key also returned 200 for `/namespaces` and `/billing/defaults`. The read-only
Openship readiness checker passed the SDK-backed catalog, default-policy, and
namespace subscription checks; it still fails for the missing public HTTPS
callback and disabled purchase flags. These probes do not yet verify management
of a paid subscription or a complete payment/webhook cycle. Openship rejects an
unscoped portal response; it never returns the owner's billing session.

That September 15 check created no namespace, token, checkout, workspace, or
payment. Its only configuration write set the staging account's default policy for new
namespaces; existing namespace usage and paid allowances were not reset.
Configure a separate verified production account before launch rather than
assuming the `.env.saas` filename indicates production provider credentials.

## Provider configuration

1. Use confirmed staging credentials for integration tests. The updated
   endpoints accept the earlier staging key and return the documented responses. Confirm Stripe
   checkout is in test mode before completing a test payment. Confirm the
   production account's identity and `max_namespaces` capacity before launch.
2. Configure finite **new-namespace defaults** in the intended Oblien account.
   This was configured for both staging accounts. The September 17 key now
   passes actual create/ensure inheritance checks after the provider fix.
   Verify actual creation in the intended launch account, not only the template.
   The initial policy is payment before compute: zero quota and zero overdraft. A capped
   trial is a separate product decision. Example `PUT /billing/defaults` body:

   ```json
   {
     "autoApply": true,
     "quotaLimit": 0,
     "overdraft": 0,
     "onOverdraftAction": "stop_workspaces",
     "suspendThreshold": 0
   }
   ```

   Review the account this applies to first. Do not apply this default to
   existing paid namespaces or reset their usage. Oblien grants paid allowances
   on successful payment. Openship only validates this configuration.
3. Configure the API process:

   ```dotenv
   CLOUD_MODE=true
   OPENSHIP_TARGET=cloud-saas
   OBLIEN_API_URL=https://api.oblien.com
   OBLIEN_CLIENT_ID=<server-only key>
   OBLIEN_CLIENT_SECRET=<server-only secret>
   OBLIEN_WEBHOOK_SECRET=<shared signing secret>
   # Optional when the deployed runtime API origin is already correct:
   # OBLIEN_WEBHOOK_URL=https://<deployed-api>/api/billing/oblien-webhook
   BILLING_ENABLED=false
   BILLING_TOPUPS_ENABLED=false
   ```

   Use staging origins/credentials for staging. Set `OPENSHIP_CLOUD_API_URL` and
   `OPENSHIP_CLOUD_DASHBOARD_URL` to the actual staging origins so checkout
   returns and the marketing catalog point to staging. The callback defaults to
   the selected runtime's API origin plus `/api/billing/oblien-webhook`; it does
   not require a separate webhook host. If a reverse proxy serves
   the API under a prefix, supply that full path in `OBLIEN_WEBHOOK_URL`.
   Have the Oblien operator add the dashboard return host to
   `REDIRECT_ALLOWED_HOSTS`; unlisted hosts silently return to the provider's
   default dashboard. Verify the actual checkout and portal return destinations.
4. Start the updated API and confirm webhook registration succeeds. The hook
   must be active, signed, account-wide, and include every event exported by
   `oblien-webhook-config.ts`. Confirm real signed delivery reaches the handler;
   registration alone does not prove that routing or the secret is correct.

From `apps/api`, run the read-only checker against the intended environment:

```sh
node --env-file=.env.saas --import tsx scripts/cloud-readiness.ts
```

It also verifies that the namespace's subscription and entitlement agree, and
that a consumer namespace has finite credit. It exits nonzero for failed checks,
including disabled purchase flags. Those
flags should remain disabled in production until the remaining release gates
are satisfied. Enable them in staging when deliberately testing checkout.

## Existing installations

- Back up the database and apply `0127_organization_oblien_namespace.sql` using
  the normal migration runner. Duplicate namespace bindings must be resolved
  explicitly; the migration intentionally refuses to silently merge customers.
- Apply the normal migration sequence through `0132_cloud_docker_workspace.sql`
  before starting API/worker code that deploys Compose on Cloud.
- Inventory existing provider workspaces and Pages against organization/project
  records. Old resources created in the default namespace need an ownership
  migration before exposing them to customers. Creating a new namespace does
  not move an old workspace, its disk, its routes, or its Pages.
- Accounts with live legacy Stripe subscriptions are blocked from new checkout
  to avoid duplicate billing. Migrate/settle those subscriptions explicitly.
- Stop old API/worker versions before switching billing authority. The updated
  recurring job replaces the old anniversary-reset entry, but an old process
  still executing old code must not be allowed to grant/reset quotas.
- Check Redis/job-runner configuration for multiple API replicas. Folder upload
  sessions currently use process memory and need instance affinity; a restart
  invalidates the upload session, with provider TTL as resource cleanup.

## Customer billing contract and remaining release checks

The updated billing contract requires a namespace for the portal and returns it
in the response. Each namespace has its own Stripe customer. A legacy shared
customer returns `409 billing_customer_conflict`; an inconsistent subscription
identity returns `409 billing_identity_conflict`. Neither is bypassed in Openship.

- Authentication and empty-namespace responses are verified against staging.
  Test two customer portals, invoice/payment isolation, cancellation, resumption,
  and plan replacement with paid test subscriptions.
  `GET /billing/subscription` exposes the provider's actual interval, period,
  and pending cancellation; this metadata is read live rather than inferred
  from the entitlement's status.
- Cloud organization deletion is blocked before local ownership is erased.
  Support must coordinate provider billing closure and resource removal. The
  old hook that tried to cancel Stripe after cascading away its local rows is
  removed. The new cancellation API does not provide invoice settlement or a
  complete namespace/account closure workflow. A canceled status alone does
  not prove billing is settled.
- Verify that concurrent/abandoned subscription checkouts cannot create two
  billable subscriptions for one namespace. The provider now documents replacing
  only that namespace's old subscription after payment; test this with multiple
  pending checkouts. A checkout status/expiration API is still not documented.
  Do not infer payment from a checkout redirect.

The native-workspace adapter still refuses named/shared/bind volume declarations;
replacing a native workspace does not transfer its disk. New Compose projects
accept these declarations through their persistent Docker workspace. Existing
native projects require an explicit data migration to adopt that model.

## Staging acceptance

1. Create two organizations. Verify distinct namespace bindings and finite
   onboarding policies. With zero onboarding credit, a build must be refused.
2. Buy a Pro monthly plan for A through the UI. Verify the namespace in the
   provider checkout, the charged catalog amount, the signed payment event,
   entitlement synchronization, and the dashboard's refreshed plan/balance.
   Repeat with a yearly plan on a separate test organization.
3. Retry the same checkout request/key and deliver the same webhook twice.
   Confirm there is one purchase and no duplicate credit grant. Deliver an old
   suspension event after restoration; current provider state must win.
4. Buy a credit pack. Verify purchased credits survive renewal without resetting
   metered usage during the purchase. Legacy signed `used` values must not be
   clamped. A redirect by itself must not alter permissions or credits.
5. Deploy and redeploy a static site and an HTTP application. Exercise free
   domains, custom domains/TLS, logs, restart, stop, route removal, and deletion.
   Repeat static deployment from a linked desktop/self-hosted instance.
6. Attempt to read/delete/redeploy A's page/workspace from B. Try a route whose
   hostname is owned by B but whose backend or static page belongs to A. All
   cross-organization attempts must fail.
7. Exhaust/suspend A through provider test controls. New work must fail; B must
   keep working; A must still be able to inspect/stop/delete its resources.
8. Test webhook downtime and recovery, unavailable billing reads, failed domain
   operations, and build TTL setup failure. No failed operation may be reported
   as successful. Inspect the provider account for orphan workspaces afterward.
9. Cancel A at period end, repeat cancellation, and resume renewal. Verify A's
   paid period/balance remain intact and B is unchanged. Change A's plan and
   interval through checkout; verify the disclosed full price, new cycle, and
   replacement of the old subscription. Check that each portal shows only its
   customer's invoices/payment methods and rejects shared legacy billing.
   Exercise the support closure procedure and check for continuing charges or
   orphan resources after closure.
10. Only after these checks pass, enable the production purchase flags, rerun
    `cloud-readiness.ts`, and monitor webhook failures and reconciliation errors.

Provider references: [index](https://oblien.com/llms.txt),
[billing](https://oblien.com/docs/api/billing),
[namespaces](https://oblien.com/docs/api/namespaces),
[Pages](https://oblien.com/docs/api/pages),
[scoped tokens](https://oblien.com/docs/api/scoped-tokens).
