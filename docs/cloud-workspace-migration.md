# Manual migration to a subscribed Cloud workspace

Existing projects, subscriptions and disks are not moved by the schema migration.
Use this runbook only for an explicitly approved customer move. A new subscription
does not rewrite the customer's existing price or entitlement. Reconcile any
commercial adjustment with the customer before checkout or an audited grant.

## Prepare

1. Record the organization, source project/deployments, provider namespace and
   VM IDs, domains, service limits, environment keys, volumes and backup policy.
   Do not put secret values in tickets, logs or this document.
2. Check the source deployment is recoverable. Take application-consistent
   database dumps and volume backups to an independent destination. Verify
   restore/read access before changing routes.
3. Create a shared Docker workspace in the same organization. Subscribe or use
   the existing audited billing-grant operator with the explicit workspace ID.
   Verify the provider reports the intended purchased capacity and subscription.
4. Wait for host setup to succeed. Check workspace usage and saved operation
   logs. A lost response should be recovered with the same checkout or operation,
   not a second subscription or a replacement disk.

## Stage and verify

1. Create replacement projects with the workspace's returned `serverId`; preserve the source
   projects. Placement is immutable, so do not rewrite project IDs or deployment
   snapshots directly in the database.
2. Recreate service settings and saved environment values through the normal
   control-plane APIs. Compare masked key inventories, then validate values in
   the running service without exposing them in migration logs.
3. Transfer persistent data using the database's supported dump/restore or a
   reviewed operator storage copy. The current backup dashboard restores within
   the original project; it is **not** a cross-project volume migration tool.
   Stop writes for the final copy and preserve file ownership and permissions.
4. Deploy and verify health, internal service discovery, application behavior,
   secrets, uploaded files and backups using temporary routes. Confirm actual
   container CPU/memory limits and measured workspace disk usage.
5. Recreate schedules and backup policies for the replacement project only when
   ready. Avoid running duplicate schedulers or destructive background jobs.

## Cut over

1. Agree on downtime if needed for the final consistent data copy.
2. Release source hostname ownership through the normal domain flow, then attach
   the verified target service. Do not bypass domain ownership/tombstones in SQL.
3. Verify HTTPS, routes, request handling and data after cutover. Retain the old
   deployment, its data and an independent backup for the agreed recovery window.
4. Record that a code rollback does not undo writes to a database. If switching
   back after writes on the new host, reconcile data before restoring routes.

## Retire

After customer verification, remove the old project through its normal cleanup
path. The original project-owned Cloud VM is removed only by that original mode's
cleanup. A project in a subscribed shared workspace can remove only its own
containers, images, routes and explicitly selected data; the host and siblings
remain.

Cancel the old subscription explicitly after checking for other resources in
its namespace. Never cancel organization billing simply because one project
moved. Removing a subscribed workspace requires an empty workspace, no unresolved
checkout and an ended subscription. Provider financial history is retained;
the provider namespace is not deleted as part of compute teardown. Record the
retired namespace and subscription IDs for later billing support.

## Release verification

- Apply `0155_cloud_workspaces.sql` and `0156_managed_servers.sql` through the
  normal migration runner. The latter registers a managed server for each
  existing logical workspace and derives its projects' billing owner from that
  server; it does not provision or move provider resources. Existing direct
  Cloud projects and connected SSH/local hosts keep their bindings. Do not use
  a production database for development tests.
- Boot both Cloud and self-hosted route registries; both must have zero critical
  scanner errors.
- Run workspace lifecycle integration tests, including signed payment events,
  lost-response recovery, tenant permissions, resize restart checkpoints and
  subscription/deletion guards.
- Run `cloud-shared-workspace.e2e.test.ts` and `cloud-build-capacity.e2e.test.ts`
  against a disposable Docker daemon. Verify sibling isolation, environment
  reapply, routing, data backup/restore and project cleanup.
- Before enabling customer migrations, exercise a paid test workspace against
  the deployed Oblien API: checkout, provision, two projects, measured usage,
  resume, reviewed resize and final cleanup. Local tests simulate provider
  transport and cannot certify the deployed provider's behavior.
