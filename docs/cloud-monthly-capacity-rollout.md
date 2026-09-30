# Monthly Cloud capacity rollout

The approved next offers are below. They are **not active checkout offers**.
Current checkout remains credit-based while the provider contract is being
completed. Offer v6 raises Hobby storage to 25 GB without changing prices or
credits. Starter's per-workspace disk limit becomes 32 GB within its existing
32 GB pool, so a Hobby upgrade does not require shrinking a disk.
Every saved subscription retains its own terms. The capacity editor
works independently with each subscription's existing limits.

| Plan           | Monthly price | CPU pool | Memory pool | Storage pool |
| -------------- | ------------: | -------: | ----------: | -----------: |
| Hobby          |            $5 |   1 vCPU |        4 GB |        25 GB |
| Starter        |           $20 |   2 vCPU |        8 GB |        32 GB |
| Pro            |           $39 |   4 vCPU |       16 GB |       128 GB |
| Scale (`team`) |           $99 |   8 vCPU |       32 GB |       256 GB |

For these new offers, projects and services share the pool without a separate
count limit. One service may use the whole advertised pool. Smaller services
can share the same project workspace; every additional workspace reserves its
own capacity. Stopped workspaces and pending increases still count until the
provider confirms release. Actual runtime usage is not free allocation.

Hosting within the pool is included in the monthly subscription. It must not
stop because a finite consumption-credit balance was exhausted. Source builds
need a separate allowance and allocation; they cannot consume the customer's
entire hosting pool just to deploy an update. A draft allowance is 300 / 1,000 /
3,000 / 6,000 build minutes per month respectively on a 1 vCPU, 2 GB builder.
Those build amounts are not published or enforced as new paid terms yet.

## Provider contract required before activation

The public `GET https://api.oblien.com/billing/catalog` response inspected on
2026-09-30 advertises reseller contract version 2, offer policy, resource limits,
effective resource limits, and aggregate resource limits. It does not advertise
fixed monthly hosting or a separate build pool. The installed billing contract
requires positive offer credits and restores that saved credit policy on renewal.
Changing only the Openship balance check cannot prevent provider suspension.

The Oblien integration needs a documented, versioned contract covering:

1. A hosted monthly-capacity offer and its authoritative subscription/entitlement
   response, including renewals, cancellation, failed payment and refunds. Active
   monthly hosting must not depend on a finite customer consumption balance.
2. A separate build allowance, reservation, usage and release model. Exhausting
   build minutes must stop new builds while keeping running apps and image-only
   resource adjustments available.
3. System overhead accounting. Current Docker workspaces reserve 512 MB for the
   OS/Docker, round memory to 256 MB, and require at least 1 GB. A raw 4 GB service
   therefore does not fit a 4 GB provider pool today. Specify which overhead the
   provider excludes or funds so the advertised whole-pool service is feasible.
4. Atomic allocation admission and release reporting for CPU, memory, storage,
   workspace counts, and pending updates. Existing namespace allocation reads
   and workspace resizes are reused; no undocumented provider endpoint is assumed.
5. Independent saved terms: new offers must not rewrite a prior customer's price,
   credits, resource limits or renewal terms. Any migration of existing paid
   customers is a separate explicit operation.

Suggested message to Oblien:

> We are introducing monthly hosting pools: Hobby $5 (1 CPU/4 GB/25 GB), Starter
> $20 (2/8/32), Pro $39 (4/16/128), Scale $99 (8/32/256). Projects and services
> share the pool, and one service can use all of it. Your `/billing/catalog`
> currently advertises reseller contract v2 with finite credits. Please provide
> the supported offer, subscription, entitlement and renewal contract for hosting
> that remains available throughout an active monthly subscription, plus a
> separate build allowance/reservation and explicit OS/Docker overhead treatment.
> We must preserve existing paid snapshots. Our capacity editor already uses
> namespace allocation reads and verified workspace resizing; we are not disabling
> current checkout or credit enforcement to simulate the new hosting contract.

## Activation and validation

After the provider contract is available, implement it at the existing billing
adapter boundary, update the single active pricing catalog with a new offer
version, and derive the dashboard and website from that catalog. Do not publish
a second source of live prices or a flag that merely bypasses credit checks.

Verify against a disposable provider namespace before publishing:

- Purchase, renewal, cancellation, failed payment and top-up behavior with both
  historical credit subscriptions and new monthly-capacity subscriptions.
- A service using the full CPU/memory pool, both alone and split into smaller
  services, without an undisclosed overhead rejection.
- Deployment at full runtime allocation while the builder uses its separate pool.
- Exhausted build minutes leave running apps available and still permit a retained
  image resource adjustment.
- A full namespace, confirmed downsizing with a service restart, confirmed release,
  and retry of the original blocked deployment without a second project or disk.
- Concurrent reservations, lost responses, process restarts, denied permissions,
  stale previews, failed resizes, retained volumes and unavailable measurements.

## Current capacity editor boundary

`GET /api/billing/capacity` reports provider allocations. Preview and apply require
billing access plus write access to the project and all its services. Apply uses
the normal deployment queue and retained images. Service resource overrides,
the deployment row and its build session commit together. Retries reuse a scoped
idempotency key and the same durable deployment.

The editor currently resizes running projects with a shared Docker workspace and
an active deployment. Native Cloud workspaces and stopped/draft projects are shown
with their limitation; they are not silently converted or restarted. Disk shrink
is not supported. An unavailable workspace read cannot authorize a resize. The
dashboard waits for the worker to finish and the provider allocation to match
before treating the adjustment as complete; a ready deployment alone is not proof.
Ordinary deployment preflight checks capacity when measurements are available;
otherwise it leaves admission to the provider's atomic reservation, avoiding a
new dependency on optional capacity measurements. Ownership mismatches still fail.

The automated suites cover calculations, HTTP/native SDK authorization, real
database admission, retained-image execution contracts, provider resize behavior
and UI recovery. They simulate the provider and do not certify a live billing
cycle or the as-yet unavailable monthly hosting contract.
