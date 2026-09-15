# First 50 issues: integration review

Snapshot: 2026-09-15, open issues in GitHub's default newest-first order.

Integration branch: `feat/bugfix-integration-2026-09-15`. Base: `c6cd723f8bd1a0665f5593daaccd0d15fd552931` (`main`). The original checkout and `main` are unchanged.

Scope: bugs and general improvements only, as clarified by the maintainer. New feature requests are deferred and remain open. Bug reports are checked against this base and the integrated tree. Business logic stays in the shared platform; the HTTP API, SDK, and CLI use that implementation. Original PR commits remain in merge history, with architecture and correctness adjustments in the integration merge.

Usable contributor PRs target this integration branch. Maintainer edits are made on the original PR branch when allowed; original commits and authorship are preserved. Redundant or out-of-scope PRs are closed with reasons.

## Verification

Initial unchanged-main baseline: **13,075 tests passed, 3 skipped, all 10 tasks passed** (4m34s); `npx --yes bun@1.3.10 run test --force --log-order=stream`.

Review and integration are in progress. Local checks do not establish live provider behavior; any remaining provider or deployment checks are identified in the issue notes.

## Issue ledger

| Issue                                                 | Report                                                                                                                                                                                            | Linked PRs                                                                                               | Outcome                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#882](https://github.com/oblien/openship/issues/882) | [Bug] SFTP backup failures leave .uploading-\* temporary files                                                                                                                                    | [#883](https://github.com/oblien/openship/pull/883)                                                      | **integrated**: Failed SFTP uploads reclaim their temporary file through a bounded fresh connection and preserve the original failure.                                                                                                                                                                                                        |
| [#881](https://github.com/oblien/openship/issues/881) | Service-first projects hide project environment editing and blur env scope                                                                                                                        | —                                                                                                        | **integrated**: Configuration keeps the project environment editor accessible for Compose, monorepo and installed-app projects. Project and service runtime scopes, overriding keys, and source-controlled build arguments are explained explicitly.                                                                                          |
| [#880](https://github.com/oblien/openship/issues/880) | [Bug]: GET /api/issues and GET /api/updates hang indefinitely when one project's upstream update poll never settles                                                                               | —                                                                                                        | **integrated**: The issues and updates feeds recover from stalled upstream polls without restarting the API. DNS, polling and cache writes have deadlines, failed polls back off, and late work cannot overwrite newer cached results.                                                                                                        |
| [#879](https://github.com/oblien/openship/issues/879) | [Bug]: [0.7.2] Custom domains at project level are verified + certified but never routed locally; self-app domain cannot converge (host-port claim conflict)                                      | —                                                                                                        | **partial**: Integrated verified Compose/self-app routing and repair diagnostics; keeping the secondary mail artifact report open.                                                                                                                                                                                                            |
| [#878](https://github.com/oblien/openship/issues/878) | [Improvement]: Deployments don't use external repository and rebuild images instead                                                                                                               | —                                                                                                        | **pending**: Pending review                                                                                                                                                                                                                                                                                                                   |
| [#877](https://github.com/oblien/openship/issues/877) | [Feature]: Add Porkbun as a supported DNS Provider                                                                                                                                                | —                                                                                                        | **deferred-feature**: Deferred: new Porkbun DNS provider; excluded by the bugs-only scope.                                                                                                                                                                                                                                                    |
| [#876](https://github.com/oblien/openship/issues/876) | [Bug]: Email service is waiting for emails to go out forever                                                                                                                                      | —                                                                                                        | **pending**: Pending review                                                                                                                                                                                                                                                                                                                   |
| [#875](https://github.com/oblien/openship/issues/875) | [Bug]: Can't add self hosted openship mcp sever to claude code                                                                                                                                    | —                                                                                                        | **fixed**: The dashboard now advertises /api/mcp, matching OAuth metadata, including in proxy installations.                                                                                                                                                                                                                                  |
| [#873](https://github.com/oblien/openship/issues/873) | [Bug]: `openship.json`'s `monorepo` config (and CLI `project create --type monorepo`) is documented and schema-valid, but doesn't actually produce a multi-app project through any available path | —                                                                                                        | **pending**: Pending review                                                                                                                                                                                                                                                                                                                   |
| [#872](https://github.com/oblien/openship/issues/872) | [Bug]: Global GitHub device-flow connection intermittently shows "rejected". The status is backed by a Redis cache entry with a ~100 second TTL, not the actual GitHub authorization state        | —                                                                                                        | **partial**: Fixed reproducible rate-limit misclassification; the original intermittent account rejection still needs correlation with provider status.                                                                                                                                                                                       |
| [#870](https://github.com/oblien/openship/issues/870) | [Bug]: Branch selector on "Link Repository" is unusable                                                                                                                                           | [#884](https://github.com/oblien/openship/pull/884)                                                      | **integrated**: Integrate PR #884 with pagination in both the migration wizard and deploy picker, preserving the platform/SDK architecture.                                                                                                                                                                                                   |
| [#869](https://github.com/oblien/openship/issues/869) | Migrate to self-hosted server never actually deploys (3 stacked bugs: missing deploy trigger, release-dist path/packaging mismatch, PGlite assets crash)                                          | —                                                                                                        | **pending**: Pending review                                                                                                                                                                                                                                                                                                                   |
| [#867](https://github.com/oblien/openship/issues/867) | [Bug]: Job run failure notifications omit job name, exit code, and logs                                                                                                                           | [#868](https://github.com/oblien/openship/pull/868)                                                      | **integrated**: Job alerts include the real exit status, name, duration, sanitized log tail, and failure reason.                                                                                                                                                                                                                              |
| [#865](https://github.com/oblien/openship/issues/865) | [Improvement]: Include destination and policy references in backup job notifications                                                                                                              | [#866](https://github.com/oblien/openship/pull/866)                                                      | **integrated**: Backup alerts include policy and destination references even when lookups fail.                                                                                                                                                                                                                                               |
| [#859](https://github.com/oblien/openship/issues/859) | [Bug]: Project-level backup policies fan out to stateless services without volumes, causing recurring backup failures                                                                             | [#860](https://github.com/oblien/openship/pull/860)                                                      | **integrated**: Project backup fan-out skips stateless services and rejects an empty candidate set.                                                                                                                                                                                                                                           |
| [#858](https://github.com/oblien/openship/issues/858) | [Bug]: False-positive "No public domain is connected" warning on redeploy                                                                                                                         | [#861](https://github.com/oblien/openship/pull/861)                                                      | **integrated**: Redeploy preflight now reads project/service domain rows and multi-port endpoints, recognizes legacy project-port bindings and free-domain defaults, and directs missing-domain fixes to the Domains tab.                                                                                                                     |
| [#856](https://github.com/oblien/openship/issues/856) | [Feature]: Add Authentik to the one-click app catalog                                                                                                                                             | [#857](https://github.com/oblien/openship/pull/857)                                                      | **deferred-feature**: Deferred: new Authentik catalog application; PR #857 is not included.                                                                                                                                                                                                                                                   |
| [#854](https://github.com/oblien/openship/issues/854) | [Bug] buildArgs returned unmasked in the deployments API while the same key is masked in environment                                                                                              | [#864](https://github.com/oblien/openship/pull/864)                                                      | **integrated**: Non-empty build arguments are masked across shared service, scan, drift, build-status and deployment-history responses. Masked edits recover the stored value and interpolation semantics; project/service/key-scoped HMAC fingerprints let operators compare stored literal rotations without exposing secrets.              |
| [#853](https://github.com/oblien/openship/issues/853) | [Bug] openship deploy: folder upload tarball is written inside its own archive root when cwd is $TMPDIR — orphaned tarballs nest and fill the disk                                                | [#863](https://github.com/oblien/openship/pull/863)                                                      | **integrated**: Integrate PR #863 in the shared platform/SDK packager: reject staging within source and require an explicit folder-upload choice.                                                                                                                                                                                             |
| [#852](https://github.com/oblien/openship/issues/852) | [Bug]: Switching a project's branch in the deploy config UI never re-scans the repo, stale framework/compose detection from the previous branch is kept and used to deploy                        | [#855](https://github.com/oblien/openship/pull/855)                                                      | **integrated**: Integrate PR #855: rescan branch changes, discard stale Compose defaults, and save the new branch with its settings in one platform update.                                                                                                                                                                                   |
| [#851](https://github.com/oblien/openship/issues/851) | [Bug]: "Sign in with GitHub" (device flow) silently does nothing, backend returns a valid device code but the UI never displays it                                                                | [#862](https://github.com/oblien/openship/pull/862)                                                      | **integrated**: Pending GitHub device codes stay visible across stale status refreshes and account changes.                                                                                                                                                                                                                                   |
| [#849](https://github.com/oblien/openship/issues/849) | [Feature Request] Add CLI commands for self-hosted jobs                                                                                                                                           | [#850](https://github.com/oblien/openship/pull/850)                                                      | **deferred-feature**: Deferred: new CLI Jobs command surface; PR #850 is not included.                                                                                                                                                                                                                                                        |
| [#847](https://github.com/oblien/openship/issues/847) | [Bug] Push webhook that arrives during an in-progress deployment is dropped permanently (200 OK, no retry, no queue)                                                                              | —                                                                                                        | **pending**: Pending review                                                                                                                                                                                                                                                                                                                   |
| [#846](https://github.com/oblien/openship/issues/846) | [Bug] Compose services cannot join a pre-existing external Docker network (background workers are unreachable from shared services)                                                               | —                                                                                                        | **pending**: Pending review                                                                                                                                                                                                                                                                                                                   |
| [#845](https://github.com/oblien/openship/issues/845) | [Bug] Edge router drops query string on 308 trailing-slash redirect                                                                                                                               | —                                                                                                        | **already-fixed**: Current main already preserves query strings in generated trailing-slash redirects. Real OpenResty tests confirm that /ui?token=... redirects to /ui/?token=... without losing encoded values or repeated parameters; additional regression coverage is on the integration branch.                                         |
| [#844](https://github.com/oblien/openship/issues/844) | [Bug] service.environment silently overrides project env on every deploy path (and stores secrets in plaintext)                                                                                   | —                                                                                                        | **pending**: Pending review                                                                                                                                                                                                                                                                                                                   |
| [#842](https://github.com/oblien/openship/issues/842) | [Bug]: GitHub App manifest includes unsupported installation event                                                                                                                                | [#843](https://github.com/oblien/openship/pull/843)                                                      | **integrated**: Removed the unsupported installation event; retained the shared platform service.                                                                                                                                                                                                                                             |
| [#841](https://github.com/oblien/openship/issues/841) | [Bug] service sync leaves its multi-GB upload tarball in /tmp after a successful deploy                                                                                                           | —                                                                                                        | **already-fixed**: Current main service sync sends normalized Compose configuration through the SDK and creates no source archive. Source uploads separately dispose of their generated directory and tarball as soon as the upload completes; cleanup does not wait for deployment completion.                                               |
| [#837](https://github.com/oblien/openship/issues/837) | [Bug] openship-mail: Postfix and Dovecot fall back to self-signed certificate when Let's Encrypt cert is mounted                                                                                  | [#838](https://github.com/oblien/openship/pull/838)                                                      | **integrated**: Mail startup validates mounted TLS certificates and repairs both iRedMail certificate/key links, including container recreation and renewal. PR #838 was updated on the contributor branch and merged into integration after all CI checks passed.                                                                            |
| [#836](https://github.com/oblien/openship/issues/836) | [Bug]: Adding a new server from the backup UI box failed                                                                                                                                          | —                                                                                                        | **fixed**: Fixed Add server dialogs crashing outside dashboard context; backup destination state and the new server selection survive the nested modal.                                                                                                                                                                                       |
| [#835](https://github.com/oblien/openship/issues/835) | [Bug] Git-based builds never fetch submodules (no --recurse-submodules / submodule update), so repos with submodule dependencies fail at build                                                    | [#874](https://github.com/oblien/openship/pull/874)                                                      | **integrated**: Git-based builds now materialize recursive submodules at the requested parent commit across server Docker, orchestrator Docker, shared build pipelines, and cloud contexts/source inspection. GitHub archives containing .gitmodules fall back to Git.                                                                        |
| [#828](https://github.com/oblien/openship/issues/828) | [Improvement]: Make mail server sql port configurable                                                                                                                                             | [#829](https://github.com/oblien/openship/pull/829)                                                      | **integrated**: Mail setup now handles PostgreSQL host-port conflicts using a validated explicit port or a bounded automatic fallback, while preserving existing ports and credentials on repair.                                                                                                                                             |
| [#825](https://github.com/oblien/openship/issues/825) | [Bug]: GitHub connection fails during authentication - process gets stuck indefinitely                                                                                                            | [#831](https://github.com/oblien/openship/pull/831)                                                      | **already-fixed**: The linked redirect-origin fix is already handled by current main; PR #831 is superseded.                                                                                                                                                                                                                                  |
| [#819](https://github.com/oblien/openship/issues/819) | [Feature] Multi-wildcard domains, control plane isolation, 7000-series port standardization, and dashboard domain management                                                                      | —                                                                                                        | **deferred-feature**: Deferred: multi-wildcard domain management and control-plane redesign; no new platform feature work in this branch.                                                                                                                                                                                                     |
| [#818](https://github.com/oblien/openship/issues/818) | [Feature] Outbound relay domain verification notice and client privacy header scrubbing                                                                                                           | —                                                                                                        | **pending**: Pending review                                                                                                                                                                                                                                                                                                                   |
| [#817](https://github.com/oblien/openship/issues/817) | [Improvement] Synchronize backup retention pruning with backup runs and stagger system cron jobs                                                                                                  | —                                                                                                        | **pending**: Pending review                                                                                                                                                                                                                                                                                                                   |
| [#801](https://github.com/oblien/openship/issues/801) | Secret env vars come through empty on the actual running container, even when correctly stored and correctly injected at build time                                                               | [#804](https://github.com/oblien/openship/pull/804)                                                      | **pending**: Pending review                                                                                                                                                                                                                                                                                                                   |
| [#795](https://github.com/oblien/openship/issues/795) | [Bug/Help Wanted] Environment variables not passed to Dockerfile during image build in a monorepo structure                                                                                       | [#840](https://github.com/oblien/openship/pull/840)                                                      | **already-fixed**: Current main carries openship.json project environment into the encrypted deployment snapshot and forwards the decrypted values to Dockerfile ARG, including native services whose build context is the repository root. Explicit service buildArgs are optional overrides.                                                |
| [#779](https://github.com/oblien/openship/issues/779) | Enhance self-hosted image retention with age-based cleanup and runtime image visibility                                                                                                           | [#794](https://github.com/oblien/openship/pull/794), [#820](https://github.com/oblien/openship/pull/820) | **deferred-feature**: Deferred: new image-GC inspection, dry-run and retention controls; PR #794 is not included.                                                                                                                                                                                                                             |
| [#773](https://github.com/oblien/openship/issues/773) | Timeouts on several features                                                                                                                                                                      | —                                                                                                        | **pending**: Pending review                                                                                                                                                                                                                                                                                                                   |
| [#764](https://github.com/oblien/openship/issues/764) | feat(webmail): configurable sender name and email signatures                                                                                                                                      | —                                                                                                        | **deferred-feature**: Deferred: new webmail signature and sender-name settings.                                                                                                                                                                                                                                                               |
| [#758](https://github.com/oblien/openship/issues/758) | Support multiple isolated workspaces on a self-hosted OpenShip instance                                                                                                                           | —                                                                                                        | **deferred-feature**: Deferred: new self-hosted workspace management feature.                                                                                                                                                                                                                                                                 |
| [#749](https://github.com/oblien/openship/issues/749) | feat(compose): preserve container hardening controls                                                                                                                                              | [#871](https://github.com/oblien/openship/pull/871)                                                      | **deferred-feature**: Deferred: new supported Compose hardening fields; PR #871 is not included. Existing unsupported-field reporting remains.                                                                                                                                                                                                |
| [#746](https://github.com/oblien/openship/issues/746) | Folder-upload endpoint silently truncates/corrupts payloads larger than 10MB instead of rejecting them                                                                                            | —                                                                                                        | **already-fixed**: Current main streams self-hosted folder uploads to disk with backpressure and waits for completion before validating and extracting the archive. A 12 MiB incompressible upload is preserved byte-for-byte with both Content-Length and chunked transfer; oversized requests receive the documented 300 MB limit response. |
| [#717](https://github.com/oblien/openship/issues/717) | [Feature]: Support Git tags and tag patterns as deployment and update triggers                                                                                                                    | [#716](https://github.com/oblien/openship/pull/716)                                                      | **deferred-feature**: Deferred: new Git tag-pattern deployment and update triggers; PR #716 is not included.                                                                                                                                                                                                                                  |
| [#706](https://github.com/oblien/openship/issues/706) | HomeLab Networking (Internal IP's)                                                                                                                                                                | —                                                                                                        | **pending**: Pending review                                                                                                                                                                                                                                                                                                                   |
| [#695](https://github.com/oblien/openship/issues/695) | OPENSHIP                                                                                                                                                                                          | —                                                                                                        | **not-actionable**: The issue has no body, reproduction, request, or linked PR. No code change can be inferred.                                                                                                                                                                                                                               |
| [#694](https://github.com/oblien/openship/issues/694) | [Feature]: Support release mode and update tracking for container image projects                                                                                                                  | [#691](https://github.com/oblien/openship/pull/691)                                                      | **deferred-feature**: Deferred from this review: release-mode container-image feature request, linked PR already closed.                                                                                                                                                                                                                      |
| [#676](https://github.com/oblien/openship/issues/676) | Feature request: cap/serialize concurrent builds (auto-deploy fan-out corrupts containerd content store)                                                                                          | —                                                                                                        | **deferred-feature**: Deferred: configurable build queue and concurrency limits are a separate feature.                                                                                                                                                                                                                                       |
| [#672](https://github.com/oblien/openship/issues/672) | feature: service restarting auto detection after new deployments in background (not blocking) and mark project partial failed or action required if there's loop restarting                       | —                                                                                                        | **deferred-feature**: Deferred: new post-deploy restart-loop monitoring feature.                                                                                                                                                                                                                                                              |

## Review details

### #882

Failed SFTP uploads reclaim their temporary file through a bounded fresh connection and preserve the original failure.

The original PR could hang while cleaning up a dead channel and did not bound the final rename. The adaptation stops streams and timers when SSH closes, rejects premature write-stream closure, and retries cleanup on a fresh connection with a 10-second deadline.

A destination that remains unreachable can still retain the temporary file; cleanup reports that failure. This change does not sweep pre-existing process-crash leftovers.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/882#issuecomment-5685102891).

PR #883: integrated; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/883#issuecomment-5685269861).

Integration commits: `3bf8ec1d`.

Verification:

- 12 focused SFTP tests passed, including disconnect, stalled cleanup/finalization, early close, missing temporary file, and slow healthy upload
- Both new deadline regressions failed against original PR #883
- All 3,667 adapter tests passed
- Adapter, platform, and API TypeScript checks passed

### #881

Configuration keeps the project environment editor accessible for Compose, monorepo and installed-app projects. Project and service runtime scopes, overriding keys, and source-controlled build arguments are explained explicitly.

Reuses the existing project diff editor and service runtime store. Same-named production project keys are listed in the service editor without displaying values; saved secrets remain untouched during unrelated edits.

Project scope and restart-versus-rebuild guidance are translated in all nine locales. Build arguments remain edited in source configuration, without adding a new build-argument editor.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/881#issuecomment-5686850764).

Integration commits: `1cf2a605`.

Verification:

- Full dashboard suite: 1,298 tests passed; dashboard TypeScript checks passed.
- Seven real DOM interaction tests cover Configuration navigation, project env writes with preserved secrets, monorepo and installed-app access, service precedence, lookup errors, and cross-project navigation.
- Compose navigation, monorepo editor access and installed-app editor access each fail against the previous implementation.
- Locale parity checks passed; the existing missing-translation allowance decreased by four keys.

### #880

The issues and updates feeds recover from stalled upstream polls without restarting the API. DNS, polling and cache writes have deadlines, failed polls back off, and late work cannot overwrite newer cached results.

Business logic is in the shared platform, so HTTP and native SDK operations use the same deadlines and retry policy. Cold-cache reads still poll; the overall feed deadline also bounds multiple waves of stalled projects.

safeFetch now covers DNS, response bodies and all redirects with one deadline, destroys active requests and never connects when a timed-out DNS result arrives late. Cache writes use transaction-local PostgreSQL lock/statement limits and monotonic poll timestamps.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/880#issuecomment-5686651704).

Integration commits: `7392d8cb`.

Verification:

- 81 API tests passed, including both feeds through real native and HTTP SDK clients with a never-settling upstream, concurrent poll sharing, retry recovery, source changes, stale completions, DNS, SSRF and release/notification consumers.
- Three real PGlite cache tests and two real PostgreSQL/Docker lock tests passed; blocked upserts and deletes fail with PostgreSQL lock-timeout code 55P03 and recover after lock release.
- Four regression tests failed on the prior integration tree: hung DNS, hung composite poll, stale cache overwrite and stale deletion. All pass after the fix.
- API and database TypeScript checks passed.

### #879

Integrated verified Compose/self-app routing and repair diagnostics; keeping the secondary mail artifact report open.

Current main already carries service ownership for project-level routes resolved from live service rows. The remaining defects were the unmapped Compose fallback, filtering of service-bound self-app domains, missing authenticated dashboard exception on repair, and best-effort writer failures not reaching repair results.

The exception requires a real persisted instance administrator, an unrestricted credential, the same organization and an adopted self-app deployment. It applies only to the configured dashboard port, never API or edge-management ports. Existing host-port claims remain strict; no owner promotion was added.

OPENSHIP_PUBLIC_URL backfill intentionally records external ingress when self-registration did not provision an edge. Boot cannot infer permission to take over an existing proxy. The troubleshooting guide distinguishes DNS/certificates, route mapping and ingress ownership.

The secondary mail/static-root report remains unverified: invalid container/image/hash references now produce a named warning rather than a bogus document root, but the affected deployment metadata and artifact location are unavailable. Keeping #879 open for that report rather than claiming an unverified mail repair.

Integration commits: `d0e7f4f1`.

Verification:

- 264 related API tests passed, including native/HTTP repair authorization, real database host-port claim idempotence, route failures and skipped domains. The final service-inventory guard also passed all 53 project-route tests.
- Nine regression cases failed against the previous production implementation and passed after restoration. API TypeScript and documentation checks passed.

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

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/870#issuecomment-5685275371).

PR #884: integrated; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/884#issuecomment-5685276148).

Integration commits: `b2cd7842`.

PR #884 reviewed at `c9c7fbf2792b02304377b2d49336e71b80844afd`.

Verification:

- Five DOM interaction regressions pass, covering later-page search, current/main branch retention, existing-project operations, stale repository responses, error/retry, and existing description filtering.
- 17 affected GitHub/project API tests and 34 SDK project-control tests pass; API and dashboard type checks pass. Native/HTTP tests cover page metadata and cross-tenant denial.

### #867

Job alerts include the real exit status, name, duration, sanitized log tail, and failure reason.

Adapted PR #868 while preserving native authorization, cancellation, target attribution, and tracked background work. The PR forwarded a hardcoded failure code of 1; the integration carries the actual command result (tested with exit 17). Unknown exit status is not invented. Notification excerpts stay within 2,000 characters and scrub URL credentials.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/867#issuecomment-5685102133).

PR #868: integrated; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/868#issuecomment-5685273691).

Integration commits: `505b91ee`.

Verification:

- 71 jobs/API/SDK-parity/notification tests passed
- Two notification regressions failed against the unchanged source

### #865

Backup alerts include policy and destination references even when lookups fail.

Adapted PR #866 into the shared platform. Removed the nonexistent policy-name cast; use the durable policy ID and destination ID as fallbacks. Existing project/service names are preserved.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/865#issuecomment-5685101258).

PR #866: integrated; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/866#issuecomment-5685272687).

Integration commits: `98bbf603`.

Verification:

- 29 affected notification and backup tests passed, including a missing policy plus failed destination lookup

### #859

Project backup fan-out skips stateless services and rejects an empty candidate set.

Adapted PR #860 to packages/platform. Removed the blanket cron catch so infrastructure failures remain visible. Explicit custom-command/path payloads remain eligible.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/859#issuecomment-5685100566).

PR #860: integrated; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/860#issuecomment-5685271579).

Integration commits: `c200c0b2`.

Verification:

- 39 affected backup tests passed
- Both fan-out regressions failed against the unchanged source

### #858

Redeploy preflight now reads project/service domain rows and multi-port endpoints, recognizes legacy project-port bindings and free-domain defaults, and directs missing-domain fixes to the Domains tab.

Merged PR #861 while preserving its contributor commits. Explicit serviceId ownership wins over a coincidentally matching port, project routes can target unexposed services, and a targetless project row only counts when the actual project port matches. Static-path routes are not mistaken for service-port routes.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/858#issuecomment-5685655618).

PR #861: integrated; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/861#issuecomment-5685656730).

Integration commits: `05fb8a7b`.

Verification:

- 31 dashboard tests passed, including 5 DOM tests exercising the Redeploy button, loaded/fetched service bindings, and the Domains-tab action.
- All 5 new DOM tests fail against the pre-fix Deployments component, confirming the regression.
- Dashboard TypeScript check passed.

### #856

Deferred: new Authentik catalog application; PR #857 is not included.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

PR #857: feature; closed with [review status](https://github.com/oblien/openship/pull/857#issuecomment-5685279419).

### #854

Non-empty build arguments are masked across shared service, scan, drift, build-status and deployment-history responses. Masked edits recover the stored value and interpolation semantics; project/service/key-scoped HMAC fingerprints let operators compare stored literal rotations without exposing secrets.

PR #864 was updated on Abdullah Mohamed's original fork branch without force pushing. His bcdc8401 commit is retained; GitHub records the PR as merged into the integration branch.

Masking happens at the shared platform presentation boundary, so HTTP and native clients agree. Internal snapshots remain available for rollback; historical disclosure is removed on read without rewriting retained releases.

Build arguments remain whole-map replacements: missing keys are removed, an empty map clears, null inherits, an empty string stays empty, and a mask with no stored source is dropped. Names-only build-argument provenance still round-trips, and sync restores it when a minimal masked edit omits advanced settings.

Authorized includeEnv source scans keep their existing editing contract. Full repository-content permission and write access remain required; internal merge baselines never become public.

Fingerprints cover stored literal configuration, not effective runtime values or image attestations. Inherited and templated arguments are excluded; instance-key rotation changes fingerprints. Encryption-at-rest and project/service precedence in #844 remain separate work.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/854#issuecomment-5687181916).

PR #864: adapted the original contributor PR to the shared platform and merged after all CI checks passed; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/864#issuecomment-5687164147).

Integration commits: `e1a31ded`, `8c20a9b3`.

PR #864 reviewed at `e1a31ded229f5a1fd24ec73f1f1dcebec113467c`.

Verification:

- 292 targeted API tests passed, including six real-PGlite native/HTTP cases for service create/update/sync, history, drift, build status, authorization and audit output.
- 29 SDK tests passed, including the real native worker and local/staged source scans with masked and authorized build arguments.
- API typecheck and documentation checks passed (160 compiled pages, shared API reference, CLI reference and 107 typed SDK examples).
- Historical-disclosure and masked-sync regressions both failed on pre-fix feb3a05a, then passed with the restored fix.
- All CI jobs passed at e1a31ded: https://github.com/oblien/openship/actions/runs/35015115546.

### #853

Integrate PR #863 in the shared platform/SDK packager: reject staging within source and require an explicit folder-upload choice.

Kept the SDK migration: the deleted CLI folder-deploy service and obsolete tests are not revived. Physical-path validation and archive ownership live in packages/platform; the SDK packages before requesting a remote session and disposes both generated source and archive on failure.

The CLI uses its cleanup-aware exit mechanism and the shared SDK. An explicit project redeploy from outside Git uses its stored source; uploading the working directory requires --folder or the existing --name opt-in. Existing user-owned upload leftovers are preserved.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/853#issuecomment-5685465116).

PR #863: integrated; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/863#issuecomment-5685465936).

Integration commits: `e1082f44`.

Verification:

- 41 platform, SDK and CLI tests pass; platform and CLI type checks pass.
- All three source/staging overlap regressions fail against main (unsafe archives were created), and pass with the guard. Cases include exact paths, ancestors, symlink aliases/parents, common prefixes, retained build outputs, and session/upload failure cleanup.

### #852

Integrate PR #855: rescan branch changes, discard stale Compose defaults, and save the new branch with its settings in one platform update.

The scan commits its branch and defaults together only on success, prevents overlapping scans, ignores completion after switching projects, and keeps manual env edits and project settings. Unknown stacks open manual framework selection.

Adapted the PR to the paginated branch picker and main’s explicit environment-disclosure option. Replaced the PR’s separate options/branch saves with one shared-platform update so an interrupted request cannot save a different branch’s build configuration.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/852#issuecomment-5685277005).

PR #855: integrated; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/855#issuecomment-5685277650).

Integration commits: `c45bcf5d`.

Verification:

- 14 dashboard branch-rescan/picker tests and 10 actual native/HTTP GitHub/project parity tests pass. API and dashboard type checks pass.
- The branch dropdown regression fails without the updated event wiring (zero prepare requests), and passes with the fix.

### #851

Pending GitHub device codes stay visible across stale status refreshes and account changes.

PR #862 applies to the current dashboard. Device-grant polling owns completion; previously cached connectivity cannot dismiss a new grant.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/851#issuecomment-5685103736).

PR #862: integrated; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/862#issuecomment-5685274538).

Integration commits: `cfdea39b`.

Verification:

- Five DOM interaction tests passed
- Two device-flow regressions failed against unchanged main

### #849

Deferred: new CLI Jobs command surface; PR #850 is not included.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

PR #850: feature; closed with [review status](https://github.com/oblien/openship/pull/850#issuecomment-5685280232).

### #845

Current main already preserves query strings in generated trailing-slash redirects. Real OpenResty tests confirm that /ui?token=... redirects to /ui/?token=... without losing encoded values or repeated parameters; additional regression coverage is on the integration branch.

The generated static-route normalization has preserved the raw request query since 698893ec, already on main. Proxied applications own their own normalization; this verifies Openship-generated edge redirects rather than third-party application responses.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/845#issuecomment-5685659509).

Integration commits: `698893ec`, `d68de596`.

Verification:

- All 14 routing E2E tests passed against real OpenResty in an isolated local Docker environment.
- Three new response-level cases cover slash enforcement, slash stripping, and .html normalization with encoded tokens, redirect parameters, and repeated query keys. Following each redirect terminates successfully in one hop.

### #842

Removed the unsupported installation event; retained the shared platform service.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/842#issuecomment-5685099558).

PR #843: integrated; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/843#issuecomment-5685270824).

Integration commits: `8db8ee10`.

PR #843 reviewed at `224d521a5495e026a42873fe8a4412643a7c697e`.

Verification:

- API github-source.service.test.ts: 4 passed

### #841

Current main service sync sends normalized Compose configuration through the SDK and creates no source archive. Source uploads separately dispose of their generated directory and tarball as soon as the upload completes; cleanup does not wait for deployment completion.

The service sync implementation is unchanged from main c6cd723f. Successful upload cleanup was already present in the migrated SDK on main; the integration branch also includes the earlier source-staging safety improvements from #853. Existing orphan files from older versions are not deleted automatically.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/841#issuecomment-5686077328).

Integration commits: `380acf41`.

Verification:

- 14 CLI tests passed, including real service sync through SDK HTTP serialization on success and failure, with no archive or upload request.
- 17 SDK source tests passed, including cleanup immediately after successful upload and after failures.
- API, CLI, and SDK TypeScript checks passed.

### #837

Mail startup validates mounted TLS certificates and repairs both iRedMail certificate/key links, including container recreation and renewal. PR #838 was updated on the contributor branch and merged into integration after all CI checks passed.

The selected certificate must be current, valid for mail.<domain>, appropriate for TLS servers, and match the private key. A valid mail-host certificate takes precedence; an apex SAN/wildcard certificate is used only if it covers the mail host. Invalid or missing pairs leave the existing fallback intact. Stable live-path links follow renewal without linking directly to an old archive file.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/837#issuecomment-5686065653).

PR #838: adapted on the original contributor branch and merged after passing CI; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/838#issuecomment-5685980612).

Integration commits: `24153109`, `1a4f535e`.

PR #838 reviewed at `fed7b63e5ffa4bcd7795109333fd6de414845023`.

Verification:

- 10 Docker tests with real OpenSSL certificates, including a real TLS handshake, all passed.
- API TypeScript check passed. All CI jobs passed in run 35008541433 (typechecking, API, database, SDK/CLI, other packages, documentation, webmail).

### #836

Fixed Add server dialogs crashing outside dashboard context; backup destination state and the new server selection survive the nested modal.

The root ModalProvider rendered ServerForm outside PlatformProvider even when opened from a dashboard picker. A dashboard-scoped ModalProvider now renders dialogs within the existing platform/auth/cloud/mail providers; public screens retain their root modal provider.

The real destination modal, server picker, nested dialog and form run together in the regression tests. Both platform and mail views preserve the entered destination name/path, save the server, select it and submit the correct destination. A failed server save remains editable and can be retried.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/836#issuecomment-5687415204).

Integration commits: `35b72421`.

Verification:

- All 1,301 dashboard tests in 128 files passed, including three new DOM interaction cases. Dashboard TypeScript passed.
- All three new cases fail against the previous provider tree with the reported missing PlatformProvider error, then pass with the fix.

### #835

Git-based builds now materialize recursive submodules at the requested parent commit across server Docker, orchestrator Docker, shared build pipelines, and cloud contexts/source inspection. GitHub archives containing .gitmodules fall back to Git.

Preserved PR #874 commits and covered the additional orchestrator checkout and cloud Dockerfile inspection paths in the current architecture. Submodules initialize after the parent checkout, so a broken newer branch head does not break a valid rollback. Docker build contexts strip nested Git metadata.

Scoped the desktop relay Authorization header to its authorized parent repository. Other submodules use the existing credential policy; this change does not widen relay permissions or Git protocol access. Private dependencies still require credentials authorized to read them.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/835#issuecomment-5685657537).

PR #874: integrated; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/874#issuecomment-5685658506).

Integration commits: `4470767d`.

Verification:

- All 3,681 adapter tests passed; adapter TypeScript check passed.
- 85 focused tests passed, including 11 tests executing real Git commands against recursive/relative submodule fixtures, branch heads, pinned rollbacks, and unavailable dependencies.
- Seven real Git fixture tests fail against the original PR, covering missing architecture paths and rollback ordering.
- Real Git configuration matching verifies that the relay header is excluded from other repositories, lookalike paths, hosts, and HTTP downgrades.

### #828

Mail setup now handles PostgreSQL host-port conflicts using a validated explicit port or a bounded automatic fallback, while preserving existing ports and credentials on repair.

Updated and merged the original contributor PR branch; the original commits remain in history. Port probes are read-only, database bindings remain on 127.0.0.1, and unavailable or invalid explicit ports fail clearly.

Mail SQL configuration is rewritten by field, preserving unrelated listener ports, remote database connections, literal password bytes, file ownership and modes. Repair reads the existing Docker binding without requiring access to root-owned database files.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/828#issuecomment-5686470596).

PR #829: Adapted the original PR branch with safe port discovery, retained installation state, and precise SQL config reconciliation; all CI checks passed; merged into the integration branch with [review status](https://github.com/oblien/openship/pull/829#issuecomment-5686470099).

Integration commits: `00f2b982`, `1fac6341`.

PR #829 reviewed at `0bb884a16c7d3bab16603de485f3e93c2c3c2dde`.

Verification:

- All GitHub CI checks passed at 00f2b982 (run 35010792177), including both API shards, SDK/CLI, database, adapters/other packages, documentation, webmail and typechecks.
- Full adapter suite: 3,709 tests passed; mail lifecycle covers occupied ports, exhausted fallback range, custom names, retained credentials and non-default restarts.
- Nine real Python config-rewrite tests and seven Docker/PostgreSQL bootstrap tests passed, including a database listening on port 5544.
- Fifteen added regression cases failed against the original PR and passed after adaptation; API and adapter TypeScript checks and entrypoint shell syntax passed.

### #825

The linked redirect-origin fix is already handled by current main; PR #831 is superseded.

Main commit 34b3d0e6 resolves API-root redirects through resolveApiNavigationUrl before navigating. It also bounds the popup lifecycle. Reapplying PR #831 would duplicate the origin handling at a different layer. The separate device-code display bug is covered by #851.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/825#issuecomment-5685105317).

PR #831: already-fixed; closed with [review status](https://github.com/oblien/openship/pull/831#issuecomment-5685278536).

Verification:

- The existing ten dashboard URL tests pass, including proxy and split API origins
- Reviewed GitHubContext redirect navigation and its explicit timeout

### #819

Deferred: multi-wildcard domain management and control-plane redesign; no new platform feature work in this branch.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #795

Current main carries openship.json project environment into the encrypted deployment snapshot and forwards the decrypted values to Dockerfile ARG, including native services whose build context is the repository root. Explicit service buildArgs are optional overrides.

Verified the configuration shape in the report: root openship.json env plus services[].build="." and dockerfile="Dockerfile". The scanner preserves the root environment and secret flags; Docker build args inherit the project build environment even without a duplicate per-service argument map.

PR #840 by Abdullah Mohamed is already merged into main (30ae48a4d67aabe8502df2a8393753443cb0637a). It adds diagnostics for a separate build-time dependency: Compose service DNS/database availability is not supplied by forwarding ARG values. Applications must not require a runtime database hostname to resolve while building an image.

Keep the file named openship.json and declare ARG in the Dockerfile stage that needs each value. The API masking work for #854 protects later reads; it does not remove arguments from the internal build configuration.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/795#issuecomment-5687111921).

Integration commits: `c6cd723f8bd1a0665f5593daaccd0d15fd552931`.

Verification:

- On unchanged main c6cd723f: all 30 source-preparation tests passed, including the two #795 native-service and Compose provenance cases.
- On unchanged main c6cd723f: all four Docker build-argument tests passed, including project env inheritance without a duplicate service map and explicit service overrides.
- Integration build.service suite: all 78 tests passed, including #795 source env persistence, encrypted deployment snapshots and preservation of operator overrides.

### #779

Deferred: new image-GC inspection, dry-run and retention controls; PR #794 is not included.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

PR #794: feature; closed with [review status](https://github.com/oblien/openship/pull/794#issuecomment-5685281237).

### #764

Deferred: new webmail signature and sender-name settings.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #758

Deferred: new self-hosted workspace management feature.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

### #749

Deferred: new supported Compose hardening fields; PR #871 is not included. Existing unsupported-field reporting remains.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

PR #871: feature; closed with [review status](https://github.com/oblien/openship/pull/871#issuecomment-5685282420).

### #746

Current main streams self-hosted folder uploads to disk with backpressure and waits for completion before validating and extracting the archive. A 12 MiB incompressible upload is preserved byte-for-byte with both Content-Length and chunked transfer; oversized requests receive the documented 300 MB limit response.

The upload route, controller, shared folder-upload service and archive extractor are unchanged from main c6cd723f. New regression coverage exercises the real authenticated Hono route, shared platform, in-memory database, Node HTTP server, and filesystem.

GitHub: closed with [verification and integration status](https://github.com/oblien/openship/issues/746#issuecomment-5686078518).

Integration commits: `380acf41`.

Verification:

- Four real-route upload tests passed: 12 MiB normal upload, 12 MiB chunked upload, truncated gzip cleanup followed by successful retry, and HTTP 413 for a declared body above 300 MB.
- Accepted bytes are checked by SHA-256 after extraction; source archives are removed and completed sessions reject reuse.
- API TypeScript check passed.

### #717

Deferred: new Git tag-pattern deployment and update triggers; PR #716 is not included.

Excluded following the maintainer’s explicit request to focus this integration branch on bugs and general improvements. The issue remains open.

PR #716: feature; closed with [review status](https://github.com/oblien/openship/pull/716#issuecomment-5685283503).

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
