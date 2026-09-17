// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { ModalProvider } from "@/context/ModalContext";
import { PlatformProvider } from "@/context/PlatformContext";
import { baseDictionary } from "@/i18n";
import type { NetworkHostObservation } from "@repo/core";
import NewServerClusterPage from "@/app/(dashboard)/servers/clusters/new/page";
import {
  clusterCapabilitiesFixture,
  serverClusterFixture,
} from "../../../../../../packages/contracts/test/server-cluster-fixtures";
import {
  managedOperationFixture,
  managedPreparationFixture,
} from "../../../../../../packages/contracts/test/managed-network-fixtures";
import { ClusterEditor } from "./ClusterEditor";
import { ManagedNetworkOperationPage } from "./ManagedNetworkOperationPage";
import { ManagedNetworkPreparationPage } from "./ManagedNetworkPreparationPage";
import { ClusterDetail } from "./ClusterDetail";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  capabilities: vi.fn(),
  servers: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  verify: vi.fn(),
  inspect: vi.fn(),
  planManaged: vi.fn(),
  applyManaged: vi.fn(),
  managedOperation: vi.fn(),
  prepareManaged: vi.fn(),
  managedPreparation: vi.fn(),
  discardPreparation: vi.fn(),
  discardPlan: vi.fn(),
  removePreparationMember: vi.fn(),
  removeOperationMember: vi.fn(),
  remove: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api", () => ({
  systemApi: { listServers: h.servers },
  getApiErrorMessage: (error: Error) => error.message,
}));
vi.mock("@/lib/api/server-clusters", () => ({
  serverClustersApi: {
    capabilities: h.capabilities,
    list: h.list,
    get: h.get,
    create: h.create,
    update: h.update,
    verify: h.verify,
    inspect: h.inspect,
    planManaged: h.planManaged,
    applyManaged: h.applyManaged,
    managedOperation: h.managedOperation,
    prepareManaged: h.prepareManaged,
    managedPreparation: h.managedPreparation,
    discardPreparation: h.discardPreparation,
    discardPlan: h.discardPlan,
    removePreparationMember: h.removePreparationMember,
    removeOperationMember: h.removeOperationMember,
    remove: h.remove,
  },
}));

let root: Root;
let host: HTMLDivElement;
const c = baseDictionary.servers.clusters;
type ProgressFixture =
  | ReturnType<typeof managedOperationFixture>
  | ReturnType<typeof managedPreparationFixture>;
const streams = new Map<string, (run: ProgressFixture) => void>();
function emitProgress(kind: "operations" | "preparations", run: ProgressFixture) {
  (kind === "operations" ? h.managedOperation : h.managedPreparation).mockResolvedValue(run);
  streams.get(kind)?.(run);
}
beforeEach(() => {
  vi.resetAllMocks();
  streams.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", h.fetch);
  h.fetch.mockImplementation(async (url: string, init: RequestInit) => {
    const kind = url.includes("network-preparations/") ? "preparations" : "operations";
    if (!url.endsWith("/stream")) throw new Error(`Unexpected HTTP request: ${url}`);
    const initial = await (kind === "operations" ? h.managedOperation() : h.managedPreparation());
    let closed = false;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (run: ProgressFixture) => {
          if (closed) return;
          controller.enqueue(
            new TextEncoder().encode(
              `event: snapshot\ndata: ${JSON.stringify({ type: "snapshot", run })}\n\n`,
            ),
          );
          if (
            ![
              "pending",
              "preparing",
              "applying",
              "verifying",
              "committing",
              "rolling_back",
            ].includes(run.status)
          ) {
            controller.enqueue(
              new TextEncoder().encode('event: complete\ndata: {"type":"complete"}\n\n'),
            );
            controller.close();
            closed = true;
          }
        };
        streams.set(kind, write);
        init.signal?.addEventListener(
          "abort",
          () => {
            if (!closed) {
              closed = true;
              controller.error(new DOMException("Aborted", "AbortError"));
            }
          },
          { once: true },
        );
        write(initial);
      },
      cancel() {
        closed = true;
      },
    });
    return new Response(source, { headers: { "Content-Type": "text/event-stream" } });
  });
  h.capabilities.mockResolvedValue(clusterCapabilitiesFixture());
  h.servers.mockResolvedValue([
    { id: "server-a", name: "Alpha", sshHost: "192.0.2.1" },
    { id: "server-b", name: "Beta", sshHost: "192.0.2.2" },
  ]);
  h.list.mockResolvedValue([]);
  h.get.mockResolvedValue(serverClusterFixture());
  h.create.mockResolvedValue(serverClusterFixture());
  h.update.mockResolvedValue(serverClusterFixture());
  h.verify.mockResolvedValue(null);
  h.planManaged.mockResolvedValue(managedOperationFixture());
  h.applyManaged.mockImplementation(async () => {
    const result = { ...managedOperationFixture(), sequence: 3, status: "applying" };
    h.managedOperation.mockResolvedValue(result);
    return result;
  });
  h.managedOperation.mockResolvedValue({ ...managedOperationFixture(), status: "applying" });
  h.prepareManaged.mockImplementation(async () => {
    const result = { ...managedPreparationFixture(), sequence: 2 };
    h.managedPreparation.mockResolvedValue(result);
    return result;
  });
  h.managedPreparation.mockResolvedValue(managedPreparationFixture());
  h.discardPreparation.mockImplementation(async () => {
    const next = { ...managedPreparationFixture(), sequence: 2, status: "cancelled" };
    h.managedPreparation.mockResolvedValue(next);
    return next;
  });
  h.discardPlan.mockImplementation(async () => {
    const next = { ...managedOperationFixture(), sequence: 2, status: "cancelled" };
    h.managedOperation.mockResolvedValue(next);
    return next;
  });
  h.remove.mockResolvedValue({ removed: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function render(clusterId?: string, deployMode = "desktop", selfHosted = true) {
  const page = clusterId ? (
    <ClusterEditor clusterId={clusterId} />
  ) : (
    await NewServerClusterPage({ searchParams: Promise.resolve({}) })
  );
  await act(async () => {
    root.render(
      <I18nProvider>
        <PlatformProvider deployMode={deployMode} selfHosted={selfHosted}>
          <ModalProvider>{page}</ModalProvider>
        </PlatformProvider>
      </I18nProvider>,
    );
  });
}
async function click(label: string, scope: ParentNode = host) {
  const button = [...scope.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === label,
  );
  expect(button, `button ${label}`).toBeDefined();
  await act(async () => button!.click());
}
async function renderSetup(page: ReactNode) {
  await act(async () =>
    root.render(
      <I18nProvider>
        <PlatformProvider deployMode="desktop" selfHosted>
          {page}
        </PlatformProvider>
      </I18nProvider>,
    ),
  );
}
function confirmation() {
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  return dialog!;
}
async function fill(input: HTMLInputElement | null, value: string) {
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const observation = (address: string, name = "eth1"): NetworkHostObservation => ({
  hostIdentity: `host:${address}`,
  interfaces: [
    { name, mtu: 1400, up: true, kind: "vlan", addresses: [{ address, prefixLength: 24 }] },
  ],
});
async function startNetworkStep() {
  await render();
  await fill(host.querySelector(`input[placeholder="${c.namePlaceholder}"]`), "Production");
  await act(async () => {
    host
      .querySelectorAll<HTMLButtonElement>('[role="checkbox"]')
      .forEach((checkbox) => checkbox.click());
  });
  await click(c.continue);
}

describe("cluster setup pages", () => {
  it("starts a speed test only after an explicit click and sends the selected server pair", async () => {
    const cluster = serverClusterFixture();
    h.get.mockResolvedValue(cluster);
    await renderSetup(<ClusterDetail id={cluster.id} />);
    expect(h.verify).not.toHaveBeenCalled();
    expect(host.textContent).toContain(c.diagnostics.title);
    expect(host.textContent).toContain("32 MiB");
    await click(c.diagnostics.testSpeed);
    expect(h.verify).toHaveBeenCalledWith(cluster, {
      sourceServerId: "server-a",
      targetServerId: "server-b",
    });
  });
  it("keeps network measurements readable without offering speed mutations to a viewer", async () => {
    h.capabilities.mockResolvedValue({ ...clusterCapabilitiesFixture(), canManage: false });
    await renderSetup(<ClusterDetail id={serverClusterFixture().id} />);
    expect(host.textContent).toContain(c.diagnostics.title);
    expect(host.textContent).not.toContain(c.diagnostics.testSpeed);
    expect(h.verify).not.toHaveBeenCalled();
  });
  it("removes a selected failed server with confirmation and reuses its request after a lost response", async () => {
    // Plain HTTP/LAN dashboards have crypto but no secure-context randomUUID.
    vi.stubGlobal("crypto", {});
    const failed = {
      ...managedPreparationFixture(["server-a", "server-b", "server-c"]),
      status: "failed" as const,
      sequence: 5,
    };
    const updated = {
      ...managedPreparationFixture(),
      id: "new-setup",
      status: "preparing" as const,
    };
    h.managedPreparation.mockResolvedValue(failed);
    h.removePreparationMember
      .mockRejectedValueOnce(new Error("Response lost"))
      .mockResolvedValue({ preparation: updated, operation: null });
    await renderSetup(<ManagedNetworkPreparationPage id={failed.id} />);
    const server = host.querySelector('section[aria-label="server-c"]')!;
    await click(c.managed.removeFromSetup, server);
    expect(confirmation().textContent).toContain("server-c");
    expect(confirmation().textContent).toContain("remaining 2 servers");
    expect(h.removePreparationMember).not.toHaveBeenCalled();
    await click(c.cancel, confirmation());
    await click(c.managed.removeFromSetup, server);
    await click(c.managed.removeFromSetup, confirmation());
    expect(confirmation().textContent).toContain("Response lost");
    const request = h.removePreparationMember.mock.calls[0]![0];
    expect(request).toMatchObject({
      preparationId: failed.id,
      serverId: "server-c",
      sequence: 5,
      requestId: expect.any(String),
    });
    await click(c.managed.removeFromSetup, confirmation());
    expect(h.removePreparationMember.mock.calls[1]![0]).toEqual(request);
    expect(h.push).toHaveBeenCalledWith("/servers/clusters/preparations/new-setup");
    expect(h.applyManaged).not.toHaveBeenCalled();
    expect(h.prepareManaged).not.toHaveBeenCalled();
  });

  it("explains the two-server minimum and hides per-server removal for established clusters", async () => {
    const failed = { ...managedPreparationFixture(), status: "failed" as const };
    h.managedPreparation.mockResolvedValue(failed);
    await renderSetup(<ManagedNetworkPreparationPage id={failed.id} />);
    const buttons = [...host.querySelectorAll("button")].filter(
      (button) => button.textContent?.trim() === c.managed.removeFromSetup,
    );
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(host.textContent).toContain(c.managed.keepTwoServers);
    h.managedPreparation.mockResolvedValue({
      ...failed,
      id: "edit-setup",
      input: { ...failed.input, clusterId: "existing", revision: 2 },
    });
    await renderSetup(<ManagedNetworkPreparationPage id="edit-setup" />);
    expect(host.textContent).not.toContain(c.managed.removeFromSetup);
  });

  it.each([false, true])(
    "offers reset-and-remove for an applied setup, with step progress: %s",
    async (steps) => {
      const failed = {
        ...managedOperationFixture(["server-a", "server-b", "server-c"]),
        status: "needs_attention" as const,
        sequence: 8,
      };
      if (steps)
        failed.hosts = failed.hosts.map((host) => ({
          ...host,
          steps: [
            {
              id: "configure",
              status: "failed",
              message: "Route failed",
              startedAt: null,
              finishedAt: null,
            },
          ],
        }));
      h.managedOperation.mockResolvedValue(failed);
      h.removeOperationMember.mockResolvedValue({
        preparation: { ...managedPreparationFixture(), id: "updated-setup", status: "pending" },
        operation: failed,
      });
      await renderSetup(<ManagedNetworkOperationPage id={failed.id} />);
      await click(c.managed.removeFromSetup);
      expect(confirmation().textContent).toContain("network changes");
      expect(confirmation().textContent).toContain("Every server must acknowledge cleanup");
      await click(c.managed.removeAndReset, confirmation());
      expect(h.removeOperationMember).toHaveBeenCalledWith({
        operationId: failed.id,
        serverId: "server-a",
        sequence: 8,
        planHash: failed.planHash,
        requestId: expect.any(String),
      });
      expect(h.push).toHaveBeenCalledWith("/servers/clusters/preparations/updated-setup");
      expect(h.applyManaged).not.toHaveBeenCalled();
    },
  );

  it("recovers the updated setup link from SSE when a removal response is lost", async () => {
    const failed = {
      ...managedOperationFixture(["server-a", "server-b", "server-c"]),
      status: "needs_attention" as const,
    };
    h.managedOperation.mockResolvedValue(failed);
    h.removeOperationMember.mockImplementation(async () => {
      h.managedOperation.mockResolvedValue({
        ...failed,
        sequence: 2,
        replacementPreparationId: "replacement",
      });
      throw new Error("Connection lost");
    });
    await renderSetup(<ManagedNetworkOperationPage id={failed.id} />);
    await click(c.managed.removeFromSetup);
    await click(c.managed.removeAndReset, confirmation());
    expect(
      host.querySelector('a[href="/servers/clusters/preparations/replacement"]')?.textContent,
    ).toContain(c.managed.viewUpdatedSetup);
    expect(host.textContent).not.toContain(c.managed.removeFromSetup);
    expect(
      [...host.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === c.managed.resume,
      ),
    ).toBe(false);
    expect(h.push).not.toHaveBeenCalled();
  });

  it("leaves a saved selection paused through reload and stream updates until Retry is pressed", async () => {
    const preparation = {
      ...managedPreparationFixture(["server-a", "server-b", "server-c"]),
      status: "pending" as const,
    };
    h.managedPreparation.mockResolvedValue(preparation);
    h.prepareManaged.mockResolvedValue({ ...preparation, status: "preparing", sequence: 2 });
    await renderSetup(<ManagedNetworkPreparationPage id={preparation.id} />);
    await act(async () => emitProgress("preparations", preparation));
    await renderSetup(<ManagedNetworkPreparationPage key="reloaded" id={preparation.id} />);
    expect(h.prepareManaged).not.toHaveBeenCalled();
    expect(h.applyManaged).not.toHaveBeenCalled();
    expect(host.textContent).toContain(c.managed.selectionSavedHint);
    expect(host.querySelector('[role="status"] .animate-spin')).toBeNull();
    expect(host.textContent).toContain(c.managed.removeFromSetup);
    expect(host.textContent).toContain(c.managed.discardSetup);
    await click(c.managed.retryPreparation);
    expect(h.prepareManaged).toHaveBeenCalledExactlyOnceWith(preparation.input);
  });

  it("streams cleanup for the removed server and continues only after rollback is confirmed", async () => {
    const operation = {
      ...managedOperationFixture(["server-a", "server-b", "server-c"]),
      status: "needs_attention" as const,
      replacementPreparationId: "remaining-setup",
      error: "Server C unreachable",
    };
    const preparation = {
      ...managedPreparationFixture(),
      id: "remaining-setup",
      input: { ...managedPreparationFixture().input, requestId: "remaining-setup" },
      status: "pending" as const,
      cleanupOperationId: operation.id,
    };
    h.managedPreparation.mockResolvedValue(preparation);
    h.managedOperation.mockResolvedValue(operation);
    h.applyManaged.mockImplementation(async () => {
      const next = { ...operation, status: "rolled_back", sequence: 2, error: null };
      h.managedOperation.mockResolvedValue(next);
      return next;
    });
    h.prepareManaged.mockImplementation(async () => {
      const next = { ...preparation, status: "preparing", sequence: 2 };
      h.managedPreparation.mockResolvedValue(next);
      return next;
    });
    await renderSetup(<ManagedNetworkPreparationPage id={preparation.id} />);
    expect(host.textContent).toContain(c.managed.resetBeforeContinue);
    expect(host.textContent).toContain("Server C unreachable");
    expect(host.querySelector('section[aria-label="server-c"]')).not.toBeNull();
    expect(
      [...host.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === c.managed.retryPreparation,
      ),
    ).toBe(false);
    expect(host.textContent).not.toContain(c.managed.editSettings);
    await click(c.managed.retryCleanup);
    expect(h.applyManaged).toHaveBeenCalledWith({
      operationId: operation.id,
      planHash: operation.planHash,
      action: "rollback",
    });
    expect(h.prepareManaged).not.toHaveBeenCalled();
    await click(c.managed.retryPreparation);
    expect(h.prepareManaged).toHaveBeenCalledWith(preparation.input);
    expect(host.querySelector('section[aria-label="server-c"]')).toBeNull();
    await act(async () =>
      emitProgress("preparations", {
        ...preparation,
        status: "ready",
        sequence: 3,
        operationId: "new-plan",
      }),
    );
    expect(
      host.querySelector('a[href="/servers/clusters/operations/new-plan"]')?.textContent,
    ).toContain(c.managed.reviewNetwork);
    expect(h.applyManaged).toHaveBeenCalledTimes(1);
  });

  it("confirms discarding a failed preparation, then closes it without running host work", async () => {
    const failed = { ...managedPreparationFixture(), status: "failed" };
    h.managedPreparation.mockResolvedValue(failed);
    await renderSetup(<ManagedNetworkPreparationPage id={failed.id} />);
    await click(c.managed.discardSetup);
    expect(confirmation().textContent).toContain(c.managed.discardDescription);
    expect(h.discardPreparation).not.toHaveBeenCalled();
    await click(c.cancel, confirmation());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click(c.managed.discardSetup);
    await click(c.managed.discardSetup, confirmation());
    expect(h.discardPreparation).toHaveBeenCalledExactlyOnceWith({
      preparationId: failed.id,
      sequence: failed.sequence,
    });
    expect(h.replace).toHaveBeenCalledWith("/servers?tab=cluster");
    expect(h.prepareManaged).not.toHaveBeenCalled();
    expect(h.applyManaged).not.toHaveBeenCalled();
    expect(host.textContent).toContain(c.managed.setupDiscardedHint);
    expect(host.textContent).not.toContain(c.managed.retryPreparation);
  });

  it("keeps a failed discard actionable and reattaches to saved progress", async () => {
    const failed = { ...managedPreparationFixture(), status: "interrupted" };
    h.managedPreparation.mockResolvedValue(failed);
    h.discardPreparation.mockRejectedValueOnce(
      new Error("Preparation changed. Reload its saved progress."),
    );
    await renderSetup(<ManagedNetworkPreparationPage id={failed.id} />);
    await click(c.managed.discardSetup);
    await click(c.managed.discardSetup, confirmation());
    expect(confirmation().querySelector('[role="alert"]')?.textContent).toContain(
      "Preparation changed",
    );
    expect(h.replace).not.toHaveBeenCalled();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    await click(c.managed.discardSetup, confirmation());
    expect(h.discardPreparation.mock.calls[1]![0]).toEqual(h.discardPreparation.mock.calls[0]![0]);
    expect(h.replace).toHaveBeenCalledWith("/servers?tab=cluster");
  });

  it.each(["preparing", "cancelled", "read-only"])(
    "does not offer discard for %s preparation",
    async (state) => {
      const preparation = {
        ...managedPreparationFixture(),
        status: state === "read-only" ? "failed" : state,
      };
      if (state === "read-only")
        h.capabilities.mockResolvedValue({ ...clusterCapabilitiesFixture(), canManage: false });
      h.managedPreparation.mockResolvedValue(preparation);
      await renderSetup(<ManagedNetworkPreparationPage id={preparation.id} />);
      expect(
        [...host.querySelectorAll("button")].some(
          (button) => button.textContent?.trim() === c.managed.discardSetup,
        ),
      ).toBe(false);
      expect(h.discardPreparation).not.toHaveBeenCalled();
    },
  );

  it("discards the reviewed plan through its guarded endpoint instead of only navigating away", async () => {
    const operation = managedOperationFixture();
    h.managedOperation.mockResolvedValue(operation);
    await renderSetup(<ManagedNetworkOperationPage id={operation.id} />);
    await click(c.managed.discardPlan);
    expect(h.discardPlan).not.toHaveBeenCalled();
    await click(c.managed.discardPlan, confirmation());
    expect(h.discardPlan).toHaveBeenCalledExactlyOnceWith({
      operationId: operation.id,
      planHash: operation.planHash,
    });
    expect(h.replace).toHaveBeenCalledWith("/servers?tab=cluster");
    expect(h.applyManaged).not.toHaveBeenCalled();
    expect(host.textContent).toContain(c.managed.status.cancelled);
  });

  it("cleans a failed initial network through rollback and only offers Close after cleanup settles", async () => {
    const operation = { ...managedOperationFixture(), status: "needs_attention" };
    h.managedOperation.mockResolvedValue(operation);
    h.applyManaged.mockImplementationOnce(async () => {
      const next = { ...operation, sequence: 2, status: "rolling_back" };
      h.managedOperation.mockResolvedValue(next);
      return next;
    });
    await renderSetup(<ManagedNetworkOperationPage id={operation.id} />);
    await click(c.managed.cleanupSetup);
    expect(confirmation().textContent).toContain(c.managed.cleanupDescription);
    expect(h.applyManaged).not.toHaveBeenCalled();
    await click(c.managed.cleanupSetup, confirmation());
    expect(h.applyManaged).toHaveBeenCalledExactlyOnceWith({
      operationId: operation.id,
      planHash: operation.planHash,
      action: "rollback",
    });
    expect(host.textContent).toContain(c.managed.status.rolling_back);
    expect(host.textContent).not.toContain(c.managed.closeSetup);
    expect(h.discardPlan).not.toHaveBeenCalled();
    await act(async () =>
      emitProgress("operations", {
        ...managedOperationFixture(),
        sequence: 3,
        status: "rolled_back",
      }),
    );
    expect(host.textContent).toContain(c.managed.setupCleanedHint);
    expect(
      [...host.querySelectorAll("a")]
        .find((link) => link.textContent?.trim() === c.managed.closeSetup)
        ?.getAttribute("href"),
    ).toBe("/servers?tab=cluster");
  });

  it("explains that restoring a failed change preserves an existing cluster", async () => {
    const operation = { ...managedOperationFixture(), status: "interrupted" };
    operation.plan.baseRevision = 1;
    operation.plan.previous = operation.plan.config;
    h.managedOperation.mockResolvedValue(operation);
    await renderSetup(<ManagedNetworkOperationPage id={operation.id} />);
    expect(host.textContent).not.toContain(c.managed.cleanupSetup);
    await click(c.managed.restore);
    expect(confirmation().textContent).toContain(c.managed.restoreDescription);
    expect(h.applyManaged).not.toHaveBeenCalled();
  });

  it("exposes cleanup on the failed cluster page without bypassing the recovery operation", async () => {
    const operation = { ...managedOperationFixture(), status: "needs_attention" };
    h.get.mockResolvedValue({
      ...serverClusterFixture(),
      id: operation.clusterId,
      verification: null,
      operation,
      network: {
        ...operation.plan.config.network,
        id: "network",
        ownership: "openship",
        encryption: "wireguard",
      },
    });
    await renderSetup(<ClusterDetail id={operation.clusterId} />);
    await click(c.managed.cleanupSetup);
    expect(h.push).toHaveBeenCalledWith(`/servers/clusters/operations/${operation.id}`);
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.planManaged).not.toHaveBeenCalled();
    expect(h.applyManaged).not.toHaveBeenCalled();
  });

  it("reuses a removal request after a failed plan response and keeps network removal reviewable", async () => {
    const operation = managedOperationFixture();
    h.get.mockResolvedValue({
      ...serverClusterFixture(),
      id: operation.clusterId,
      operation: null,
      verification: null,
      network: {
        ...operation.plan.config.network,
        id: "network",
        ownership: "openship",
        encryption: "wireguard",
      },
    });
    h.planManaged.mockRejectedValueOnce(new Error("Plan response lost"));
    await renderSetup(<ClusterDetail id={operation.clusterId} />);
    await click(c.removeCluster);
    expect(h.planManaged).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "remove", clusterId: operation.clusterId }),
    );
    expect(h.applyManaged).not.toHaveBeenCalled();
    await click(c.removeCluster);
    expect(h.planManaged.mock.calls[1]![0].requestId).toBe(
      h.planManaged.mock.calls[0]![0].requestId,
    );
    expect(h.push).toHaveBeenCalledWith(`/servers/clusters/operations/${operation.id}`);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("streams durable progress without polling and exposes recovery when the controller is interrupted", async () => {
    vi.useFakeTimers();
    await act(async () =>
      root.render(
        <I18nProvider>
          <PlatformProvider deployMode="desktop" selfHosted>
            <ManagedNetworkOperationPage id={managedOperationFixture().id} />
          </PlatformProvider>
        </I18nProvider>,
      ),
    );
    expect(host.textContent).toContain(c.managed.status.applying);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(h.fetch).toHaveBeenCalledOnce();
    await act(async () =>
      emitProgress("operations", {
        ...managedOperationFixture(),
        sequence: 2,
        status: "interrupted",
      }),
    );
    expect(host.textContent).toContain(c.managed.resume);
    expect(host.textContent).toContain(c.managed.cleanupSetup);
    expect(h.applyManaged).not.toHaveBeenCalled();
    await click(c.managed.resume);
    expect(h.applyManaged).toHaveBeenCalledWith({
      operationId: managedOperationFixture().id,
      planHash: managedOperationFixture().planHash,
      action: "resume",
    });
    await act(async () =>
      emitProgress("operations", {
        ...managedOperationFixture(),
        sequence: 4,
        status: "succeeded",
      }),
    );
    expect(host.textContent).toContain(c.managed.status.succeeded);
    expect(
      host.querySelector(`a[href="/servers/clusters/${managedOperationFixture().clusterId}"]`),
    ).not.toBeNull();
  });
  it("starts durable prerequisite preparation before inspecting or applying a network", async () => {
    h.capabilities.mockResolvedValue({
      ...clusterCapabilitiesFixture(),
      modes: ["native", "wireguard"],
    });
    await startNetworkStep();
    expect(host.querySelector<HTMLInputElement>('input[value="wireguard"]')?.checked).toBe(true);
    expect(host.textContent).toContain(c.managed.requirements);
    expect(host.querySelector(`input[placeholder="${c.privateAddress}"]`)).toBeNull();
    await click(c.managed.inspect);
    expect(h.prepareManaged).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Production",
        cidr: undefined,
        members: [
          expect.objectContaining({ serverId: "server-a", endpoint: undefined, listenPort: 51820 }),
          expect.objectContaining({ serverId: "server-b", endpoint: undefined, listenPort: 51820 }),
        ],
      }),
    );
    expect(h.push).toHaveBeenCalledWith(
      `/servers/clusters/preparations/${managedPreparationFixture().id}`,
    );
    expect(h.planManaged).not.toHaveBeenCalled();
    expect(h.applyManaged).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.verify).not.toHaveBeenCalled();
  });
  it("keeps the draft actionable when preparation cannot start", async () => {
    h.capabilities.mockResolvedValue({
      ...clusterCapabilitiesFixture(),
      modes: ["native", "wireguard"],
    });
    h.prepareManaged.mockRejectedValueOnce(
      new Error("A selected server belongs to another cluster"),
    );
    await startNetworkStep();
    await click(c.managed.inspect);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("another cluster");
    expect(h.applyManaged).not.toHaveBeenCalled();
    await click(c.managed.inspect);
    expect(h.prepareManaged).toHaveBeenCalledTimes(2);
    expect(h.prepareManaged.mock.calls[1]![0].requestId).toBe(
      h.prepareManaged.mock.calls[0]![0].requestId,
    );
    expect(h.push).toHaveBeenCalledWith(
      `/servers/clusters/preparations/${managedPreparationFixture().id}`,
    );
  });
  it("opens the saved preparation when its initial POST response was lost without submitting again", async () => {
    h.capabilities.mockResolvedValue({
      ...clusterCapabilitiesFixture(),
      modes: ["native", "wireguard"],
    });
    h.prepareManaged.mockImplementationOnce(async (input) => {
      h.managedPreparation.mockResolvedValue({
        ...managedPreparationFixture(),
        id: input.requestId,
        input,
      });
      throw new Error("Response lost after acceptance");
    });
    await startNetworkStep();
    await click(c.managed.inspect);
    const requestId = h.prepareManaged.mock.calls[0]![0].requestId;
    expect(h.managedPreparation).toHaveBeenCalledWith(requestId);
    expect(h.push).toHaveBeenCalledWith(`/servers/clusters/preparations/${requestId}`);
    expect(h.prepareManaged).toHaveBeenCalledOnce();
    expect(h.applyManaged).not.toHaveBeenCalled();
  });
  it("refuses expired plans after preparation and keeps the saved draft editable", async () => {
    const expired = managedOperationFixture();
    expired.plan.preparationId = managedPreparationFixture().id;
    expired.plan.expiresAt = new Date(Date.now() - 1).toISOString();
    h.managedOperation.mockResolvedValue(expired);
    await act(async () =>
      root.render(
        <I18nProvider>
          <PlatformProvider deployMode="desktop" selfHosted>
            <ManagedNetworkOperationPage id={expired.id} />
          </PlatformProvider>
        </I18nProvider>,
      ),
    );
    expect(host.textContent).toContain(c.managed.expired);
    const apply = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === c.managed.apply,
    )!;
    expect(apply.disabled).toBe(true);
    expect(h.applyManaged).not.toHaveBeenCalled();
    expect(
      host.querySelector(
        `a[href="/servers/clusters/new?preparation=${expired.plan.preparationId}"]`,
      ),
    ).not.toBeNull();
  });
  it("reopens saved prerequisite failures, retries explicitly, and waits for review before apply", async () => {
    vi.useFakeTimers();
    const failed = managedPreparationFixture();
    failed.status = "failed";
    failed.error = "Python installation needs attention";
    failed.hosts[0]!.steps[2] = {
      ...failed.hosts[0]!.steps[2]!,
      status: "failed",
      message: "Package repository is unavailable",
    };
    failed.hosts[0]!.logs = [
      {
        timestamp: new Date().toISOString(),
        level: "error",
        step: "python3",
        message: "Repository connection refused",
      },
    ];
    h.managedPreparation.mockResolvedValue(failed);
    await act(async () =>
      root.render(
        <I18nProvider>
          <PlatformProvider deployMode="desktop" selfHosted>
            <ManagedNetworkPreparationPage id={failed.id} />
          </PlatformProvider>
        </I18nProvider>,
      ),
    );
    expect(host.textContent).toContain("Package repository is unavailable");
    expect(host.textContent).toContain("Repository connection refused");
    expect(host.textContent).toContain(c.managed.setupSteps.python3);
    const serverToggle = host.querySelector<HTMLButtonElement>(
      'button[aria-controls="network-steps-server-a"]',
    )!;
    expect(serverToggle.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector("#network-steps-server-a")).toBeNull();
    await act(async () => serverToggle.click());
    expect(host.querySelector("#network-steps-server-a")?.textContent).toContain(
      "Package repository is unavailable",
    );
    await act(async () => serverToggle.click());
    expect(h.prepareManaged).not.toHaveBeenCalled();
    await click(c.managed.retryPreparation);
    expect(h.prepareManaged).toHaveBeenCalledWith(failed.input);
    expect(host.textContent).toContain(c.managed.preparationStatus.preparing);
    await act(async () =>
      emitProgress("preparations", {
        ...failed,
        sequence: 3,
        status: "ready",
        error: null,
        operationId: managedOperationFixture().id,
      }),
    );
    expect(host.textContent).toContain(c.managed.preparationStatus.ready);
    expect(serverToggle.getAttribute("aria-expanded")).toBe("false");
    expect(
      host.querySelector(`a[href="/servers/clusters/operations/${managedOperationFixture().id}"]`),
    ).not.toBeNull();
    expect(h.applyManaged).not.toHaveBeenCalled();
  });
  it("blocks an edit while managed recovery is pending and links to the operation", async () => {
    const operation = { ...managedOperationFixture(), status: "needs_attention" };
    h.get.mockResolvedValue({ ...serverClusterFixture(), operation });
    await render("cluster-a");
    expect(host.textContent).toContain(c.managed.recoveryHint);
    expect(
      host.querySelector(`a[href="/servers/clusters/operations/${operation.id}"]`),
    ).not.toBeNull();
    expect(host.querySelector("input")).toBeNull();
  });
  it.each([undefined, "cluster-a"])("blocks direct Cloud access for clusterId=%s", async (id) => {
    await render(id, "cloud", false);
    expect(host.textContent).toContain(c.selfHostedOnly);
    expect(host.querySelector("input")).toBeNull();
    expect(h.capabilities).not.toHaveBeenCalled();
    expect(h.get).not.toHaveBeenCalled();
    expect(h.servers).not.toHaveBeenCalled();
  });

  it.each([undefined, "cluster-a"])(
    "requires fleet management permission for clusterId=%s",
    async (id) => {
      h.capabilities.mockResolvedValue({ ...clusterCapabilitiesFixture(), canManage: false });
      await render(id);
      expect(host.textContent).toContain(c.managePermissionRequired);
      expect(host.querySelector("input")).toBeNull();
      expect(h.get).not.toHaveBeenCalled();
      expect(h.servers).not.toHaveBeenCalled();
      expect(h.list).not.toHaveBeenCalled();
    },
  );

  it("blocks an edit deep link while network verification is active", async () => {
    const cluster = serverClusterFixture();
    h.get.mockResolvedValue({
      ...cluster,
      verification: {
        revision: cluster.revision,
        status: "running",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    await render(cluster.id);
    expect(host.textContent).toContain(c.editWhileVerifying);
    expect(host.querySelector(`a[href="/servers/clusters/${cluster.id}"]`)).not.toBeNull();
    expect(host.querySelector("input")).toBeNull();
    expect(h.servers).not.toHaveBeenCalled();
  });

  it("recovers a failed capability request without navigating away", async () => {
    h.capabilities.mockRejectedValueOnce(new Error("API is unavailable"));
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("API is unavailable");
    await click(c.retry);
    expect(host.querySelector("input")).not.toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("preserves the draft between inline steps and saves through the existing create/verify flow", async () => {
    await render();
    expect(host.querySelector("h1")?.textContent).toBe(c.createCluster);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await fill(host.querySelector(`input[placeholder="${c.namePlaceholder}"]`), "My fleet");
    const members = [...host.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')];
    await act(async () => {
      members[0]!.click();
      members[1]!.click();
    });
    await click(c.continue);
    expect(host.querySelector("h2")?.textContent).toBe(c.stepNetwork);
    expect(document.activeElement).toBe(host.querySelector("h2"));
    await fill(host.querySelector('input[placeholder^="10.20.0.0/24"]'), "10.20.0.0/24");
    const addresses = host.querySelectorAll<HTMLInputElement>('input[placeholder="10.20.0.10"]');
    await fill(addresses[0]!, "10.20.0.2");
    await fill(addresses[1]!, "10.20.0.3");
    await click(c.back);
    expect(
      host.querySelector<HTMLInputElement>(`input[placeholder="${c.namePlaceholder}"]`)?.value,
    ).toBe("My fleet");
    expect(host.querySelectorAll('[role="checkbox"][aria-checked="true"]')).toHaveLength(2);
    await click(c.continue);
    expect(host.querySelector<HTMLInputElement>('input[placeholder^="10.20.0.0/24"]')?.value).toBe(
      "10.20.0.0/24",
    );
    await click(c.continue);
    expect(host.querySelector("h2")?.textContent).toBe(c.stepReview);
    expect(h.create).not.toHaveBeenCalled();
    await click(c.createAndVerify);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "My fleet",
        requestId: expect.any(String),
        network: expect.objectContaining({ cidrs: ["10.20.0.0/24"] }),
        members: [
          expect.objectContaining({ serverId: "server-a", privateIp: "10.20.0.2" }),
          expect.objectContaining({ serverId: "server-b", privateIp: "10.20.0.3" }),
        ],
      }),
    );
    expect(h.verify).toHaveBeenCalledWith(expect.objectContaining({ id: "cluster-a" }));
    expect(h.update).not.toHaveBeenCalled();
    expect(h.replace).toHaveBeenCalledWith("/servers/clusters/cluster-a");
  });

  it("keeps the original revision and draft on edit conflicts, with Cancel returning to the cluster", async () => {
    h.update.mockRejectedValue(new Error("Cluster configuration changed. Reload before editing."));
    await render("cluster-a");
    await fill(host.querySelector(`input[placeholder="${c.namePlaceholder}"]`), "Changed fleet");
    await click(c.continue);
    await click(c.continue);
    await click(c.saveAndVerify);
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ clusterId: "cluster-a", revision: 1, name: "Changed fleet" }),
    );
    expect(h.create).not.toHaveBeenCalled();
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Cluster configuration changed",
    );
    expect(host.textContent).toContain("Changed fleet");
    await click(c.cancel);
    expect(h.push).toHaveBeenCalledWith("/servers/clusters/cluster-a");
  });

  it("repairs the mismatched ranges from actual server masks and saves through the existing flow", async () => {
    h.inspect.mockImplementation(async (id: string) =>
      observation(id === "server-a" ? "10.20.1.10" : "10.20.2.10", "eth1.4000"),
    );
    await startNetworkStep();
    await fill(host.querySelector('input[placeholder^="10.20.0.0/24"]'), "10.20.0.0/24");
    const addresses = host.querySelectorAll<HTMLInputElement>('input[placeholder="10.20.0.10"]');
    await fill(addresses[0]!, "10.20.1.10");
    await fill(addresses[1]!, "10.20.2.10");
    await click(c.continue);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Alpha");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(c.detectNetworkSettings);
    await click(c.detectNetworkSettings);
    expect(h.inspect.mock.calls.map(([id]) => id)).toEqual(["server-a", "server-b"]);
    expect(host.querySelector<HTMLInputElement>('input[placeholder^="10.20.0.0/24"]')?.value).toBe(
      "10.20.1.0/24, 10.20.2.0/24",
    );
    expect(
      [...host.querySelectorAll<HTMLInputElement>(`input[placeholder="${c.autoDetect}"]`)].map(
        (input) => input.value,
      ),
    ).toEqual(["eth1.4000", "eth1.4000"]);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.verify).not.toHaveBeenCalled();
    await click(c.continue);
    await click(c.createAndVerify);
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({
        network: expect.objectContaining({ cidrs: ["10.20.1.0/24", "10.20.2.0/24"] }),
        members: [
          expect.objectContaining({
            serverId: "server-a",
            providerId: "custom",
            privateIp: "10.20.1.10",
            interfaceName: "eth1.4000",
          }),
          expect.objectContaining({
            serverId: "server-b",
            providerId: "custom",
            privateIp: "10.20.2.10",
            interfaceName: "eth1.4000",
          }),
        ],
      }),
    );
    expect(h.verify).toHaveBeenCalledTimes(1);
  });

  it("keeps ambiguous interfaces as an explicit choice and fills ranges when one is selected", async () => {
    const found = observation("10.20.0.2");
    found.interfaces.push(...observation("10.30.0.2", "eth2").interfaces);
    h.inspect.mockImplementation(async (id: string) =>
      id === "server-a" ? found : observation("10.20.0.3"),
    );
    await startNetworkStep();
    await click(c.detectNetworkSettings);
    const addresses = host.querySelectorAll<HTMLInputElement>('input[placeholder="10.20.0.10"]');
    expect(addresses[0]!.value).toBe("");
    expect(addresses[1]!.value).toBe("10.20.0.3");
    expect(host.textContent).toContain(c.chooseDetectedInterface);
    const choice = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("10.30.0.2/24"),
    );
    await act(async () => choice!.click());
    expect(addresses[0]!.value).toBe("10.30.0.2");
    expect(choice?.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector<HTMLInputElement>('input[placeholder^="10.20.0.0/24"]')?.value).toBe(
      "10.20.0.0/24, 10.30.0.0/24",
    );
    await click(c.continue);
    expect(host.querySelector("h2")?.textContent).toBe(c.stepReview);
  });

  it("shows missing networks and inspection failures per server without inventing addresses, and supports retry", async () => {
    h.inspect.mockImplementation(async (id: string) => {
      if (id === "server-b") throw new Error("SSH connection timed out");
      return observation("192.0.2.10", "eth0");
    });
    await startNetworkStep();
    await click(c.detectNetworkSettings);
    expect(host.textContent).toContain(c.noPrivateInterface);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("SSH connection timed out");
    expect(
      [...host.querySelectorAll<HTMLInputElement>('input[placeholder="10.20.0.10"]')].every(
        (input) => !input.value,
      ),
    ).toBe(true);
    expect(host.querySelector<HTMLInputElement>('input[placeholder^="10.20.0.0/24"]')?.value).toBe(
      "",
    );
    h.inspect.mockResolvedValue(observation("10.20.0.3"));
    const retry = [...host.querySelectorAll("button")].filter(
      (button) => button.textContent?.trim() === c.inspect,
    )[1];
    await act(async () => retry!.click());
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(
      host.querySelectorAll<HTMLInputElement>('input[placeholder="10.20.0.10"]')[1]?.value,
    ).toBe("10.20.0.3");
    expect(host.textContent).toContain(c.noPrivateInterface);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("limits concurrent inspections and locks the draft until all results are applied", async () => {
    h.servers.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({
        id: `server-${i}`,
        name: `Server ${i}`,
        sshHost: `192.0.2.${i + 1}`,
      })),
    );
    const pending = new Map<string, (value: NetworkHostObservation) => void>();
    h.inspect.mockImplementation(
      (id: string) => new Promise<NetworkHostObservation>((resolve) => pending.set(id, resolve)),
    );
    await startNetworkStep();
    await click(c.detectNetworkSettings);
    expect(h.inspect).toHaveBeenCalledTimes(3);
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    expect(
      [...host.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === c.continue,
      )?.disabled,
    ).toBe(true);
    for (const [start, count] of [
      [0, 3],
      [3, 3],
      [6, 1],
    ]) {
      await act(async () => {
        for (let i = start!; i < start! + count!; i++)
          pending.get(`server-${i}`)!(observation(`10.20.0.${i + 1}`));
      });
      expect(h.inspect).toHaveBeenCalledTimes(Math.min(start! + count! + 3, 7));
    }
    expect(host.querySelector("fieldset")?.disabled).toBe(false);
    expect(
      host.querySelectorAll<HTMLInputElement>('input[placeholder="10.20.0.10"]')[6]?.value,
    ).toBe("10.20.0.7");
    expect(h.create).not.toHaveBeenCalled();
  });
});
