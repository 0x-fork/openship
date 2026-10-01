# Subscription-owned Cloud workspaces

Approved implementation scope: shared Docker execution targets alongside the existing dedicated native and Docker targets. Existing customers migrate manually; no automatic moves, billing replacements, or resource deletion.

## Invariants

- Organization owns workspace; workspace owns its namespace, subscription and runtime resources. Projects are members, never owners of a shared host.
- Shared targets always use Docker, including the first single-app project. Dedicated native targets remain native until an explicit migration.
- Reuse the existing engine, Docker runtime, build pipeline and Cloud transport. Provider-only lifecycle and edge behavior stay in adapters.
- Each subscription has an independent namespace. Oblien authorizes billing and provisioned capacity; Docker reports actual runtime usage.
- Snapshot execution identity. Project cleanup and rollback cannot delete, resize or restore the shared VM.
- Project resource limits are container limits. Creating a project does not reserve another provider VM or disk. Builds share the host with coordinated admission.
- Provider calls are idempotent and recoverable. A failed billing read does not suspend an active workspace. Suspensions preserve data.
- Disk usage is measured; provisioned disk is capacity. Shared image/cache/system bytes are not repeatedly charged to projects.

## Managed server refinement

Projects use `serverId` for their execution host, including Cloud. Each Cloud
workspace owns one managed server identity; the workspace still owns billing,
provisioning and host deletion. The server's workspace binding selects Oblien
transport and the workspace's Docker or dedicated native runtime. Local and SSH
servers retain their existing connections. Project workspace ownership is an
immutable, database-checked billing scope, not another execution selector.

- [x] Atomic managed server creation and database ownership constraints
- [x] Central destination resolution for local, SSH, shared Cloud Docker and dedicated Cloud
- [x] Project/app placement through server IDs and unchanged subscription scoping
- [x] Guards against SSH fallback and ordinary server deletion for managed hosts
- [x] Updated contracts, UI, SDK/MCP documentation and manual migration guidance
- [x] Ownership, lifecycle and self-hosted regression tests; release verification

## Delivery checklist

- [x] Workspace schema, ownership constraints and repository integration tests
- [x] Workspace-scoped namespace, credentials, subscriptions and entitlement reconciliation
- [x] Common Docker host provisioning and target resolution; native target preservation
- [x] Build capacity, project/app creation, services and routing integration
- [x] Host-safe project deletion, retention, rollback and backups
- [x] Workspace API, SDK and MCP lifecycle operations with permission gates
- [x] Workspace UI, placement, billing and pricing explanations
- [x] Manual migration runbook and website documentation
- [x] Release integration tests, production route scan, typechecks and regression suite

## Validation

- Full API: 617 files / 7,755 tests passed. The complete Cloud and self-hosted
  production routers both pass the startup permission scanner and MCP discovery.
- Full dashboard: 230 files / 2,490 tests passed. Browser fixtures cover light,
  dim, dark, narrow and Arabic RTL layouts, placement, resize review and progress.
- Adapter suite: 4,755 tests passed, including container-name cleanup and omitted
  zero-byte layer sizes in Docker's disk-usage response. Reintroducing the faulty
  lookup in a temporary copy fails both name/short-ID cases; the disk-accounting
  regression also fails before its fix and passes afterward.
- Core (1,408), contracts (14), database (603), platform (170), SDK (187), CLI (581)
  and repository script (67) tests passed. Database tests apply the migration chain
  to fresh and populated databases and verify cross-organization constraints.
- Managed-server regressions cover project/app/source placement, historical
  snapshots, immutable billing ownership, and unchanged SSH/local/direct Cloud
  bindings during upgrade. Project transfers follow each FK identity once,
  without including unrelated servers through composite ownership columns.
- Both Cloud Docker release suites pass against a disposable real Docker daemon:
  10 tests covering ports/routes, mounts, private links, environment reapply,
  data backup/restore, image replay, sibling-safe cleanup, container limits and
  build success/failure/cancellation cleanup.
- API, dashboard, database, adapters, platform, SDK and CLI typechecks pass. The public
  package builds and passes its installed Node 22 lifecycle/CLI/type checks.
- Website build and documentation checks pass: 167 pages, 461 SDK methods,
  680 HTTP routes, 437 MCP tools, 214 CLI paths and all documented examples.
- All 75 new English translation keys exist in the other eight locales with
  translated prose. The global i18n check still reports pre-existing drift.

Provider transport and edge responses are simulated in local lifecycle/release
tests. A paid checkout, provisioning and resize smoke test against the deployed
Oblien API remains part of the [managed server architecture](../managed-cloud-servers.md).
No production subscription or customer workload was changed during development.

## Separate earlier audit findings

This change protects the shared host during image rollback; it does not resolve
the earlier rollback environment-preview count, general Compose rollback
transactionality, deployment-page rollback shortcut or slow SSL revalidation.
Those remain separate work and must not be considered fixed by workspace ownership.
