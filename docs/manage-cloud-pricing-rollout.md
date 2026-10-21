# Manage and Cloud pricing rollout

This implements the product split agreed in #1396. The shared pricing catalog is
`packages/core/src/pricing/pricing.json`.

- Self-hosted control planes remain free.
- Manage costs $5/month per organization (shown as a workspace), including two
  customer-owned servers; additional servers cost $3/month each, up to 100.
- Paid Cloud coverage includes the base two-server management allowance once per
  organization. Cloud Spaces do not consume connected-server slots.
- New Cloud monthly offers start at Starter $20, Pro $39 and Scale $99. Hobby is
  retired from new checkout, not removed from historical subscription parsing.
  Saved paid prices, resources and renewals remain intact.
- Dedicated physical hardware is quote-only. PAYG remains a separate preview.

## Release order

1. Release the provider's generic `billingMode: service` subscription support.
   The reseller catalog must advertise `reseller.serviceOffers: true`. Its paid
   entitlement must report `serviceCovered` only for a verified settled cycle;
   service subscriptions must grant zero compute quota and no VM capacity.
2. Apply Openship migration `0199_management_billing.sql` using the normal
   migration runner, then release the API, dashboard and public website together.
   No new secret or environment variable is needed. Existing `BILLING_ENABLED`
   and reseller credentials still control sales.
3. In a non-production organization, verify checkout, paid activation, connecting
   a public SSH host, deployment, allowance upgrade/downgrade, renewal and refund.
   Verify that disabling renewal and disconnecting the host leave workloads and
   volumes intact. Use provider test payments, not a customer's subscription.
4. Check the public pricing catalog and login return to `/billing/manage` before
   announcing the product. If the provider capability is absent, new Manage
   checkout is disabled; existing verified access and cancellation are separate.

## Billing and ownership

Manage uses a separate hashed namespace for each organization. A browser return,
webhook body, or nominal subscription status never grants access: Openship reads
provider state and matches the namespace, organization, saved offer and paid
period. The provider verifies receipts, including upgrade chains and reversals.

Checkout intent is persisted before the external request, with an immutable
idempotency key. Lost responses resume that intent; a confirmed cancellation or
expiration releases it. Inventory changes and allowance changes share the server
inventory lock, so concurrent connections cannot oversubscribe the allowance.

Signed billing events invalidate the shared database entitlement cache. The
bounded background reconciliation also covers missed events. Access is refreshed
at most once per minute, and the paid period is checked on every operation.
Provider failures are not interpreted as a canceled subscription.

When Cloud starts, the separate base Manage fee ends at renewal. Extra-server
charges keep their saved terms. When Cloud coverage ends, an already-paid
allowance stays valid until its expiry; a discounted renewal is canceled rather
than silently increasing the charge. The customer explicitly selects the full
Manage plan after that period ends. This transition can require reconnecting
management access; applications keep running throughout.

## Customer infrastructure

The existing SSH, Docker/bare runtime, edge, backup and operation layers are reused.
The actual server destination selects those adapters; SaaS mode alone does not
force workloads into a provider VM. Builds and source checkouts run on the
customer host, never the Cloud API host.

Hosted connections accept direct SSH with a password or uploaded private key.
Public addresses are resolved and pinned on each connection, and the first
successful connection pins the host key. Local/agent credentials, jump hosts,
local key paths and custom SSH arguments are unavailable to SaaS customers.
Management expiration blocks new control-plane operations; it does not stop or
delete running applications or data. Disconnect removes Openship records only.
Normal explicit project deletion retains its existing destructive confirmation.

Clusters, instance migration and mail administration retain their existing
availability constraints; this feature does not expose the SaaS operator host.

## Validation boundaries

Automated tests exercise real database persistence and advisory/inventory locks,
HTTP/native SDK parity, checkout retries, tenant isolation, concurrent server
connections, expired access, SSH restrictions and non-destructive disconnect.
Provider critical tests use disposable MariaDB and Redis with mocked Stripe,
including payment activation, renewal, plan changes, refunds and duplicate events.
A live Stripe checkout or customer SSH deployment is not performed by these tests.
