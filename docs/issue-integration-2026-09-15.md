# First 50 issues: integration review

Snapshot: 2026-09-15, open issues in GitHub's default newest-first order.

Integration branch: `feat/issue-integration-2026-09-15`. Base: `c6cd723f8bd1a0665f5593daaccd0d15fd552931` (`main`). The original checkout and `main` are unchanged.

Scope: bugs and general improvements only, as clarified by the maintainer. New feature requests are deferred and remain open. Bug reports are checked against this base and the integrated tree. Business logic stays in the shared platform; the HTTP API, SDK, and CLI use that implementation. Original PR commits remain in merge history, with architecture and correctness adjustments in the integration merge.

## Verification

Initial unchanged-main baseline: **13,075 tests passed, 3 skipped, all 10 tasks passed** (4m34s); `npx --yes bun@1.3.10 run test --force --log-order=stream`.

Review and integration are in progress. Local checks do not establish live provider behavior; any remaining provider or deployment checks are identified in the issue notes.

## Issue ledger

| Issue                                                 | Report                                                                                                                                                                                            | Linked PRs                                                                                               | Outcome                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#882](https://github.com/oblien/openship/issues/882) | [Bug] SFTP backup failures leave .uploading-\* temporary files                                                                                                                                    | [#883](https://github.com/oblien/openship/pull/883)                                                      | **integrated**: Failed SFTP uploads reclaim their temporary file through a bounded fresh connection and preserve the original failure.                      |
| [#881](https://github.com/oblien/openship/issues/881) | Service-first projects hide project environment editing and blur env scope                                                                                                                        | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#880](https://github.com/oblien/openship/issues/880) | [Bug]: GET /api/issues and GET /api/updates hang indefinitely when one project's upstream update poll never settles                                                                               | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#879](https://github.com/oblien/openship/issues/879) | [Bug]: [0.7.2] Custom domains at project level are verified + certified but never routed locally; self-app domain cannot converge (host-port claim conflict)                                      | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#878](https://github.com/oblien/openship/issues/878) | [Improvement]: Deployments don't use external repository and rebuild images instead                                                                                                               | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#877](https://github.com/oblien/openship/issues/877) | [Feature]: Add Porkbun as a supported DNS Provider                                                                                                                                                | —                                                                                                        | **deferred-feature**: Deferred: new Porkbun DNS provider; excluded by the bugs-only scope.                                                                  |
| [#876](https://github.com/oblien/openship/issues/876) | [Bug]: Email service is waiting for emails to go out forever                                                                                                                                      | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#875](https://github.com/oblien/openship/issues/875) | [Bug]: Can't add self hosted openship mcp sever to claude code                                                                                                                                    | —                                                                                                        | **fixed**: The dashboard now advertises /api/mcp, matching OAuth metadata, including in proxy installations.                                                |
| [#873](https://github.com/oblien/openship/issues/873) | [Bug]: `openship.json`'s `monorepo` config (and CLI `project create --type monorepo`) is documented and schema-valid, but doesn't actually produce a multi-app project through any available path | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#872](https://github.com/oblien/openship/issues/872) | [Bug]: Global GitHub device-flow connection intermittently shows "rejected". The status is backed by a Redis cache entry with a ~100 second TTL, not the actual GitHub authorization state        | —                                                                                                        | **partial**: Fixed reproducible rate-limit misclassification; the original intermittent account rejection still needs correlation with provider status.     |
| [#870](https://github.com/oblien/openship/issues/870) | [Bug]: Branch selector on "Link Repository" is unusable                                                                                                                                           | [#884](https://github.com/oblien/openship/pull/884)                                                      | **integrated**: Integrate PR #884 with pagination in both the migration wizard and deploy picker, preserving the platform/SDK architecture.                 |
| [#869](https://github.com/oblien/openship/issues/869) | Migrate to self-hosted server never actually deploys (3 stacked bugs: missing deploy trigger, release-dist path/packaging mismatch, PGlite assets crash)                                          | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#867](https://github.com/oblien/openship/issues/867) | [Bug]: Job run failure notifications omit job name, exit code, and logs                                                                                                                           | [#868](https://github.com/oblien/openship/pull/868)                                                      | **integrated**: Job alerts include the real exit status, name, duration, sanitized log tail, and failure reason.                                            |
| [#865](https://github.com/oblien/openship/issues/865) | [Improvement]: Include destination and policy references in backup job notifications                                                                                                              | [#866](https://github.com/oblien/openship/pull/866)                                                      | **integrated**: Backup alerts include policy and destination references even when lookups fail.                                                             |
| [#859](https://github.com/oblien/openship/issues/859) | [Bug]: Project-level backup policies fan out to stateless services without volumes, causing recurring backup failures                                                                             | [#860](https://github.com/oblien/openship/pull/860)                                                      | **integrated**: Project backup fan-out skips stateless services and rejects an empty candidate set.                                                         |
| [#858](https://github.com/oblien/openship/issues/858) | [Bug]: False-positive "No public domain is connected" warning on redeploy                                                                                                                         | [#861](https://github.com/oblien/openship/pull/861)                                                      | **pending**: Pending review                                                                                                                                 |
| [#856](https://github.com/oblien/openship/issues/856) | [Feature]: Add Authentik to the one-click app catalog                                                                                                                                             | [#857](https://github.com/oblien/openship/pull/857)                                                      | **deferred-feature**: Deferred: new Authentik catalog application; PR #857 is not included.                                                                 |
| [#854](https://github.com/oblien/openship/issues/854) | [Bug] buildArgs returned unmasked in the deployments API while the same key is masked in environment                                                                                              | [#864](https://github.com/oblien/openship/pull/864)                                                      | **pending**: Pending review                                                                                                                                 |
| [#853](https://github.com/oblien/openship/issues/853) | [Bug] openship deploy: folder upload tarball is written inside its own archive root when cwd is $TMPDIR — orphaned tarballs nest and fill the disk                                                | [#863](https://github.com/oblien/openship/pull/863)                                                      | **pending**: Pending review                                                                                                                                 |
| [#852](https://github.com/oblien/openship/issues/852) | [Bug]: Switching a project's branch in the deploy config UI never re-scans the repo, stale framework/compose detection from the previous branch is kept and used to deploy                        | [#855](https://github.com/oblien/openship/pull/855)                                                      | **integrated**: Integrate PR #855: rescan branch changes, discard stale Compose defaults, and save the new branch with its settings in one platform update. |
| [#851](https://github.com/oblien/openship/issues/851) | [Bug]: "Sign in with GitHub" (device flow) silently does nothing, backend returns a valid device code but the UI never displays it                                                                | [#862](https://github.com/oblien/openship/pull/862)                                                      | **integrated**: Pending GitHub device codes stay visible across stale status refreshes and account changes.                                                 |
| [#849](https://github.com/oblien/openship/issues/849) | [Feature Request] Add CLI commands for self-hosted jobs                                                                                                                                           | [#850](https://github.com/oblien/openship/pull/850)                                                      | **deferred-feature**: Deferred: new CLI Jobs command surface; PR #850 is not included.                                                                      |
| [#847](https://github.com/oblien/openship/issues/847) | [Bug] Push webhook that arrives during an in-progress deployment is dropped permanently (200 OK, no retry, no queue)                                                                              | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#846](https://github.com/oblien/openship/issues/846) | [Bug] Compose services cannot join a pre-existing external Docker network (background workers are unreachable from shared services)                                                               | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#845](https://github.com/oblien/openship/issues/845) | [Bug] Edge router drops query string on 308 trailing-slash redirect                                                                                                                               | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#844](https://github.com/oblien/openship/issues/844) | [Bug] service.environment silently overrides project env on every deploy path (and stores secrets in plaintext)                                                                                   | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#842](https://github.com/oblien/openship/issues/842) | [Bug]: GitHub App manifest includes unsupported installation event                                                                                                                                | [#843](https://github.com/oblien/openship/pull/843)                                                      | **integrated**: Removed the unsupported installation event; retained the shared platform service.                                                           |
| [#841](https://github.com/oblien/openship/issues/841) | [Bug] service sync leaves its multi-GB upload tarball in /tmp after a successful deploy                                                                                                           | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#837](https://github.com/oblien/openship/issues/837) | [Bug] openship-mail: Postfix and Dovecot fall back to self-signed certificate when Let's Encrypt cert is mounted                                                                                  | [#838](https://github.com/oblien/openship/pull/838)                                                      | **pending**: Pending review                                                                                                                                 |
| [#836](https://github.com/oblien/openship/issues/836) | [Bug]: Adding a new server from the backup UI box failed                                                                                                                                          | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#835](https://github.com/oblien/openship/issues/835) | [Bug] Git-based builds never fetch submodules (no --recurse-submodules / submodule update), so repos with submodule dependencies fail at build                                                    | [#874](https://github.com/oblien/openship/pull/874)                                                      | **pending**: Pending review                                                                                                                                 |
| [#828](https://github.com/oblien/openship/issues/828) | [Improvement]: Make mail server sql port configurable                                                                                                                                             | [#829](https://github.com/oblien/openship/pull/829)                                                      | **pending**: Pending review                                                                                                                                 |
| [#825](https://github.com/oblien/openship/issues/825) | [Bug]: GitHub connection fails during authentication - process gets stuck indefinitely                                                                                                            | [#831](https://github.com/oblien/openship/pull/831)                                                      | **already-fixed**: The linked redirect-origin fix is already handled by current main; PR #831 is superseded.                                                |
| [#819](https://github.com/oblien/openship/issues/819) | [Feature] Multi-wildcard domains, control plane isolation, 7000-series port standardization, and dashboard domain management                                                                      | —                                                                                                        | **deferred-feature**: Deferred: multi-wildcard domain management and control-plane redesign; no new platform feature work in this branch.                   |
| [#818](https://github.com/oblien/openship/issues/818) | [Feature] Outbound relay domain verification notice and client privacy header scrubbing                                                                                                           | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#817](https://github.com/oblien/openship/issues/817) | [Improvement] Synchronize backup retention pruning with backup runs and stagger system cron jobs                                                                                                  | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#801](https://github.com/oblien/openship/issues/801) | Secret env vars come through empty on the actual running container, even when correctly stored and correctly injected at build time                                                               | [#804](https://github.com/oblien/openship/pull/804)                                                      | **pending**: Pending review                                                                                                                                 |
| [#795](https://github.com/oblien/openship/issues/795) | [Bug/Help Wanted] Environment variables not passed to Dockerfile during image build in a monorepo structure                                                                                       | [#840](https://github.com/oblien/openship/pull/840)                                                      | **pending**: Pending review                                                                                                                                 |
| [#779](https://github.com/oblien/openship/issues/779) | Enhance self-hosted image retention with age-based cleanup and runtime image visibility                                                                                                           | [#794](https://github.com/oblien/openship/pull/794), [#820](https://github.com/oblien/openship/pull/820) | **deferred-feature**: Deferred: new image-GC inspection, dry-run and retention controls; PR #794 is not included.                                           |
| [#773](https://github.com/oblien/openship/issues/773) | Timeouts on several features                                                                                                                                                                      | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#764](https://github.com/oblien/openship/issues/764) | feat(webmail): configurable sender name and email signatures                                                                                                                                      | —                                                                                                        | **deferred-feature**: Deferred: new webmail signature and sender-name settings.                                                                             |
| [#758](https://github.com/oblien/openship/issues/758) | Support multiple isolated workspaces on a self-hosted OpenShip instance                                                                                                                           | —                                                                                                        | **deferred-feature**: Deferred: new self-hosted workspace management feature.                                                                               |
| [#749](https://github.com/oblien/openship/issues/749) | feat(compose): preserve container hardening controls                                                                                                                                              | [#871](https://github.com/oblien/openship/pull/871)                                                      | **deferred-feature**: Deferred: new supported Compose hardening fields; PR #871 is not included. Existing unsupported-field reporting remains.              |
| [#746](https://github.com/oblien/openship/issues/746) | Folder-upload endpoint silently truncates/corrupts payloads larger than 10MB instead of rejecting them                                                                                            | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#717](https://github.com/oblien/openship/issues/717) | [Feature]: Support Git tags and tag patterns as deployment and update triggers                                                                                                                    | [#716](https://github.com/oblien/openship/pull/716)                                                      | **deferred-feature**: Deferred: new Git tag-pattern deployment and update triggers; PR #716 is not included.                                                |
| [#706](https://github.com/oblien/openship/issues/706) | HomeLab Networking (Internal IP's)                                                                                                                                                                | —                                                                                                        | **pending**: Pending review                                                                                                                                 |
| [#695](https://github.com/oblien/openship/issues/695) | OPENSHIP                                                                                                                                                                                          | —                                                                                                        | **not-actionable**: The issue has no body, reproduction, request, or linked PR. No code change can be inferred.                                             |
| [#694](https://github.com/oblien/openship/issues/694) | [Feature]: Support release mode and update tracking for container image projects                                                                                                                  | [#691](https://github.com/oblien/openship/pull/691)                                                      | **deferred-feature**: Deferred from this review: release-mode container-image feature request, linked PR already closed.                                    |
| [#676](https://github.com/oblien/openship/issues/676) | Feature request: cap/serialize concurrent builds (auto-deploy fan-out corrupts containerd content store)                                                                                          | —                                                                                                        | **deferred-feature**: Deferred: configurable build queue and concurrency limits are a separate feature.                                                     |
| [#672](https://github.com/oblien/openship/issues/672) | feature: service restarting auto detection after new deployments in background (not blocking) and mark project partial failed or action required if there's loop restarting                       | —                                                                                                        | **deferred-feature**: Deferred: new post-deploy restart-loop monitoring feature.                                                                            |

## Review details

### #882

Failed SFTP uploads reclaim their temporary file through a bounded fresh connection and preserve the original failure.

The original PR could hang while cleaning up a dead channel and did not bound the final rename. The adaptation stops streams and timers when SSH closes, rejects premature write-stream closure, and retries cleanup on a fresh connection with a 10-second deadline.

A destination that remains unreachable can still retain the temporary file; cleanup reports that failure. This change does not sweep pre-existing process-crash leftovers.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/882#issuecomment-5685102891).

Integration commits: `3bf8ec1d`.

Verification:

- 12 focused SFTP tests passed, including disconnect, stalled cleanup/finalization, early close, missing temporary file, and slow healthy upload
- Both new deadline regressions failed against original PR #883
- All 3,667 adapter tests passed
- Adapter, platform, and API TypeScript checks passed

### #877

Deferred: new Porkbun DNS provider; excluded by the bugs-only scope.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #875

The dashboard now advertises /api/mcp, matching OAuth metadata, including in proxy installations.

The reported mismatch still existed on main. External-client URLs now use the canonical origin and MCP path; dashboard REST calls retain their internal proxy path.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/875#issuecomment-5685104476).

Integration commits: `32073074`.

Verification:

- 12 dashboard URL tests passed, including proxy and dynamic desktop-port cases
- Reviewed the existing /api/mcp and OAuth discovery rewrites

### #872

Fixed reproducible rate-limit misclassification; the original intermittent account rejection still needs correlation with provider status.

The cache TTL is not the credential lifetime: main reloads encrypted instance credentials on a cache miss. The integrated correction keeps 403 primary/secondary rate limits and 429 retryable and bounds verification to 10 seconds. Actual authorization rejection still prompts reconnection.

Leaving the issue open because the reported account’s intermittent rejection has not been reproduced or tied to a rate-limit response.

Integration commits: `2715609a`.

Verification:

- 20 GitHub identity and device-flow tests passed. Three rate-limit regressions failed against the previous implementation before the fix.

### #870

Integrate PR #884 with pagination in both the migration wizard and deploy picker, preserving the platform/SDK architecture.

The original PR updated the deployment selector but did not wire pagination into the migration wizard named in the report. Both now share a repository-scoped picker with main/master first, explicit load-more, keyboard search, and visible retryable failures.

Moved branch listing into the shared platform operations and contracts. The private 0.1 SDK returns the same {data, pagination} object in native and remote modes; the HTTP data array remains compatible with existing dashboard readers.

Environment creation validates a branch directly, including names beyond page one, rather than accepting any tag/commit ref as the PR proposed. Unavailable-provider errors remain distinct from a missing branch.

Integration commits: `b2cd7842`.

PR #884 reviewed at `c9c7fbf2792b02304377b2d49336e71b80844afd`.

Verification:

- Five DOM interaction regressions pass, covering later-page search, current/main branch retention, existing-project operations, stale repository responses, error/retry, and existing description filtering.
- 17 affected GitHub/project API tests and 34 SDK project-control tests pass; API and dashboard type checks pass. Native/HTTP tests cover page metadata and cross-tenant denial.

### #867

Job alerts include the real exit status, name, duration, sanitized log tail, and failure reason.

Adapted PR #868 while preserving native authorization, cancellation, target attribution, and tracked background work. The PR forwarded a hardcoded failure code of 1; the integration carries the actual command result (tested with exit 17). Unknown exit status is not invented. Notification excerpts stay within 2,000 characters and scrub URL credentials.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/867#issuecomment-5685102133).

Integration commits: `505b91ee`.

Verification:

- 71 jobs/API/SDK-parity/notification tests passed
- Two notification regressions failed against the unchanged source

### #865

Backup alerts include policy and destination references even when lookups fail.

Adapted PR #866 into the shared platform. Removed the nonexistent policy-name cast; use the durable policy ID and destination ID as fallbacks. Existing project/service names are preserved.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/865#issuecomment-5685101258).

Integration commits: `98bbf603`.

Verification:

- 29 affected notification and backup tests passed, including a missing policy plus failed destination lookup

### #859

Project backup fan-out skips stateless services and rejects an empty candidate set.

Adapted PR #860 to packages/platform. Removed the blanket cron catch so infrastructure failures remain visible. Explicit custom-command/path payloads remain eligible.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/859#issuecomment-5685100566).

Integration commits: `c200c0b2`.

Verification:

- 39 affected backup tests passed
- Both fan-out regressions failed against the unchanged source

### #856

Deferred: new Authentik catalog application; PR #857 is not included.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #852

Integrate PR #855: rescan branch changes, discard stale Compose defaults, and save the new branch with its settings in one platform update.

The scan commits its branch and defaults together only on success, prevents overlapping scans, ignores completion after switching projects, and keeps manual env edits and project settings. Unknown stacks open manual framework selection.

Adapted the PR to the paginated branch picker and main’s explicit environment-disclosure option. Replaced the PR’s separate options/branch saves with one shared-platform update so an interrupted request cannot save a different branch’s build configuration.

Integration commits: `c45bcf5d`.

Verification:

- 14 dashboard branch-rescan/picker tests and 10 actual native/HTTP GitHub/project parity tests pass. API and dashboard type checks pass.
- The branch dropdown regression fails without the updated event wiring (zero prepare requests), and passes with the fix.

### #851

Pending GitHub device codes stay visible across stale status refreshes and account changes.

PR #862 applies to the current dashboard. Device-grant polling owns completion; previously cached connectivity cannot dismiss a new grant.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/851#issuecomment-5685103736).

Integration commits: `cfdea39b`.

Verification:

- Five DOM interaction tests passed
- Two device-flow regressions failed against unchanged main

### #849

Deferred: new CLI Jobs command surface; PR #850 is not included.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #842

Removed the unsupported installation event; retained the shared platform service.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/842#issuecomment-5685099558).

Integration commits: `8db8ee10`.

PR #843 reviewed at `224d521a5495e026a42873fe8a4412643a7c697e`.

Verification:

- API github-source.service.test.ts: 4 passed

### #825

The linked redirect-origin fix is already handled by current main; PR #831 is superseded.

Main commit 34b3d0e6 resolves API-root redirects through resolveApiNavigationUrl before navigating. It also bounds the popup lifecycle. Reapplying PR #831 would duplicate the origin handling at a different layer. The separate device-code display bug is covered by #851.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/825#issuecomment-5685105317).

Verification:

- The existing ten dashboard URL tests pass, including proxy and split API origins
- Reviewed GitHubContext redirect navigation and its explicit timeout

### #819

Deferred: multi-wildcard domain management and control-plane redesign; no new platform feature work in this branch.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #779

Deferred: new image-GC inspection, dry-run and retention controls; PR #794 is not included.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #764

Deferred: new webmail signature and sender-name settings.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #758

Deferred: new self-hosted workspace management feature.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #749

Deferred: new supported Compose hardening fields; PR #871 is not included. Existing unsupported-field reporting remains.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #717

Deferred: new Git tag-pattern deployment and update triggers; PR #716 is not included.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #695

The issue has no body, reproduction, request, or linked PR. No code change can be inferred.

Verification:

- Read issue body, comments, and timeline

### #694

Deferred from this review: release-mode container-image feature request, linked PR already closed.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #676

Deferred: configurable build queue and concurrency limits are a separate feature.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #672

Deferred: new post-deploy restart-loop monitoring feature.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.
