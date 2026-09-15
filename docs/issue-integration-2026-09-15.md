# First 50 issues: integration review

Snapshot: 2026-09-15, open issues in GitHub's default newest-first order.

Integration branch: `feat/issue-integration-2026-09-15`. Base: `c6cd723f8bd1a0665f5593daaccd0d15fd552931` (`main`). The original checkout and `main` are unchanged.

Every issue is checked against this base, then against the final integrated tree. A PR is accepted only after reviewing behavior, current architecture, and appropriate verification. Platform business logic belongs in `packages/platform`; HTTP controllers and SDK/CLI adapters share those operations. PR source commits and any corrective commits are recorded below.

## Issue ledger

| Issue | Report | Linked PRs | Outcome |
| --- | --- | --- | --- |
| [#882](https://github.com/oblien/openship/issues/882) | [Bug] SFTP backup failures leave .uploading-* temporary files | [#883](https://github.com/oblien/openship/pull/883) | Pending |
| [#881](https://github.com/oblien/openship/issues/881) | Service-first projects hide project environment editing and blur env scope | — | Pending |
| [#880](https://github.com/oblien/openship/issues/880) | [Bug]: GET /api/issues and GET /api/updates hang indefinitely when one project's upstream update poll never settles | — | Pending |
| [#879](https://github.com/oblien/openship/issues/879) | [Bug]: [0.7.2] Custom domains at project level are verified + certified but never routed locally; self-app domain cannot converge (host-port claim conflict) | — | Pending |
| [#878](https://github.com/oblien/openship/issues/878) | [Improvement]: Deployments don't use external repository and rebuild images instead | — | Pending |
| [#877](https://github.com/oblien/openship/issues/877) | [Feature]: Add Porkbun as a supported DNS Provider | — | Pending |
| [#876](https://github.com/oblien/openship/issues/876) | [Bug]: Email service is waiting for emails to go out forever | — | Pending |
| [#875](https://github.com/oblien/openship/issues/875) | [Bug]: Can't add self hosted openship mcp sever to claude code | — | Pending |
| [#873](https://github.com/oblien/openship/issues/873) | [Bug]: `openship.json`'s `monorepo` config (and CLI `project create --type monorepo`) is documented and schema-valid, but doesn't actually produce a multi-app project through any available path | — | Pending |
| [#872](https://github.com/oblien/openship/issues/872) | [Bug]: Global GitHub device-flow connection intermittently shows "rejected".  The status is backed by a Redis cache entry with a ~100 second TTL, not the actual GitHub authorization state | — | Pending |
| [#870](https://github.com/oblien/openship/issues/870) | [Bug]: Branch selector on "Link Repository" is unusable | [#884](https://github.com/oblien/openship/pull/884) | Pending |
| [#869](https://github.com/oblien/openship/issues/869) | Migrate to self-hosted server never actually deploys (3 stacked bugs: missing deploy trigger, release-dist path/packaging mismatch, PGlite assets crash) | — | Pending |
| [#867](https://github.com/oblien/openship/issues/867) | [Bug]: Job run failure notifications omit job name, exit code, and logs | [#868](https://github.com/oblien/openship/pull/868) | Pending |
| [#865](https://github.com/oblien/openship/issues/865) | [Improvement]: Include destination and policy references in backup job notifications | [#866](https://github.com/oblien/openship/pull/866) | Pending |
| [#859](https://github.com/oblien/openship/issues/859) | [Bug]: Project-level backup policies fan out to stateless services without volumes, causing recurring backup failures | [#860](https://github.com/oblien/openship/pull/860) | Pending |
| [#858](https://github.com/oblien/openship/issues/858) | [Bug]: False-positive "No public domain is connected" warning on redeploy | [#861](https://github.com/oblien/openship/pull/861) | Pending |
| [#856](https://github.com/oblien/openship/issues/856) | [Feature]: Add Authentik to the one-click app catalog | [#857](https://github.com/oblien/openship/pull/857) | Pending |
| [#854](https://github.com/oblien/openship/issues/854) | [Bug] buildArgs returned unmasked in the deployments API while the same key is masked in environment | [#864](https://github.com/oblien/openship/pull/864) | Pending |
| [#853](https://github.com/oblien/openship/issues/853) | [Bug] openship deploy: folder upload tarball is written inside its own archive root when cwd is $TMPDIR — orphaned tarballs nest and fill the disk | [#863](https://github.com/oblien/openship/pull/863) | Pending |
| [#852](https://github.com/oblien/openship/issues/852) | [Bug]: Switching a project's branch in the deploy config UI never re-scans the repo, stale framework/compose detection from the previous branch is kept and used to deploy | [#855](https://github.com/oblien/openship/pull/855) | Pending |
| [#851](https://github.com/oblien/openship/issues/851) | [Bug]: "Sign in with GitHub" (device flow) silently does nothing, backend returns a valid device code but the UI never displays it | [#862](https://github.com/oblien/openship/pull/862) | Pending |
| [#849](https://github.com/oblien/openship/issues/849) | [Feature Request] Add CLI commands for self-hosted jobs | [#850](https://github.com/oblien/openship/pull/850) | Pending |
| [#847](https://github.com/oblien/openship/issues/847) | [Bug] Push webhook that arrives during an in-progress deployment is dropped permanently (200 OK, no retry, no queue) | — | Pending |
| [#846](https://github.com/oblien/openship/issues/846) | [Bug] Compose services cannot join a pre-existing external Docker network (background workers are unreachable from shared services) | — | Pending |
| [#845](https://github.com/oblien/openship/issues/845) | [Bug] Edge router drops query string on 308 trailing-slash redirect | — | Pending |
| [#844](https://github.com/oblien/openship/issues/844) | [Bug] service.environment silently overrides project env on every deploy path (and stores secrets in plaintext) | — | Pending |
| [#842](https://github.com/oblien/openship/issues/842) | [Bug]: GitHub App manifest includes unsupported installation event | [#843](https://github.com/oblien/openship/pull/843) | Pending |
| [#841](https://github.com/oblien/openship/issues/841) | [Bug] service sync leaves its multi-GB upload tarball in /tmp after a successful deploy | — | Pending |
| [#837](https://github.com/oblien/openship/issues/837) | [Bug] openship-mail: Postfix and Dovecot fall back to self-signed certificate when Let's Encrypt cert is mounted | [#838](https://github.com/oblien/openship/pull/838) | Pending |
| [#836](https://github.com/oblien/openship/issues/836) | [Bug]: Adding a new server from the backup UI box failed | — | Pending |
| [#835](https://github.com/oblien/openship/issues/835) | [Bug] Git-based builds never fetch submodules (no --recurse-submodules / submodule update), so repos with submodule dependencies fail at build | [#874](https://github.com/oblien/openship/pull/874) | Pending |
| [#828](https://github.com/oblien/openship/issues/828) | [Improvement]: Make mail server sql port configurable | [#829](https://github.com/oblien/openship/pull/829) | Pending |
| [#825](https://github.com/oblien/openship/issues/825) | [Bug]: GitHub connection fails during authentication - process gets stuck indefinitely | [#831](https://github.com/oblien/openship/pull/831) | Pending |
| [#819](https://github.com/oblien/openship/issues/819) | [Feature] Multi-wildcard domains, control plane isolation, 7000-series port standardization, and dashboard domain management | — | Pending |
| [#818](https://github.com/oblien/openship/issues/818) | [Feature] Outbound relay domain verification notice and client privacy header scrubbing | — | Pending |
| [#817](https://github.com/oblien/openship/issues/817) | [Improvement] Synchronize backup retention pruning with backup runs and stagger system cron jobs | — | Pending |
| [#801](https://github.com/oblien/openship/issues/801) | Secret env vars come through empty on the actual running container, even when correctly stored and correctly injected at build time | [#804](https://github.com/oblien/openship/pull/804) | Pending |
| [#795](https://github.com/oblien/openship/issues/795) | [Bug/Help Wanted] Environment variables not passed to Dockerfile during image build in a monorepo structure | [#840](https://github.com/oblien/openship/pull/840) | Pending |
| [#779](https://github.com/oblien/openship/issues/779) | Enhance self-hosted image retention with age-based cleanup and runtime image visibility | [#794](https://github.com/oblien/openship/pull/794), [#820](https://github.com/oblien/openship/pull/820) | Pending |
| [#773](https://github.com/oblien/openship/issues/773) | Timeouts on several features | — | Pending |
| [#764](https://github.com/oblien/openship/issues/764) | feat(webmail): configurable sender name and email signatures | — | Pending |
| [#758](https://github.com/oblien/openship/issues/758) | Support multiple isolated workspaces on a self-hosted OpenShip instance | — | Pending |
| [#749](https://github.com/oblien/openship/issues/749) | feat(compose): preserve container hardening controls | [#871](https://github.com/oblien/openship/pull/871) | Pending |
| [#746](https://github.com/oblien/openship/issues/746) | Folder-upload endpoint silently truncates/corrupts payloads larger than 10MB instead of rejecting them | — | Pending |
| [#717](https://github.com/oblien/openship/issues/717) | [Feature]: Support Git tags and tag patterns as deployment and update triggers | [#716](https://github.com/oblien/openship/pull/716) | Pending |
| [#706](https://github.com/oblien/openship/issues/706) | HomeLab Networking (Internal IP's) | — | Pending |
| [#695](https://github.com/oblien/openship/issues/695) | OPENSHIP | — | Pending |
| [#694](https://github.com/oblien/openship/issues/694) | [Feature]: Support release mode and update tracking for container image projects | [#691](https://github.com/oblien/openship/pull/691) | Pending |
| [#676](https://github.com/oblien/openship/issues/676) | Feature request: cap/serialize concurrent builds (auto-deploy fan-out corrupts containerd content store) | — | Pending |
| [#672](https://github.com/oblien/openship/issues/672) | feature: service restarting auto detection after new deployments in background (not blocking) and mark project partial failed or action required if there's loop restarting | — | Pending |

## Verification and review details

Review in progress. External provider checks are distinguished from local automated checks.
