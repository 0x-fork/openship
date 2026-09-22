// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { ModalProvider } from "@/context/ModalContext";
import { baseDictionary } from "@/i18n";
import { UNKNOWN_OUTCOME_MESSAGE } from "@/hooks/prepare-stream-outcome";
import { DomainSettings } from "./DomainSettings";

const mocks = vi.hoisted(() => ({
  settings: {} as any,
  invalidate: vi.fn(),
  toast: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/context/ProjectSettingsContext", () => ({ useProjectSettings: () => mocks.settings }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("@/context/PlatformContext", () => ({
  usePlatform: () => ({ baseDomain: "opsh.io", selfHosted: true }),
}));
vi.mock("@/context/CloudContext", () => ({
  useCloud: () => ({ requireCloud: vi.fn(), connected: false }),
}));
vi.mock("@/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@/hooks/useLocalhostForward", () => ({
  useLocalhostForward: () => ({ canForward: false }),
}));
vi.mock("@/hooks/useProjectEndpoints", () => ({ invalidateProjectCaches: mocks.invalidate }));
vi.mock("@/lib/api", async (original) => {
  const actual = await original<typeof import("@/lib/api")>();
  return {
    ...actual,
    getApiBaseUrl: () => "http://localhost:4000/api/",
    projectsApi: { ...actual.projectsApi, getEdgeStatus: async () => ({ ready: true }) },
    deployApi: {
      ...actual.deployApi,
      checkPorts: async () => ({ data: [] }),
      checkOutput: async () => ({ data: [] }),
    },
  };
});
vi.mock("./RoutingConfigCard", () => ({ RoutingConfigCard: () => null }));
vi.mock("./RouteRules", () => ({ RouteRules: () => null }));

let host: HTMLDivElement;
let root: Root;
let stream: ReadableStreamDefaultController<Uint8Array>;
const retryCopy = baseDictionary.projects.routingRetry;
const names = ["api", "app", "web"];
const ports = [4010, 3021, 3022];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller;
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
  );
  mocks.settings = {
    id: "project-a",
    projectData: {
      id: "project-a",
      name: "Stack",
      activeDeploymentId: "deploy-a",
      serviceCount: 3,
      routingUnsynced: false,
      awaitingDecision: false,
      publicEndpoints: [],
      options: { hasServer: true },
    },
    domainsData: { domains: [], isLoading: false },
    buildData: {},
    servicesData: {
      isLoading: false,
      services: names.map((name, index) => ({
        id: `svc-${name}`,
        name,
        kind: "compose",
        enabled: true,
        exposed: true,
        ports: [String(ports[index])],
        exposedPort: String(ports[index]),
        domainType: "custom",
        customDomain: `${name}.example.com`,
        publicEndpoints: [],
      })),
    },
    setProjectData: vi.fn(),
    updateDomains: vi.fn(),
    refreshServices: vi.fn(),
    setPendingDomainAction: vi.fn(),
    access: { kind: "none", host: null, url: null },
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function render() {
  await act(async () =>
    root.render(
      <I18nProvider>
        <ModalProvider>
          <DomainSettings />
        </ModalProvider>
      </I18nProvider>,
    ),
  );
}
function retryButtons() {
  return [...host.querySelectorAll("button")].filter(
    (button) => button.textContent?.trim() === retryCopy.retry,
  );
}
async function emit(type: string, data: Record<string, unknown>, close = false) {
  await act(async () => {
    stream.enqueue(
      new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`),
    );
    if (close) stream.close();
  });
}
async function startRetry() {
  await render();
  await act(async () => retryButtons().at(-1)!.click());
  await emit("session", {});
}

describe("routing retry on the Domains page", () => {
  it.each([false, true])(
    "offers one project repair action and one per missing record (warning: %s)",
    async (routingUnsynced) => {
      mocks.settings.projectData.routingUnsynced = routingUnsynced;
      await render();
      expect(host.textContent?.includes(retryCopy.title)).toBe(routingUnsynced);
      for (const name of names) expect(host.textContent).toContain(`${name}.example.com`);
      // One project action plus an action on each of the three otherwise stuck cards.
      expect(retryButtons()).toHaveLength(4);
      await act(async () => retryButtons()[1]!.click());
      expect(mocks.fetch).toHaveBeenCalledWith(
        "http://localhost:4000/api/projects/project-a/routing/retry/stream",
        expect.objectContaining({ method: "POST" }),
      );
      await emit("log", { message: "api.example.com: route restored", level: "info" });
      expect(document.body.textContent).toContain("api.example.com: route restored");
    },
  );

  it("keeps a slow repair open beyond the ordinary request timeout, with live logs", async () => {
    vi.useFakeTimers();
    await startRetry();
    await emit("log", { message: "Connecting to the deployment server…", level: "info" });
    await act(async () => vi.advanceTimersByTimeAsync(65_000));
    const request = mocks.fetch.mock.calls[0]![1] as RequestInit;
    expect(request.signal?.aborted).toBe(false);
    expect(document.body.textContent).toContain(retryCopy.retrying);
    expect(document.body.textContent).not.toContain("Request timed out");
    await emit("log", { message: "web.example.com: existing certificate reused", level: "info" });
    await emit("complete", { status: "completed" }, true);
    expect(document.body.textContent).toContain(retryCopy.success);
    expect(document.body.textContent).toContain("existing certificate reused");
    expect(mocks.invalidate).toHaveBeenCalledWith("project-a");
  });

  it("retains the real partial-failure log and refreshes the cards without claiming success", async () => {
    await startRetry();
    await emit("log", { message: "api.example.com: route restored", level: "info" });
    await emit("log", { message: "web.example.com: HTTP challenge returned 404", level: "error" });
    await emit("complete", { status: "failed" }, true);
    expect(document.body.textContent).toContain("HTTP challenge returned 404");
    expect(document.body.textContent).toContain("api.example.com: route restored");
    expect(document.body.textContent).toContain(retryCopy.failed);
    expect(document.body.textContent).not.toContain(retryCopy.success);
    expect(mocks.invalidate).toHaveBeenCalledWith("project-a");
    expect(mocks.settings.setProjectData).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("keeps logs and an honest unknown outcome when the connection drops before completion", async () => {
    await startRetry();
    await emit("log", { message: "Checking HTTPS on the remote server…", level: "info" });
    await act(async () => stream.error(new Error("Connection reset")));
    expect(document.body.textContent).toContain("Checking HTTPS on the remote server");
    expect(document.body.textContent).toContain(UNKNOWN_OUTCOME_MESSAGE);
    expect(document.body.textContent).not.toContain(retryCopy.success);
    expect(mocks.invalidate).toHaveBeenCalledWith("project-a");
  });

  it("shows Verify once repair has created a pending domain record", async () => {
    mocks.settings.domainsData.domains = names.map((name) => ({
      id: `dom-${name}`,
      hostname: `${name}.example.com`,
      domainType: "custom",
      verified: false,
      status: "pending",
      sslStatus: "none",
      serviceId: `svc-${name}`,
    }));
    await render();
    const verifyButtons = [...host.querySelectorAll("button")].filter(
      (button) => button.textContent?.trim() === baseDictionary.projectSettings.domains.menu.verify,
    );
    expect(verifyButtons).toHaveLength(3);
    expect(retryButtons()).toHaveLength(1);
    // Repair is also available from a persisted row's menu, independent of
    // whether it is still pending, has an SSL error, or was previously verified.
    await act(async () => host.querySelector<HTMLButtonElement>("button[aria-expanded]")!.click());
    expect(retryButtons()).toHaveLength(2);
    await act(async () => retryButtons().at(-1)!.click());
    expect(mocks.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/projects/project-a/routing/retry/stream",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
