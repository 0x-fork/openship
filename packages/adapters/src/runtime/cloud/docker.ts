import { createHash } from "node:crypto";
import { posix } from "node:path";
import type { Oblien, Runtime, RoutesInput } from "oblien";
import { AppError, SYSTEM, safeErrorMessage, isHostPathSource } from "@repo/core";
import { DockerRuntime } from "../docker";
import { CloudRuntime, type CloudAdminProxy } from "../cloud";
import { BuildLogger, sq } from "../build-pipeline";
import type { BuildConfig, ContainerInfo, DeployConfig, LogCallback, ProvisionLock, RouteConfig } from "../../types";
import type { DockerRegistryAuth } from "../docker-auth";
import type { MultiServiceDeployConfig, MultiServiceDeployResult, MultiServiceGroupHandle } from "../types";
import { CloudWorkspaceExecutor } from "./workspace-executor";
import { cloudPageHostnames } from "./page-hostnames";
import { dockerWebSocketStream } from "./docker-transport";
import { CLOUD_DOCKER_BRIDGE_PORT, CLOUD_DOCKER_BRIDGE_SOURCE, CLOUD_DOCKER_BRIDGE_VERSION } from "./docker-bridge-source";
import { assertDockerWorkspaceOwner, cloudWorkspaceStatus, isDockerWorkspaceRunning, waitForCloudDockerWorkspace } from "./workspace-ready";
import { resolveEnvironment } from "../../system/environment";
import { envOps, opScript } from "../../system/environment-ops";
import { cloudDockerProjectPaths } from "./docker-paths";
import { scopeVolumeBinds } from "../volume-namespace";

export const CLOUD_DOCKER_IMAGE = "oblien/docker:29";
export { CLOUD_DOCKER_ROUTE_ROOT } from "./docker-paths";
// Keep these installation identities stable when the bridge version changes,
// so an upgrade replaces its process instead of creating a second port owner.
const BRIDGE_SCRIPT = "/opt/openship/cloud-docker/bridge-v1.py";
const BRIDGE_WORKLOAD = "openship-docker-api-v1";

export interface CloudDockerOptions {
  workspaceId: string;
  projectId: string;
  /** Logical subscription owner. Omitted only for existing project-owned hosts. */
  ownerWorkspaceId?: string;
  namespace: string;
  /** Provider-authorized domain; production uses Openship's configured domain. */
  publicDomain?: string;
  adminProxy?: CloudAdminProxy;
  beforeProvision?: () => Promise<void>;
  /** Explicit opt-in for a desktop/self-hosted source transfer; SaaS denies it. */
  allowHostSource?: boolean;
  provisionLock: ProvisionLock;
  bridgeLock?: ProvisionLock;
  resolveRegistryAuth: (ref: string) => Promise<DockerRegistryAuth | undefined>;
}

function notFound(error: unknown): boolean {
  const e = error as { status?: number; statusCode?: number };
  return e?.status === 404 || e?.statusCode === 404;
}

/** Health is a short protocol marker. Never retain a provider error body,
 * signed URL or an unbounded response in a deployment error. */
async function bridgeVersionMatches(response: Response): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) return false;
  let body = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode() === CLOUD_DOCKER_BRIDGE_VERSION;
      if (value.length > 256 || body.length + value.length > 256) return false;
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Docker semantics on a single permanent Oblien workspace. Resource identity
 * stays explicit: container IDs identify containers; workspaceId identifies the
 * shared host. Inherited retention/rollback never stop or delete that host. */
export class CloudDockerRuntime extends DockerRuntime {
  override readonly name = "cloud";
  readonly workspaceId: string;
  readonly projectId: string;
  readonly executor: CloudWorkspaceExecutor;
  private readonly cloud: CloudRuntime;
  private bridgePromise?: Promise<void>;
  private sourcePath?: string;
  private sourceBase?: string;
  private sourcePromise?: Promise<void>;

  private constructor(private readonly client: Oblien, private readonly options: CloudDockerOptions) {
    let getRuntime!: () => Promise<Runtime>;
    let connect!: () => ReturnType<typeof dockerWebSocketStream>;
    const executor = new CloudWorkspaceExecutor(() => getRuntime());
    super({ transport: "cloud", executor, cloudConnection: () => connect(), resolveRegistryAuth: options.resolveRegistryAuth }, null, options.provisionLock);
    this.workspaceId = options.workspaceId;
    this.projectId = options.projectId;
    this.executor = executor;
    this.cloud = new CloudRuntime(client, { namespace: options.namespace, adminProxy: options.adminProxy, beforeProvision: options.beforeProvision });
    getRuntime = () => this.workspaceRuntime();
    connect = () => this.connectBridge();
  }

  static async forWorkspace(client: Oblien, options: CloudDockerOptions): Promise<CloudDockerRuntime> {
    if (!options.namespace || !options.workspaceId || !options.projectId) throw new Error("Cloud Docker requires a project and an owned workspace");
    const runtime = new CloudDockerRuntime(client, options);
    try { await runtime.initializeDocker(); return runtime; }
    catch (error) { await runtime.dispose(); throw error; }
  }

  private workspaceRuntime(): Promise<Runtime> {
    // The SDK refreshes its cached runtime token; don't cache it forever here.
    return this.client.workspace(this.workspaceId).runtime();
  }

  private async connectBridge() {
    for (let attempt = 0; ; attempt++) {
      await this.ensureBridge();
      try { return await dockerWebSocketStream((await this.workspaceRuntime()).proxy(CLOUD_DOCKER_BRIDGE_PORT).ws("/docker")); }
      catch (error) {
        this.bridgePromise = undefined;
        // A cold restart can invalidate both a cached readiness result and the
        // SDK token. Retry the handshake once after probing again. The transport
        // has not forwarded any Docker request bytes until this promise resolves.
        if (attempt !== 0) throw error;
      }
    }
  }

  private ensureBridge(): Promise<void> {
    const initialize = async () => {
      const info = await this.client.workspaces.get(this.workspaceId);
      assertDockerWorkspaceOwner(info, this.options.namespace);
      if (!isDockerWorkspaceRunning(info)) throw new Error("The project's Docker workspace is stopped. Start a service or deploy to resume it.");
      let runtime = await this.workspaceRuntime();
      let refreshed = false;
      let lastProbe = "No health response";
      const ready = async (): Promise<boolean> => {
        let response: Response;
        try {
          response = await runtime.proxy(CLOUD_DOCKER_BRIDGE_PORT).fetch("/health", { signal: AbortSignal.timeout(5000), redirect: "error" });
        } catch (error) {
          lastProbe = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
            ? "Bridge health request timed out" : "Bridge health network request failed";
          return false;
        }
        const requestId = response.headers.get("x-request-id");
        const reference = requestId && /^[a-zA-Z0-9_.:-]{1,128}$/.test(requestId) ? `; request ${requestId}` : "";
        lastProbe = `Bridge health HTTP ${response.status}${reference}`;
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          if (response.status === 401 && !refreshed) {
            refreshed = true;
            try {
              // Refresh only through this namespace's existing client. A revoked
              // namespace credential must still fail the control-plane check.
              runtime = await this.client.workspace(this.workspaceId).runtime({ force: true });
            } catch {
              throw new AppError(`The workspace Docker connection is unavailable: ${lastProbe}; workspace ${this.workspaceId}. Runtime credential refresh failed. Check namespace access.`,
                503, "CLOUD_DOCKER_PROXY_UNAVAILABLE");
            }
            return ready();
          }
          // Installing or restarting Python cannot repair a missing platform
          // route or an authentication failure. Preserve the actual rejection.
          if ([401, 403, 404, 405, 501].includes(response.status)) {
            const accessRejected = [401, 403].includes(response.status);
            const hint = accessRejected
              ? "Oblien rejected access to the workspace proxy. Check runtime credentials and namespace access."
              : "Check that this workspace has a current Oblien runtime with the /proxy route and Docker bridge support.";
            throw new AppError(`The workspace Docker connection is unavailable: ${lastProbe}; workspace ${this.workspaceId}. ${hint}`,
              accessRejected ? 503 : 502, accessRejected ? "CLOUD_DOCKER_PROXY_UNAVAILABLE" : "CLOUD_RUNTIME_PROXY_UNAVAILABLE");
          }
          return false;
        }
        try {
          if (await bridgeVersionMatches(response)) return true;
          lastProbe += "; unexpected bridge version";
        } catch { lastProbe += "; health response interrupted"; }
        return false;
      };
      if (await ready()) return;
      await this.executor.exec("docker info --format '{{.ServerVersion}}'", { timeout: 60_000 });
      const hasPython = await this.executor.exec("command -v python3").then(() => true, () => false);
      if (!hasPython) {
        const install = envOps(await resolveEnvironment(this.executor)).pkgInstall(["python3"], { installRecommends: false });
        if (!install.supported) throw new Error(install.reason);
        await this.executor.exec(opScript(install.value), { timeout: 300_000 });
      }
      await this.executor.writeFile(BRIDGE_SCRIPT, CLOUD_DOCKER_BRIDGE_SOURCE, { mode: 0o700 });
      const workspace = this.client.workspace(this.workspaceId);
      const workload = (await workspace.workloads.list({ name: BRIDGE_WORKLOAD }))
        .find(item => item.name === BRIDGE_WORKLOAD);
      if (workload) {
        const state = String(workload.state ?? workload.status ?? "");
        if (["stopped", "failed", "exited"].includes(state)) {
          await workspace.workloads.start(workload.id);
        } else if (!(await ready())) {
          // Replacing the script does not update an already-running Python
          // process. Restart only the bridge, keeping Docker services running.
          await workspace.workloads.stop(workload.id);
          await workspace.workloads.start(workload.id);
        }
      } else {
          await workspace.workloads.create({ name: BRIDGE_WORKLOAD,
            cmd: ["python3", BRIDGE_SCRIPT], restart_policy: "always", max_restarts: 0,
            labels: { "openship.workspace": this.workspaceId, "openship.role": "docker-api" } });
      }
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        if (await ready()) return;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      const failed = await workspace.workloads.list({ name: BRIDGE_WORKLOAD })
        .then(items => items.find(item => item.name === BRIDGE_WORKLOAD), () => undefined);
      const state = String(failed?.state ?? failed?.status ?? "unknown");
      const safeState = /^[a-z_]{1,32}$/.test(state) ? state : "unknown";
      throw new AppError(`The workspace Docker connection did not become ready: ${lastProbe}; Bridge state: ${safeState}; workspace ${this.workspaceId}. Check the workspace runtime proxy and the ${BRIDGE_WORKLOAD} workload.`,
        503, "CLOUD_DOCKER_BRIDGE_NOT_READY");
    };
    return this.bridgePromise ??= (this.options.bridgeLock ? this.options.bridgeLock.run(initialize) : initialize())
      .catch(error => { this.bridgePromise = undefined; throw error; });
  }

  private assertProject(projectId: string): void {
    if (projectId !== this.projectId) throw new Error("Docker workspace belongs to a different project");
  }

  private async inspectOwnedContainer(containerId: string) {
    let container;
    try { container = await this.docker.getContainer(containerId).inspect(); }
    catch (error) { if (notFound(error)) return null; throw error; }
    if (this.options.ownerWorkspaceId && container.Config?.Labels?.["openship.project"] !== this.projectId) {
      throw new AppError("Container does not belong to this project", 404, "CONTAINER_NOT_FOUND");
    }
    return container;
  }

  protected override async assertContainerAccess(containerId: string): Promise<void> {
    if (this.options.ownerWorkspaceId) await this.inspectOwnedContainer(containerId);
  }

  protected override networkLabels(slug: string): Record<string, string> {
    return { ...super.networkLabels(slug), ...(this.options.ownerWorkspaceId ? { "openship.project": this.projectId } : {}) };
  }
  protected override eventLabelFilters() { return this.options.ownerWorkspaceId ? [`openship.project=${this.projectId}`] : []; }

  override async assertBackupAccess(projectId: string, input: { containerId?: string | null; sources?: readonly string[] }) {
    this.assertProject(projectId);
    if (!this.options.ownerWorkspaceId) return;
    if (input.containerId) await this.assertContainerAccess(input.containerId);
    for (const source of input.sources ?? []) {
      if (isHostPathSource(source)) {
        if (!posix.isAbsolute(source) || !posix.resolve(source).startsWith(`${this.projectPaths.mounts}/`)) throw new AppError("Backup source does not belong to this project", 403, "CLOUD_STORAGE_FORBIDDEN");
        const path = (await this.executor.exec(`readlink -f -- ${sq(source)}`)).trim();
        if (!path.startsWith(`${this.projectPaths.mounts}/`)) throw new AppError("Backup source escapes this project's storage", 403, "CLOUD_STORAGE_FORBIDDEN");
      } else {
        const volume = await this.docker.getVolume(source).inspect();
        if (volume.Labels?.["openship.project"] !== this.projectId) throw new AppError("Backup volume does not belong to this project", 403, "CLOUD_STORAGE_FORBIDDEN");
      }
    }
  }

  override async ensureNetwork(slug: string, signal?: AbortSignal) {
    const id = await super.ensureNetwork(slug, signal);
    if (this.options.ownerWorkspaceId) {
      const info = await this.docker.getNetwork(id).inspect();
      if (info.Labels?.["openship.project"] !== this.projectId) throw new AppError("Network belongs to another project", 409, "CLOUD_NETWORK_CONFLICT");
    }
    return id;
  }

  override async removeNetwork(slug: string) {
    if (this.options.ownerWorkspaceId) {
      try {
        const network = await this.docker.getNetwork(`openship-${slug}`).inspect();
        if (network.Labels?.["openship.project"] !== this.projectId) throw new AppError("Network belongs to another project", 409, "CLOUD_NETWORK_CONFLICT");
      } catch (error) { if (notFound(error)) return; throw error; }
    }
    return super.removeNetwork(slug);
  }

  override async listProjectContainerIds(id: string) { this.assertProject(id); return super.listProjectContainerIds(id); }
  override async listProjectImages(id: string) { this.assertProject(id); return super.listProjectImages(id); }
  override async pruneProjectDanglingImages(id: string) { this.assertProject(id); return super.pruneProjectDanglingImages(id); }
  override async listDeploymentContainers(id: string) {
    const containers = await super.listDeploymentContainers(id);
    if (!this.options.ownerWorkspaceId) return containers;
    const owned = new Set(await this.listProjectContainerIds(this.projectId));
    return containers.filter(container => owned.has(container.containerId));
  }

  private async accessibleImage(ref: string) {
    const image = await this.docker.getImage(ref).inspect();
    const owner = image.Config?.Labels?.["openship.project"];
    if (this.options.ownerWorkspaceId && owner && owner !== this.projectId) throw new AppError("Image belongs to another project", 404, "IMAGE_NOT_FOUND");
    return image;
  }
  override async removeImage(ref: string) {
    if (this.options.ownerWorkspaceId) {
      try { if ((await this.accessibleImage(ref)).Config?.Labels?.["openship.project"] !== this.projectId) return; }
      catch (error) { if (notFound(error)) return; throw error; }
    }
    return super.removeImage(ref);
  }
  override async saveImage(...args: Parameters<DockerRuntime["saveImage"]>) { await this.accessibleImage(args[0]); return super.saveImage(...args); }
  override async inspectImageEnv(...args: Parameters<DockerRuntime["inspectImageEnv"]>) {
    try { await this.accessibleImage(args[0]); } catch (error) { if (error instanceof AppError || !notFound(error)) throw error; }
    return super.inspectImageEnv(...args);
  }
  override async inspectImageCmd(ref: string) { await this.accessibleImage(ref); return super.inspectImageCmd(ref); }
  override async tagImage(source: string, target: string) {
    await this.accessibleImage(source);
    try { await this.accessibleImage(target); } catch (error) { if (error instanceof AppError || !notFound(error)) throw error; }
    return super.tagImage(source, target);
  }
  override async publishImage(...args: Parameters<DockerRuntime["publishImage"]>) { await this.accessibleImage(args[0]); return super.publishImage(...args); }
  override async joinServiceGroupContainers(...args: Parameters<DockerRuntime["joinServiceGroupContainers"]>) {
    for (const member of args[1]) await this.assertContainerAccess(member.containerId);
    return super.joinServiceGroupContainers(...args);
  }
  override async leaveServiceGroupContainers(...args: Parameters<DockerRuntime["leaveServiceGroupContainers"]>) {
    for (const id of args[1]) await this.assertContainerAccess(id);
    return super.leaveServiceGroupContainers(...args);
  }
  override async attachToExternalNetworks(...args: Parameters<DockerRuntime["attachToExternalNetworks"]>) {
    this.assertProject(args[0]);
    for (const id of [...(args[2] ?? []), ...(args[3]?.onlyContainerIds ?? [])]) await this.assertContainerAccess(id);
    return super.attachToExternalNetworks(...args);
  }
  override async listAllVolumes() {
    const volumes = await super.listAllVolumes();
    return this.options.ownerWorkspaceId ? volumes.filter(volume => volume.labels["openship.project"] === this.projectId) : volumes;
  }
  override async listAllNetworks() {
    const networks = await super.listAllNetworks();
    return this.options.ownerWorkspaceId ? networks.filter(network => network.labels["openship.project"] === this.projectId) : networks;
  }
  override async removeVolume(name: string) {
    if (this.options.ownerWorkspaceId) {
      try {
        const volume = await this.docker.getVolume(name).inspect();
        if (volume.Labels?.["openship.project"] !== this.projectId) throw new AppError("Volume belongs to another project", 409, "CLOUD_VOLUME_CONFLICT");
      } catch (error) { if (notFound(error)) return; throw error; }
    }
    return super.removeVolume(name);
  }

  private async ownedVolumeBinds(slug: string, volumes: string[]) {
    const scoped = scopeVolumeBinds(slug, volumes, true);
    if (!this.options.ownerWorkspaceId) return scoped;
    for (const spec of scoped) {
      const source = spec.split(":")[0]!;
      if (isHostPathSource(source)) continue;
      try {
        const volume = await this.docker.getVolume(source).inspect();
        if (volume.Labels?.["openship.project"] !== this.projectId) throw new AppError("A volume with this name belongs to another project. Choose a different name.", 409, "CLOUD_VOLUME_CONFLICT");
      } catch (error) {
        if (!notFound(error)) throw error;
        await this.docker.createVolume({ Name: source, Labels: { "openship.project": this.projectId } });
        // Dockerode returns a volume handle, not the creation response. Inspect
        // the persisted label too: creation can race a pre-existing volume.
        const created = await this.docker.getVolume(source).inspect();
        if (created.Labels?.["openship.project"] !== this.projectId) throw new AppError("Volume ownership changed during creation", 409, "CLOUD_VOLUME_CONFLICT");
      }
    }
    return scoped;
  }

  private async canSpend(): Promise<void> { await this.options.beforeProvision?.(); }
  private get publicDomain(): string { return this.options.publicDomain ?? SYSTEM.DOMAINS.CLOUD_DOMAIN; }
  private get projectPaths() { return cloudDockerProjectPaths(this.projectId, this.options.ownerWorkspaceId); }

  /** Acquire source once, on the workspace. Also serves image-only Compose
   * stacks whose relative bind mounts need repository files. */
  async prepareComposeSource(config: BuildConfig, logger = new BuildLogger()): Promise<void> {
    this.assertProject(config.projectId);
    if (config.localPath && !this.options.allowHostSource) throw new Error("Cloud builds cannot read source paths on the control-plane host");
    // Image-only deploys have no checkout. In particular, don't cache an empty
    // tree before the compose builder supplies an inline catalog context.
    if (!config.inlineSourceFiles && !config.sourceStaged && !config.localPath && !config.repoUrl) return;
    return this.sourcePromise ??= (async () => {
      await this.canSpend();
      const source = `/tmp/openship-cloud-source-${createHash("sha256").update(config.sessionId).digest("hex").slice(0, 24)}`;
      const files = config.inlineSourceFiles?.map(file => {
        if (typeof file.path !== "string" || typeof file.content !== "string" || file.path.includes("\0")) {
          throw new Error("Invalid inline build source file");
        }
        const relative = file.path.replaceAll("\\", "/");
        const path = posix.resolve(source, relative);
        if (posix.isAbsolute(relative) || !path.startsWith(`${source}/`)) {
          throw new Error("Inline build file escapes its source directory");
        }
        return { path, content: file.content };
      });
      await this.executor.mkdir(source);
      try {
        if (files) {
          for (const file of files) await this.executor.writeFile(file.path, file.content);
        } else if (config.sourceStaged && config.cloudWorkspaceId) {
          const upload = await this.client.workspaces.get(config.cloudWorkspaceId);
          assertDockerWorkspaceOwner(upload, this.options.namespace);
          const from = await this.client.workspace(upload.id).runtime();
          const archive = await from.transfer.download({ paths: ["/app/."] });
          if (!archive.ok || !archive.body) throw new Error("Uploaded project source is unavailable");
          const transferred = await (await this.workspaceRuntime()).transfer.upload({ dest: source, body: archive.body });
          if (!transferred.success) throw new Error("Could not transfer uploaded source to the Docker workspace");
        } else if (config.localPath) {
          await this.executor.transferIn(config.localPath, source, logger.callback);
        } else if (config.repoUrl) {
          await super.cloneSourceOnRemote(config, source, logger);
        }
        const base = posix.resolve(source, config.rootDirectory || ".");
        if (base !== source && !base.startsWith(`${source}/`)) throw new Error("Compose source directory escapes the repository");
        this.sourcePath = source;
        this.sourceBase = base;
      } catch (error) {
        await this.executor.rm(source).catch(() => {});
        throw error;
      }
    })();
  }

  protected override async cloneSourceOnRemote(config: BuildConfig, directory: string, logger: BuildLogger): Promise<void> {
    await this.prepareComposeSource(config, logger);
    await this.executor.exec(`mkdir -p ${sq(directory)} && cp -a ${sq(this.sourcePath!)}/. ${sq(directory)}/`);
  }

  override async build(config: BuildConfig, logger?: BuildLogger) {
    this.assertProject(config.projectId);
    await this.canSpend();
    await this.prepareComposeSource(config, logger);
    return super.build(this.remoteBuild(config), logger);
  }
  override async buildImages(specs: Parameters<DockerRuntime["buildImages"]>[0], logger: BuildLogger) {
    for (const spec of specs) this.assertProject(spec.config.projectId);
    await this.canSpend();
    if (specs.length) await this.prepareComposeSource(specs[0]!.config, logger);
    return super.buildImages(specs.map(spec => ({ ...spec, config: this.remoteBuild(spec.config) })), logger);
  }
  private remoteBuild(config: BuildConfig): BuildConfig {
    // Repository commands must not run on the SaaS control plane. Inline/folder
    // sources are transferred; Git sources clone directly inside the workspace.
    return { ...config, cloneOnServer: true, localPath: undefined, staticExtractOnly: false };
  }

  protected override deploymentPorts(config: DeployConfig) {
    this.assertProject(config.projectId);
    const ports = config.portless ? [] : [...new Set([config.port, ...(config.publicEndpoints ?? []).map(endpoint => endpoint.port ?? config.port)])];
    if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) throw new Error("Invalid cloud service port");
    // Docker allocates distinct host ports atomically. The provider exposes a
    // port only when the normal deployment routing step publishes its route.
    return ports.map(port => ({ port, hostIp: "0.0.0.0", hostPort: undefined }));
  }

  protected override async deploymentVolumeBinds(config: DeployConfig): Promise<string[]> {
    this.assertProject(config.projectId);
    const image = await this.accessibleImage(config.imageRef!);
    const volumes = await this.persistentMounts({ ...config, volumes: config.volumes ?? [],
      slug: config.slug || config.projectId, serviceName: config.networkAlias || "app",
    }, Object.keys(image.Config?.Volumes ?? {}));
    return this.ownedVolumeBinds(config.slug || config.projectId, volumes);
  }

  override async deploy(config: DeployConfig, onLog?: LogCallback) {
    this.assertProject(config.projectId);
    await this.canSpend();
    await this.ensureBridge();
    // Even a single web app/worker gets a project network on a subscribed host.
    return super.deploy(this.options.ownerWorkspaceId ? { ...config, networkAlias: config.networkAlias || "app" } : config, onLog);
  }

  override async ensureServiceGroup(config: Parameters<DockerRuntime["ensureServiceGroup"]>[0]) {
    this.assertProject(config.projectId);
    await this.canSpend();
    await this.ensureBridge();
    return super.ensureServiceGroup(config);
  }

  /** Stopped containers still own their bindings. Docker's list endpoint omits
   * those ports, but allocating or validating routes must use the same inventory. */
  private async publishedContainers(projectOnly = false) {
    const containers = await this.docker.listContainers({ all: true,
      ...(projectOnly ? { filters: { label: [`openship.project=${this.projectId}`] } } : {}) });
    const reserved = await Promise.all(containers.map(async container => {
      if (container.State === "running") return container;
      try {
        const info = await this.docker.getContainer(container.Id).inspect();
        return { ...container, Ports: [...container.Ports,
          ...Object.entries(info.HostConfig.PortBindings ?? {}).flatMap(([port, bindings]) => (Array.isArray(bindings) ? bindings : []).map((binding: { HostPort: string }) => ({
            PrivatePort: Number(port.split("/")[0]), PublicPort: Number(binding.HostPort), Type: port.split("/")[1] ?? "tcp",
          }))),
        ] };
      } catch (error) { if (notFound(error)) return null; throw error; }
    }));
    return reserved.filter((container): container is NonNullable<typeof container> => container !== null);
  }

  /** Only retire bindings we own. Preserve sibling, bridge and external ports,
   * including a sibling that is intentionally stopped. Caller holds the host lock. */
  private async reconcileIngress(add: number[], retire: number[] = [], removingContainer?: string) {
    if (!add.length && !retire.length) return;
    const used = retire.length ? new Set((await this.publishedContainers())
      .filter(container => container.Id !== removingContainer)
      .flatMap(container => container.Ports.map(port => port.PublicPort))) : new Set<number>();
    const removable = new Set(retire.filter(port => port !== CLOUD_DOCKER_BRIDGE_PORT && !used.has(port)));
    const workspace = this.client.workspace(this.workspaceId);
    const network = await workspace.network.get();
    const current = Array.isArray(network.ingress_ports) ? network.ingress_ports as number[] : [];
    const next = [...new Set([...current.filter(port => !removable.has(port)), ...add])];
    if (next.length !== current.length || next.some(port => !current.includes(port))) await workspace.network.update({ ingress_ports: next });
  }

  override async deployServiceWorkload(group: MultiServiceGroupHandle, config: MultiServiceDeployConfig, onLog?: LogCallback): Promise<MultiServiceDeployResult> {
    this.assertProject(config.projectId);
    if (this.options.ownerWorkspaceId) {
      const network = await this.docker.getNetwork(group.id).inspect();
      if (network.Labels?.["openship.project"] !== this.projectId) throw new AppError("Network belongs to another project", 409, "CLOUD_NETWORK_CONFLICT");
      for (const mode of [config.namespaces?.network, config.namespaces?.pid]) {
        if (!mode || mode === "none") continue;
        if (!mode.startsWith("container:")) throw new Error("Shared Cloud workspaces do not expose host network or PID namespaces");
        await this.assertContainerAccess(mode.slice("container:".length));
      }
    }
    await this.canSpend();
    await this.ensureBridge();
    const endpoints = config.cloudEndpoints ?? (config.expose && config.publicPort
      ? [{ hostname: config.customDomain ?? `${config.publicSlug}.${this.publicDomain}`, port: config.publicPort, custom: Boolean(config.customDomain) }]
      : []);
    // Port allocation and replacement share a workspace lock. This is separate
    // from bridge initialization, which must complete before entering the lock.
    return this.options.provisionLock.run(async () => {
      const ports = [...new Set([...endpoints.map(endpoint => endpoint.port), ...(config.cloudProxyPorts ?? [])])];
      if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) throw new Error("Invalid cloud service port");
      const reserved = await this.publishedContainers();
      const used = new Set(reserved.flatMap(container => container.Ports.map(port => port.PublicPort).filter((port): port is number => Boolean(port))));
      const listeners = await this.executor.exec("ss -H -lnt");
      for (const line of listeners.split("\n")) {
        const port = Number(line.trim().split(/\s+/)[3]?.split(":").pop());
        if (port) used.add(port);
      }
      const previous = reserved.find(container => container.Labels["openship.project"] === this.projectId && container.Labels["openship.service"] === config.serviceName);
      const published = new Map<number, number>();
      for (const port of ports) {
        const prior = previous?.Ports.find(binding => binding.PrivatePort === port && binding.Type === "tcp")?.PublicPort;
        let hostPort = prior ?? 30000 + createHash("sha256").update(`${this.projectId}:${config.serviceName}:${port}`).digest().readUInt32BE(0) % 30000;
        if (!prior) {
          const start = hostPort;
          while (used.has(hostPort) || hostPort === CLOUD_DOCKER_BRIDGE_PORT) {
            hostPort = hostPort === 59999 ? 30000 : hostPort + 1;
            if (hostPort === start) throw new Error("No published ports available in this Docker workspace");
          }
        }
        used.add(hostPort);
        published.set(port, hostPort);
      }
      // Internal database/worker ports remain on the project network. Only
      // approved public endpoints are published, with distinct workspace ports.
      if (!config.imageAlreadyPrepared) await this.pullImage(config.image, { force: config.forcePull });
      const image = await this.accessibleImage(config.image);
      const persistent = await this.persistentMounts(config, Object.keys(image.Config?.Volumes ?? {}));
      const volumes = this.options.ownerWorkspaceId ? await this.ownedVolumeBinds(config.slug, persistent) : persistent;
      const result = await super.deployServiceWorkload(group, { ...config, volumes, imageAlreadyPrepared: true,
        ...(this.options.ownerWorkspaceId ? { namespaceVolumes: true } : {}),
        ports: [...published].map(([port, hostPort]) => `0.0.0.0:${hostPort}:${port}`),
      }, onLog);
      const retired = previous?.Ports.filter(port => port.Type === "tcp" && port.PublicPort).map(port => port.PublicPort!) ?? [];
      if (ports.length || retired.length) {
        try {
          await this.reconcileIngress([...published.values()], retired);
          for (const endpoint of endpoints) {
            try { await this.publishRouteUnlocked(endpoint.hostname, published.get(endpoint.port)!, endpoint.custom); }
            catch (error) { (result.routeWarnings ??= []).push(`${endpoint.hostname}: ${safeErrorMessage(error)}`); }
          }
        } catch (error) {
          (result.routeWarnings ??= []).push(`Service ${config.serviceName}: ${safeErrorMessage(error)}`);
        }
      }
      return result;
    });
  }

  private async persistentMounts(config: Pick<MultiServiceDeployConfig, "volumes" | "slug" | "deploymentId" | "serviceName">, imageVolumes: string[]): Promise<string[]> {
    const targets = new Set<string>();
    const volumes: string[] = [];
    for (const spec of config.volumes) {
      const parts = spec.split(":");
      if (parts.length === 1) {
        imageVolumes.push(parts[0]!);
        continue;
      }
      const [source, target] = parts as [string, string];
      if (this.options.ownerWorkspaceId && posix.isAbsolute(source) && !posix.resolve(source).startsWith(`${this.projectPaths.mounts}/`)) {
        throw new Error("Shared Cloud mounts must use named volumes or repository paths. Host paths and the Docker socket are not available.");
      }
      targets.add(target);
      if (source.startsWith(".") || source.startsWith("~")) {
        if (!this.sourcePath || !this.sourceBase || source.startsWith("~")) throw new Error("A relative Compose mount needs repository or uploaded source");
        const from = posix.resolve(this.sourceBase, source);
        if (from !== this.sourcePath && !from.startsWith(`${this.sourcePath}/`)) throw new Error("Compose mount escapes its source repository");
        if (this.options.ownerWorkspaceId && await this.executor.exists(from)) {
          const resolved = (await this.executor.exec(`readlink -f -- ${sq(from)}`)).trim();
          if (resolved !== this.sourcePath && !resolved.startsWith(`${this.sourcePath}/`)) throw new Error("Compose mount symlink escapes its source repository");
        }
        const readOnly = parts.slice(2).some(mode => mode.split(",").includes("ro"));
        const key = createHash("sha256").update(posix.relative(this.sourcePath, from)).digest("hex").slice(0, 24);
        const release = createHash("sha256").update(config.deploymentId).digest("hex").slice(0, 24);
        const dest = `${this.projectPaths.mounts}/${readOnly ? `releases/${release}` : "data"}/${key}`;
        await this.executor.mkdir(posix.dirname(dest));
        // Writable relative mounts are initialized once, then retain application
        // data. Read-only configuration gets a release-specific copy.
        if (!await this.executor.exists(dest)) {
          if (await this.executor.exists(from)) await this.executor.exec(`cp -a ${sq(from)} ${sq(dest)}`);
          else if (!readOnly) await this.executor.mkdir(dest);
          else throw new Error(`Compose mount source is missing: ${source}`);
        }
        parts[0] = dest;
      }
      if (this.options.ownerWorkspaceId && posix.isAbsolute(parts[0]!)) {
        if (!await this.executor.exists(parts[0]!)) throw new Error("This project's managed mount is missing. Use a named volume or a repository path for new storage.");
        const resolved = (await this.executor.exec(`readlink -f -- ${sq(parts[0]!)}`)).trim();
        if (!resolved.startsWith(`${this.projectPaths.mounts}/`)) throw new Error("Persistent mount escapes this project's storage");
      }
      volumes.push(parts.join(":"));
    }
    for (const target of new Set(imageVolumes)) {
      if (!target.startsWith("/")) throw new Error("Invalid anonymous volume destination");
      if (targets.has(target)) continue;
      const key = createHash("sha256").update(`${config.serviceName}:${target}`).digest("hex").slice(0, 24);
      volumes.push(`openship-${config.slug}-data-${key}:${target}`);
    }
    return volumes;
  }

  private get pages() { return this.options.adminProxy?.pages ?? this.client.pages; }

  /** Read provider ownership without opening Docker or resuming a stopped VM.
   * Includes route anchors from a deployment that failed before its DB write. */
  async listProjectRouteHostnames(): Promise<string[]> {
    const hostnames: string[] = [];
    for (const summary of (await this.pages.list()).pages) {
      if (summary.namespace !== this.options.namespace) continue;
      let page;
      try { page = (await this.pages.get(summary.slug)).page; }
      catch (error) { if (notFound(error)) continue; throw error; }
      if (page.namespace === this.options.namespace && page.source_workspace_id === this.workspaceId &&
          page.exported_path === `${this.projectPaths.routes}/${page.slug}`) hostnames.push(...cloudPageHostnames(page));
    }
    return [...new Set(hostnames)];
  }

  /** A stable Page owns each public hostname; its edge rule proxies to the
   * shared workspace. This supports several custom domains without repeatedly
   * overwriting the workspace API's single custom-domain binding. */
  async publishRoute(hostname: string, hostPort: number, custom: boolean, input?: RoutesInput): Promise<void> {
    return this.options.provisionLock.run(() => this.publishRouteUnlocked(hostname, hostPort, custom, input));
  }

  private async publishRouteUnlocked(hostname: string, hostPort: number, custom: boolean, input?: RoutesInput): Promise<void> {
    hostname = hostname.trim().toLowerCase();
    if (!Number.isInteger(hostPort) || hostPort < 1 || hostPort > 65535 || hostPort === CLOUD_DOCKER_BRIDGE_PORT) throw new Error("Invalid cloud routing port");
    const suffix = `.${this.publicDomain}`;
    const slug = custom ? `route-${createHash("sha256").update(`${this.projectId}:${hostname}`).digest("hex").slice(0, 32)}`
      : hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : "";
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error("Invalid cloud route hostname");
    const routes = input ?? { routes: [{ match: { path: "/", type: "prefix" as const },
      action: { kind: "proxy" as const, workspace: this.workspaceId, port: hostPort } }] };
    await this.assertProxyTargets(routes, hostPort);
    await this.reconcileIngress([hostPort]);
    const path = `${this.projectPaths.routes}/${slug}`;
    let page;
    try { page = (await this.pages.get(slug)).page; }
    catch (error) { if (!notFound(error)) throw error; }
    if (!page) {
      await this.executor.writeFile(`${path}/index.html`, "<!doctype html><title>Application starting</title>");
      try { await this.pages.create({ workspace_id: this.workspaceId, path, name: `Route ${hostname}`, slug, domain: this.publicDomain }); }
      catch (error) { if ((error as { status?: number }).status !== 409) throw error; }
      // Creation returns a summary on current Oblien releases. Ownership comes
      // from the full resource read, including namespace and export path.
      page = (await this.pages.get(slug)).page;
    }
    if (page.source_workspace_id !== this.workspaceId || page.namespace !== this.options.namespace || page.exported_path !== path) {
      throw new Error("Cloud hostname is not owned by this project's route");
    }
    if (custom) {
      if (page.custom_domain && page.custom_domain !== hostname) throw new Error("Cloud route is already bound to a different hostname");
      if (page.custom_domain !== hostname) await this.pages.connectDomain(slug, { domain: hostname });
    }
    await this.pages.enable(slug);
    await this.cloud.setDomainRoutes(hostname, routes);
  }

  async resolveRoutingTarget(containerId: string, port: number): Promise<{ workspace: string; port: number }> {
    const info = await this.getContainerInfo(containerId);
    const published = info.hostPortByContainerPort?.[port];
    if (!published) throw new Error(`Service port ${port} is not published in its workspace`);
    return { workspace: this.workspaceId, port: published };
  }

  /** Translate the normal Docker pipeline's container URL to managed ingress.
   * The URL must identify a container of THIS project, never an arbitrary host. */
  async registerRoute(route: RouteConfig): Promise<void> {
    if (!route.targetUrl) throw new Error("Cloud Docker routing requires a container target");
    const target = new URL(route.targetUrl);
    if (target.protocol !== "http:" || target.username || target.password) throw new Error("Invalid Docker route target");
    const containers = await this.listAllContainers();
    const container = containers.find(item => item.labels["openship.project"] === this.projectId && item.ip === target.hostname);
    if (!container) throw new Error("Route target does not belong to this project's Docker containers");
    const resolved = await this.resolveRoutingTarget(container.id, Number(target.port || 80));
    await this.publishRoute(route.domain, resolved.port, !route.domain.endsWith(`.${this.publicDomain}`));
  }
  async setDomainRoutes(hostname: string, input: RoutesInput) {
    if (this.options.ownerWorkspaceId && !(await this.listProjectRouteHostnames()).includes(hostname.trim().toLowerCase())) {
      throw new AppError("Domain does not belong to this project", 404, "DOMAIN_NOT_FOUND");
    }
    await this.assertProxyTargets(input);
    return this.cloud.setDomainRoutes(hostname, input);
  }
  private async assertProxyTargets(input: RoutesInput, publishedPort?: number) {
    if (!this.options.ownerWorkspaceId) return;
    const containers = await this.publishedContainers(true);
    const ports = new Set(containers.flatMap(container => container.Ports.filter(port => port.Type === "tcp").map(port => port.PublicPort)));
    if (publishedPort !== undefined && !ports.has(publishedPort)) throw new AppError("Routing port does not belong to this project", 409, "CLOUD_ROUTE_TARGET_INVALID");
    for (const route of input.routes) {
      if (route.action.kind === "proxy" && (route.action.workspace !== this.workspaceId || typeof route.action.port !== "number" || !ports.has(route.action.port))) {
        throw new AppError("Routing target does not belong to this project", 409, "CLOUD_ROUTE_TARGET_INVALID");
      }
    }
  }
  async checkSlug(...args: Parameters<CloudRuntime["checkSlug"]>) { return this.cloud.checkSlug(...args); }
  async verifyDomain(...args: Parameters<CloudRuntime["verifyDomain"]>) { return this.cloud.verifyDomain(...args); }
  async getQuota() { return this.cloud.getQuota(); }

  override async listAllContainers() {
    const workspace = await this.client.workspaces.get(this.workspaceId);
    assertDockerWorkspaceOwner(workspace, this.options.namespace);
    if (!isDockerWorkspaceRunning(workspace)) {
      throw new AppError("The project's Docker workspace is stopped. Start a service or deploy to resume it.",
        409, "CLOUD_WORKSPACE_STOPPED");
    }
    const containers = await super.listAllContainers();
    return this.options.ownerWorkspaceId ? containers.filter(container => container.labels["openship.project"] === this.projectId) : containers;
  }

  override async getContainerInfo(containerId: string): Promise<ContainerInfo> {
    if (containerId === this.workspaceId) throw new Error("A Docker workspace is not a service container");
    let workspace;
    try { workspace = await this.client.workspaces.get(this.workspaceId); }
    catch (error) { if (notFound(error)) return { containerId, status: "missing" }; throw error; }
    assertDockerWorkspaceOwner(workspace, this.options.namespace);
    if (!isDockerWorkspaceRunning(workspace)) {
      const status = cloudWorkspaceStatus(workspace);
      return { containerId, status: ["failed", "error"].includes(status) ? "failed"
        : ["starting", "creating", "provisioning", "resuming"].includes(status) ? "deploying" : "stopped" };
    }
    return super.getContainerInfo(containerId);
  }
  private async resumeWorkspace(): Promise<void> {
    await this.canSpend();
    const ws = this.client.workspace(this.workspaceId);
    const data = await ws.get();
    assertDockerWorkspaceOwner(data, this.options.namespace);
    if (isDockerWorkspaceRunning(data)) return;
    const status = cloudWorkspaceStatus(data);
    if (status === "stopped") await ws.start();
    else if (status === "paused" || status === "suspended") await ws.resume();
    await waitForCloudDockerWorkspace(this.client, this.workspaceId, this.options.namespace);
    ws.invalidateRuntime();
    this.bridgePromise = undefined;
  }
  override async start(containerId: string) {
    if (containerId === this.workspaceId) throw new Error("A Docker workspace is not a service container");
    await this.resumeWorkspace();
    try { return await super.start(containerId); }
    catch (error) { if ((error as { statusCode?: number }).statusCode !== 304) throw error; }
  }
  override async stop(containerId: string) {
    if (containerId === this.workspaceId) throw new Error("A Docker workspace is not a service container");
    const workspace = await this.client.workspaces.get(this.workspaceId);
    assertDockerWorkspaceOwner(workspace, this.options.namespace);
    if (!isDockerWorkspaceRunning(workspace)) return;
    return super.stop(containerId);
  }
  override async restart(containerId: string) {
    if (containerId === this.workspaceId) throw new Error("A Docker workspace is not a service container");
    await this.resumeWorkspace();
    return super.restart(containerId);
  }
  override async applyEnvironment(...args: Parameters<DockerRuntime["applyEnvironment"]>) {
    this.assertProject(args[2].projectId);
    if (args[0] === this.workspaceId) throw new Error("A Docker workspace is not a service container");
    await this.resumeWorkspace();
    await this.ensureBridge();
    return super.applyEnvironment(...args);
  }
  override async pullImage(...args: Parameters<DockerRuntime["pullImage"]>) { await this.canSpend(); return super.pullImage(...args); }
  override async destroy(containerId: string) {
    if (containerId === this.workspaceId) throw new Error("A project's containers cannot delete their Docker workspace");
    if (this.options.ownerWorkspaceId && posix.isAbsolute(containerId)) throw new Error("A managed Docker deployment must identify a container, not a host path");
    if (!this.options.ownerWorkspaceId) return super.destroy(containerId);
    return this.options.provisionLock.run(async () => {
      const owned = await this.inspectOwnedContainer(containerId);
      if (!owned) return;
      // Docker accepts names and shortened IDs. Resolve once so ingress cleanup
      // and removal identify the same container even if its name is reused.
      const container = (await this.publishedContainers(true)).find(row => row.Id === owned.Id);
      const ports = container?.Ports.filter(port => port.Type === "tcp" && port.PublicPort).map(port => port.PublicPort!) ?? [];
      // Revoke before removal: a failed provider write leaves the container and
      // its ownership record available for the teardown retry.
      await this.reconcileIngress([], ports, container?.Id);
      await super.destroy(owned.Id);
    });
  }
  async cleanupProject(projectId: string, options?: { wipeVolumes?: boolean }): Promise<void> {
    this.assertProject(projectId);
    if (!this.options.ownerWorkspaceId) return;
    if ((await this.listProjectContainerIds(projectId)).length) throw new Error("Remove the project's containers before cleaning its storage");
    if (options?.wipeVolumes) {
      // Include detached volumes left by interrupted deployments. Inventory is
      // label-scoped; retained data is removed only on the explicit wipe path.
      for (const volume of await this.listAllVolumes()) await this.removeVolume(volume.name);
      await this.executor.rm(this.projectPaths.mounts);
    } else {
      await this.executor.rm(`${this.projectPaths.mounts}/releases`);
      await this.executor.rm(`${this.projectPaths.mounts}/config`);
    }
    await this.executor.rm(this.projectPaths.routes);
  }
  override async dispose() {
    await super.dispose();
    if (this.sourcePath) await this.executor.rm(this.sourcePath).catch(() => {});
    await this.executor.dispose();
  }
}
