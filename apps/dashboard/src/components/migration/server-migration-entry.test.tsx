// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ServerMigrationWizard } from "./ServerMigrationWizard";

const h = vi.hoisted(() => ({ listServers: vi.fn(), listSources: vi.fn(), scanStream: vi.fn(), cloudPricing: vi.fn(),
  preview: vi.fn(), migrate: vi.fn(), getMigration: vi.fn(), confirmCutover: vi.fn(), streamMigration: vi.fn(),
  selfHosted: true, organizationId: "org-a" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api/system", () => ({ systemApi: { listServerDestinations: async () => ({ servers: await h.listServers() }) } }));
vi.mock("@/context/PlatformContext", () => ({ usePlatform: () => ({ selfHosted: h.selfHosted, deployMode: "docker" }) }));
vi.mock("@/lib/auth-client", () => ({ useSession: () => ({ data: { user: { id: "user" }, session: { activeOrganizationId: h.organizationId } } }) }));
vi.mock("@/hooks/useCloudDeployPricing", () => ({ useCloudDeployPricing: () => h.cloudPricing }));
vi.mock("@/components/servers/add-server-modal", () => ({ useAddServerModal: () => vi.fn() }));
vi.mock("@/lib/api/server-migration", () => ({
  dockerMigrationApi: { scanStream: h.scanStream, listSources: h.listSources, preview: h.preview,
    migrate: h.migrate, getMigration: h.getMigration, confirmCutover: h.confirmCutover, streamMigration: h.streamMigration },
  isScanStreamStalled: () => false,
}));
vi.mock("@/context/GitHubContext", () => ({ useGitHub: () => ({ connected: false }) }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  h.selfHosted = true;
  h.organizationId = "org-a";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Element.prototype.scrollIntoView = vi.fn();
  h.listServers.mockResolvedValue([
    { id: "source-a", name: "First server", sshHost: "192.0.2.1", sshPort: 22, sshUser: "root", capabilities: { ssh: true } },
    { id: "source-b", name: "Second server", sshHost: "192.0.2.2", sshPort: 22, sshUser: "root", capabilities: { ssh: true } },
  ]);
  h.scanStream.mockImplementation(() => new Promise(() => {}));
  h.getMigration.mockImplementation(() => new Promise(() => {}));
  h.streamMigration.mockReturnValue(vi.fn());
  h.confirmCutover.mockResolvedValue({ success: true });
  h.listSources.mockResolvedValue({ sources: [
    { id: "external", name: "Migration source", sshHost: "203.0.113.12", sshPort: 22, sshUser: "root", purpose: "migration_source" },
  ] });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

const button = (label: string) => Array.from(container.querySelectorAll("button"))
  .find(b => b.textContent?.trim() === label)!;
async function pickSource(name: string) {
  await act(async () => container.querySelector<HTMLButtonElement>("button[aria-haspopup]")!.click());
  const choice = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes(name))!;
  expect(choice).toBeDefined();
  await act(async () => choice.click());
}
function useCloud() {
  h.selfHosted = false;
  h.listServers.mockResolvedValue([{ id: "managed", name: "Managed server", connection: "cloud",
    projectCount: 0, managed: { id: "workspace", state: "ready", resources: { cpuCores: 1, memoryMb: 4096, diskMb: 25600 } },
    capabilities: { ssh: false, exec: true } }]);
}
function scannedStack() {
  const service = { name: "redis", containerId: "redis-container", source: "container", image: "redis:7",
    running: true, ports: [], env: {}, volumes: [], networks: [], dependsOn: [], warnings: [] };
  return { serverId: "external", composeProjects: [], groups: [{ project: null, services: [service] }],
    services: [service], volumes: [], networks: [], warnings: [], adoptable: true, alreadyManaged: 0, openshipProjects: [] };
}

it("Cloud uses the restricted source inventory and the same scanner", async () => {
  useCloud();
  await act(async () => root.render(<ServerMigrationWizard variant="tab" onClose={vi.fn()} />));
  expect(h.listSources).toHaveBeenCalledOnce();
  expect(button("Scan server").disabled).toBe(true);
  await pickSource("Migration source");
  await act(async () => button("Scan server").click());
  expect(h.scanStream).toHaveBeenCalledExactlyOnceWith("external", expect.objectContaining({ flatDocker: true }));
});

it("discards scan results and progress after the active organization changes", async () => {
  useCloud();
  let complete!: (stack: ReturnType<typeof scannedStack>) => void;
  h.scanStream.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  await act(async () => root.render(<ServerMigrationWizard variant="tab" onClose={vi.fn()} />));
  await pickSource("Migration source");
  await act(async () => button("Scan server").click());
  const options = h.scanStream.mock.calls[0]![1];
  h.organizationId = "org-b";
  h.listSources.mockResolvedValue({ sources: [] });
  await act(async () => root.render(<ServerMigrationWizard variant="tab" onClose={vi.fn()} />));
  await act(async () => {
    options.onProgress("private progress from org-a");
    complete(scannedStack());
  });
  expect(container.textContent).not.toContain("private progress from org-a");
  expect(container.textContent).not.toContain("redis");
  expect(button("Scan server").disabled).toBe(true);
});

it("opens shared billing recovery and retries the same import after admission fails", async () => {
  useCloud();
  h.scanStream.mockResolvedValue(scannedStack());
  h.preview.mockResolvedValue({ preview: { sameServer: false, services: [], volumesToMove: [], hasBlocked: false,
    downtimeWarning: true, droppedProxies: [], warnings: [], plan: { totalBytes: 0, partial: false, items: [] } } });
  const restriction = new Error("Choose a server plan before importing");
  h.migrate.mockRejectedValueOnce(restriction).mockResolvedValueOnce({ migrationId: "run", confirmationToken: "token" });
  await act(async () => root.render(<ServerMigrationWizard variant="tab" onClose={vi.fn()} />));
  await pickSource("Migration source");
  await act(async () => button("Scan server").click());
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  for (let step = 0; step < 3; step++) {
    expect(button("Next")?.disabled).toBe(false);
    await act(async () => button("Next").click());
  }
  expect(button("Migrate")?.disabled).toBe(false);
  await act(async () => button("Migrate").click());
  expect(h.cloudPricing).toHaveBeenCalledWith(restriction, expect.any(Function));
  expect(button("Retry")?.disabled).toBe(false);
  await act(async () => button("Retry").click());
  expect(h.migrate).toHaveBeenCalledTimes(2);
  expect(h.migrate.mock.calls[1]![0]).toEqual(h.migrate.mock.calls[0]![0]);
  expect(h.migrate.mock.calls[0]![0]).toMatchObject({
    sourceServerId: "external", targetServerId: "managed", serviceContainerIds: ["redis-container"], flatDocker: true,
  });
});

it("uses the reopened run's cutover token without a server prop or a second active-run lookup", async () => {
  useCloud();
  h.getMigration.mockResolvedValue({ run: { id: "run", status: "awaiting_cutover", mode: "cross_server",
    projectName: "Imported Redis", confirmationToken: "this-run-only", sourceServerId: "external", targetServerId: "managed" } });
  await act(async () => root.render(<ServerMigrationWizard variant="tab" initialRunId="run" onClose={vi.fn()} />));
  const keep = Array.from(container.querySelectorAll("button")).find(b => /keep.*original/i.test(b.textContent ?? ""));
  expect(keep).toBeDefined();
  await act(async () => keep!.click());
  expect(h.confirmCutover).toHaveBeenCalledExactlyOnceWith("run", "this-run-only", false);
});

it("waits for the selected destination's storage review before enabling migration", async () => {
  useCloud();
  const server = { connection: "cloud", projectCount: 0, managed: { state: "ready" }, capabilities: { exec: true } };
  h.listServers.mockResolvedValue([
    { ...server, id: "managed", name: "First managed server" },
    { ...server, id: "second-managed", name: "Second managed server" },
  ]);
  h.scanStream.mockResolvedValue(scannedStack());
  let finishPreview!: (result: unknown) => void;
  const preview = { sameServer: false, services: [], volumesToMove: [], hasBlocked: false,
    downtimeWarning: true, droppedProxies: [], warnings: [], plan: { totalBytes: 0, partial: false, items: [] } };
  h.preview.mockResolvedValueOnce({ preview }).mockImplementationOnce(() => new Promise(resolve => { finishPreview = resolve; }));
  await act(async () => root.render(<ServerMigrationWizard variant="tab" onClose={vi.fn()} />));
  await pickSource("Migration source");
  await act(async () => button("Scan server").click());
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  for (let step = 0; step < 3; step++) await act(async () => button("Next").click());
  expect(button("Migrate").disabled).toBe(false);
  await pickSource("Second managed server");
  expect(h.preview.mock.lastCall?.[0]).toMatchObject({ targetServerId: "second-managed" });
  expect(button("Migrate").disabled).toBe(true);
  await act(async () => finishPreview({ preview: { ...preview } }));
  expect(button("Migrate").disabled).toBe(false);
});

it("does not restore an old organization's run or transfer progress after switching context", async () => {
  useCloud();
  let complete!: (value: unknown) => void;
  h.getMigration.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  await act(async () => root.render(<ServerMigrationWizard variant="tab" initialRunId="run" onClose={vi.fn()} />));
  const callbacks = h.streamMigration.mock.calls[0]![1];
  h.organizationId = "org-b";
  await act(async () => root.render(<ServerMigrationWizard variant="tab" onClose={vi.fn()} />));
  await act(async () => {
    complete({ run: { id: "run", projectName: "Private org-a workload", status: "awaiting_cutover", confirmationToken: "old-secret" } });
    callbacks.onProgress({ task: "private-volume", kind: "volume", movedBytes: 10, totalBytes: 100 });
  });
  expect(container.textContent).not.toContain("Private org-a workload");
  expect(container.textContent).not.toContain("private-volume");
  expect(h.confirmCutover).not.toHaveBeenCalled();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("lets New Project select a source before scanning through the shared inline wizard", async () => {
  await act(async () => root.render(<ServerMigrationWizard variant="tab" onClose={vi.fn()} />));
  const scan = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Scan server",
  )!;
  expect(scan.disabled).toBe(true);
  expect(h.scanStream).not.toHaveBeenCalled();
  const picker = container.querySelector<HTMLButtonElement>("button[aria-haspopup]")!;
  expect(picker).not.toBeNull();
  await act(async () => picker.click());
  const source = Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Second server"),
  )!;
  expect(source).toBeDefined();
  await act(async () => source.click());
  expect(scan.disabled).toBe(false);
  await act(async () => scan.click());
  expect(h.scanStream).toHaveBeenCalledExactlyOnceWith(
    "source-b",
    expect.objectContaining({ flatDocker: false }),
  );
});
