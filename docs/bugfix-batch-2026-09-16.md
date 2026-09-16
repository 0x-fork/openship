# Bug review batch — 2026-09-16

Base: `4e66349c27b48df13697c1b6d4a95f7a6cf4a3d6` (`main`, including merged PR #891).

Integration branch: `feat/bugfix-batch-2026-09-16`. The batch covers the next 50 previously unreviewed open reports, in newest-first order. New capabilities remain outside this bug-fix batch.

The previous integration worktree and old branches, including `ship`, were removed after verifying that their tips are in main. Source fixes will stay on this new integration branch until maintainer review.

## Issue ledger

| Issue | Report | Status | Linked PRs |
| --- | --- | --- | --- |
| [#671](https://github.com/oblien/openship/issues/671) | feature:  on deployments list add standalone remove snapshot option and ensure the snapshot data removed when delete the deployment info | deferred-feature | — |
| [#669](https://github.com/oblien/openship/issues/669) | feature: add publish env button after update env / updated env without need to redeploy it, as fast env update in services / project | deferred-feature | [#681](https://github.com/oblien/openship/pull/681) |
| [#668](https://github.com/oblien/openship/issues/668) | Services logs hang out / takes too much time to show logs, terminal not load with silent fail in desktop | pending-review | — |
| [#667](https://github.com/oblien/openship/issues/667) | feature: showing the live service / project logs after deployment finish in deployment page if the deployment success instead of keeping the logs | deferred-feature | [#708](https://github.com/oblien/openship/pull/708) |
| [#662](https://github.com/oblien/openship/issues/662) | feature request: support deploy another service on same domain but with another path | deferred-feature | — |
| [#661](https://github.com/oblien/openship/issues/661) | ensure release checks not duplicated | pending-review | — |
| [#660](https://github.com/oblien/openship/issues/660) | home issues shortcut update need to be background based, and opening issues can view the logs inside the page instead of showing it as modal | pending-review | — |
| [#659](https://github.com/oblien/openship/issues/659) | Server unreachable cause edge not exist issue, while the entire server is unreachable | pending-review | — |
| [#658](https://github.com/oblien/openship/issues/658) | ensuring project delete does not leave any tails or un cleaned up resources | pending-review | — |
| [#638](https://github.com/oblien/openship/issues/638) | [Bug]: Draft project deletion executes immediately without confirmation dialog | pending-review | [#639](https://github.com/oblien/openship/pull/639) |
| [#624](https://github.com/oblien/openship/issues/624) | Persist the git clone URL instead of building github.com/owner/repo | pending-review | — |
| [#612](https://github.com/oblien/openship/issues/612) | Feature: optional label on domain entries — "Domain 2" cards lose meaning on multi-domain projects (web + websocket ports) | deferred-feature | — |
| [#610](https://github.com/oblien/openship/issues/610) | Clarify licensing boundary for apps/email/engine | pending-review | — |
| [#608](https://github.com/oblien/openship/issues/608) | [Bug]: Shows no system info for macbook | pending-review | [#645](https://github.com/oblien/openship/pull/645), [#888](https://github.com/oblien/openship/pull/888) |
| [#577](https://github.com/oblien/openship/issues/577) | Feature: let a catalog app declare its default backup policy, so one click covers every service instead of a ten-field form each | deferred-feature | [#578](https://github.com/oblien/openship/pull/578) |
| [#568](https://github.com/oblien/openship/issues/568) | [Bug] Webmail branding: siteTitle and siteDescription are accepted but never rendered, and the vendor footer is not brandable | pending-review | — |
| [#558](https://github.com/oblien/openship/issues/558) | [Feature] Make Projects the entrypoint of app deployment | deferred-feature | [#744](https://github.com/oblien/openship/pull/744) |
| [#556](https://github.com/oblien/openship/issues/556) | Upstream-down hostnames return a raw OpenResty 502 instead of a friendly “Application unavailable” page | pending-review | [#557](https://github.com/oblien/openship/pull/557) |
| [#541](https://github.com/oblien/openship/issues/541) | feat(cli): `openship deployment bisect` — binary-search deployment history for the first bad deploy | deferred-feature | [#542](https://github.com/oblien/openship/pull/542) |
| [#535](https://github.com/oblien/openship/issues/535) | [Feature] Support buildStrategy: "local" for Docker stacks — build the image on the control-plane host and ship it to the target server | deferred-feature | — |
| [#530](https://github.com/oblien/openship/issues/530) | feat: enable the Uptime Kuma app template | deferred-feature | [#531](https://github.com/oblien/openship/pull/531) |
| [#527](https://github.com/oblien/openship/issues/527) | Experience as first time / new user | pending-review | — |
| [#521](https://github.com/oblien/openship/issues/521) | RFC: External installable plugin architecture (versioned outside core) | deferred-feature | — |
| [#513](https://github.com/oblien/openship/issues/513) | Add Kan.bn to the apps catalog | deferred-feature | [#522](https://github.com/oblien/openship/pull/522) |
| [#512](https://github.com/oblien/openship/issues/512) | Add Shoutrrr to the apps catalog | deferred-feature | [#526](https://github.com/oblien/openship/pull/526) |
| [#509](https://github.com/oblien/openship/issues/509) | Docker app deployment fails because the host channel is not provisioned | pending-review | [#518](https://github.com/oblien/openship/pull/518) |
| [#506](https://github.com/oblien/openship/issues/506) | [Bug] Same-server migration leaves app unreachable — "Auto" routing mode doesn't publish a loopback port | pending-review | — |
| [#505](https://github.com/oblien/openship/issues/505) | [Feature] Allow dismissing/ignoring an issue (edge_absent et al.) — or a per-server component opt-out | deferred-feature | — |
| [#504](https://github.com/oblien/openship/issues/504) | ConnectionCard is hidden for non-catalog projects — "Use in a project" is unreachable for single-app/compose/monorepo sources | pending-review | — |
| [#501](https://github.com/oblien/openship/issues/501) | Laravel asset build fails when a package ships CSS from vendor/ (Livewire Flux, Filament) — the asset stage has no vendor/ | pending-review | [#467](https://github.com/oblien/openship/pull/467) |
| [#500](https://github.com/oblien/openship/issues/500) | `onFailure` destroys carried-forward (still-live) containers when a compose deploy fails — a failed redeploy can take down the running app | pending-review | [#517](https://github.com/oblien/openship/pull/517) |
| [#495](https://github.com/oblien/openship/issues/495) | [Feature]: MFA for server accounts | deferred-feature | [#772](https://github.com/oblien/openship/pull/772) |
| [#488](https://github.com/oblien/openship/issues/488) | up dry-run reports POSTGRES_PASSWORD=<preserved> but writes a newly generated password | pending-review | — |
| [#487](https://github.com/oblien/openship/issues/487) | OPENSHIP_PGDATA detection picks the volume root when re-installing over an existing pgdata/ subdirectory | pending-review | — |
| [#483](https://github.com/oblien/openship/issues/483) | add X as a notification delivery channel | deferred-feature | — |
| [#433](https://github.com/oblien/openship/issues/433) | 🔄 Request: More Frequent `dev` Branch Updates + Release Channel Switcher | deferred-feature | — |
| [#429](https://github.com/oblien/openship/issues/429) | [Bug + Feature Request] Deleted emails stuck with TRASH label & no auto-refresh on new email | pending-review | [#430](https://github.com/oblien/openship/pull/430), [#478](https://github.com/oblien/openship/pull/478) |
| [#428](https://github.com/oblien/openship/issues/428) | Feature Request: Show a friendly "Service Not Found" page for unrecognized hostnames instead of raw SSL/TLS errors | deferred-feature | — |
| [#426](https://github.com/oblien/openship/issues/426) | [Bug] Terminal session counter not reset after browser disconnect — ghost sessions block new shells indefinitely | pending-review | [#579](https://github.com/oblien/openship/pull/579) |
| [#424](https://github.com/oblien/openship/issues/424) | How to change the binding IP address of container? | pending-review | — |
| [#417](https://github.com/oblien/openship/issues/417) | Support Cloudflare Email Sending in self-hosted SMTP settings | deferred-feature | — |
| [#415](https://github.com/oblien/openship/issues/415) | Add OpenTelemetry Collector to the apps catalog | deferred-feature | [#416](https://github.com/oblien/openship/pull/416) |
| [#411](https://github.com/oblien/openship/issues/411) | [Feature Request] Allow login with username only (without @domain) on single-domain setup | deferred-feature | — |
| [#410](https://github.com/oblien/openship/issues/410) | Rollback action permanently disabled on every deployment — status string mismatch ("ready" vs "success") | pending-review | [#542](https://github.com/oblien/openship/pull/542) |
| [#408](https://github.com/oblien/openship/issues/408) | Docker health check shows Unhealthy on external server added via SSH (password auth) despite Docker running normally | pending-review | [#422](https://github.com/oblien/openship/pull/422) |
| [#402](https://github.com/oblien/openship/issues/402) | Add a standalone PostgreSQL app to Install App or make database services easier to find | deferred-feature | [#405](https://github.com/oblien/openship/pull/405) |
| [#401](https://github.com/oblien/openship/issues/401) | Add SeaweedFS as an Install App option for self-hosted object storage | deferred-feature | [#406](https://github.com/oblien/openship/pull/406) |
| [#399](https://github.com/oblien/openship/issues/399) | Add a standalone PostgreSQL app to Install App or make database services easier to find | deferred-feature | — |
| [#398](https://github.com/oblien/openship/issues/398) | Add SeaweedFS as an Install App option for self-hosted object storage | deferred-feature | — |
| [#397](https://github.com/oblien/openship/issues/397) | Add TanStack Start support to framework detection and project setup | deferred-feature | — |

Reports marked pending have not yet been validated. Feature requests and their PRs remain open. Fixes will be recorded with main comparison, logic review, verification and contributor provenance.
