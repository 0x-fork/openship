# Cloud capacity and unit economics — 2026-09-29

The v2 catalog fixes two independent defects: inherited Enterprise VM limits on
retail namespaces, and permanent build headroom on image-only Compose hosts.
[The catalog reference](../packages/core/src/pricing/README.md) is the exact
customer contract and rollout guide.

## Hardware budget

The operator supplied $70/month for 12 physical CPU cores, 64 GB RAM and 1 TB
storage. Using those as a conservative capacity envelope, without counting CPU
oversubscription, a homogeneous node fits at most 12 Starter, 3 Pro, or 1 Team
namespace at their full CPU ceilings. At list prices that is $120, $117, or $99
revenue against $70 bare hardware: $50, $47, or $29 remaining **before** payment
fees, backups, networking, control-plane costs, taxes, idle capacity and support.
A mixed node (one Team plus one Pro) uses the 12-core envelope and yields $138.
These are sizing bounds, not guaranteed profit or dedicated-core promises.

Reserve operational headroom in node placement and monitor actual utilization.
Do not assume all 64 GB RAM or all disk space can be sold: kernels, Docker, images,
snapshots, backups and the platform need capacity. Customer limits bound exposure;
they do not replace fleet admission or adequate free disk.

Wallet funding and retail credits are a separate ledger constraint. At the
current 100 credits/USD contract, included 800 / 3,500 / 9,000 credits fit the
$10 / $39 / $99 funding. Top-up grants also fit their payments. This does not mean
one credit equals one minute. Current observed Oblien rates were 1.5 credits per
CPU-minute, 0.2 per memory GB-minute, 0.1 per disk-I/O GB and 0.15 per transfer GB.
A full-load 1-CPU / 1-GB workload therefore uses roughly 1.7 credits/minute before
I/O, under those rates; idle usage is different. Recheck provider rates before
publishing runtime estimates. Process-local billing soft caps are not a durable
monthly entitlement and must not be used to promise a month of runtime.

Because Openship and Oblien have the same owner, wholesale transfer prices can
be reviewed separately later. This release deliberately does not change global
Oblien rates or silently subsidize ordinary retail purchases.

## Verification and rollout

1. Deploy the generic Oblien aggregate-capacity API and additive schema first.
   Require `reseller.aggregateResourceLimits` before enabling v2 sales.
2. Deploy this Openship API/dashboard together. Published SDK 2.5.0 is sufficient.
3. Reconcile existing organizations through the billing sweep or normal guarded
   Cloud actions. v1 paid credits and periods remain unchanged; finite safety
   ceilings replace inherited retail capacity.
4. Review oversized existing Docker hosts while no deployment is in progress.
   The shared reconciliation helper reduces CPU/RAM only after checking project
   ownership, namespace binding and actual bounded running containers. It retains
   disk size and restores exactly the running container set.
5. Check provider `allocated_resource_usage`, create/resize rejection diagnostics,
   a paid upgrade, a top-up, renewal replay and signed webhook handling. A checkout
   return is not proof of credit delivery. Do not charge a real customer to test.

A database transaction commits financial grants and checkpoints. VM changes are
remote operations with durable reservations and recovery, not one distributed
transaction across Stripe, SQL, Docker and the network. A failed response must
retain capacity until provider state is verified. Never expire such a reservation
merely to make a deployment succeed.
