# Managed Cloud servers

A Cloud subscription owns one Oblien server. Projects select that server through
`serverId`, exactly as projects select a connected self-hosted server. The indexed
`project.workspaceId` is derived from the server and identifies its subscription;
provider VM IDs are internal execution bindings, never application container IDs.

## Shared execution

| Responsibility | Connected server | Managed Cloud server |
| --- | --- | --- |
| Docker applications | `DockerRuntime` via socket or SSH | `CloudDockerRuntime`, extending `DockerRuntime`, via an authenticated Oblien bridge |
| Bare applications | `BareRuntime` with host supervision | `BareRuntime` with `CloudProcessSupervisor` |
| Commands, files, builds and terminal | Local/SSH executor | `CloudWorkspaceExecutor` and provider terminal |
| Routes and certificates | Host edge provider | `CloudInfraProvider` and Oblien Pages/routes |
| Host purchase, resize and deletion | Server owner | Subscription operations |

There is no separate native per-project Cloud deployment engine. Bare is a
project runtime choice on the same managed server; Docker sidecars remain Docker
containers. Builds, releases, environments, backups and project cleanup use the
shared engines. Application operations never create, resize or delete a VM.
An unbound Cloud platform can inspect infrastructure but rejects application work
until the server, subscription, namespace and project ownership are resolved.

## Capacity and lifecycle

Checkout provisions the purchased server once. A sole destination is selected
automatically; adding another server starts an independent subscription. Projects
use the host's full available CPU and memory by default (`unlimited`, represented
as zero container limits). Optional project and Compose limits use the same
inheritance and Docker enforcement as connected servers; they never resize the VM.
The destination settings page keeps the server picker above visible settings and
a preview/Continue sidebar. New v8 offers impose no project or service-count limit within the purchased
server; the provider namespace permits one VM. Saved paid contracts keep their
own limits. Disk usage is measured from the filesystem and Docker inventory. Shared
images, caches and system files are reported separately from project data.

A source build uses measured free CPU and memory, with operating-system headroom.
Builds and host changes coordinate through the existing server activity lock.
A resize stores the prior host state and running container/process identities
before asking Oblien to change resources. Recovery continues after a lost response
or cancellation, restores only previously running applications, and verifies the
provider's allocation. A stopped server stays stopped. Disks are never shrunk.

Project deletion removes project-owned runtimes, routes and selected persistent
data. It retains the host, subscription, neighboring projects and retained data
when volume deletion is not requested. Only an empty server whose subscription
has ended can enter host deletion. Financial history remains with the provider.

## Boundaries and recovery

- `serverId`, subscription, namespace and project ownership are checked before
  opening the provider connection. A Cloud request cannot fall through to the
  control plane's local Docker socket or filesystem.
- Provider credentials and runtime tokens stay server-side. Source uploads must
  belong to the same organization, project and server; a stored local path is not
  authorization to transfer a control-plane directory.
- Host activity uses `cloud:workspace-activity:<subscription>`. Runtime/route
  mutations use `cloud:server:<provider VM>`, and transport setup has its own
  `cloud:docker-bridge:<provider VM>` lock. Do not acquire an outer activity lock
  again from a runtime operation that is already inside it.
- Oblien ingress and certificates are provider-owned. Route writes validate
  project listeners and replace the complete desired rule table. Operation logs
  and failures remain visible; an HTTP acknowledgement alone is not proof that
  a VM or process completed its state transition.
- Stopped managed hosts are not restarted by monitoring. Docker health and
  usage reuse the shared collectors; reads stay project-scoped and sampling
  budgets remain per physical server. Bare usage follows its process identity.

Customer migration is outside this implementation. No compatibility engine,
customer backfill job, or automatic project migration is included.

## Verification boundaries

The real API route graph must pass the boot scanner in both Cloud and self-hosted
modes. Runtime verification covers project isolation, environment/data retention,
source ownership, provider failures, resize recovery, routing and disposal.
Disposable local Docker tests exercise the shared engine without using customer
resources. Provider simulation cannot certify the deployed Oblien API; the
staging smoke script requires separate test credentials and explicit execution.

Before release, run `packages/adapters/scripts/verify-cloud-docker.ts` against a
disposable staging namespace. It checks the authenticated Docker bridge, source
builds, routes, retained-image rollback, volumes and server restart. It also
checks the provider's process contract: creation preserves the requested workload
ID; reads return saved command, environment and labels; Start/Stop persist
`enabled`; stopped processes stay stopped
after restarting the server. SDK type checking and simulated responses do not
prove these live provider guarantees.
