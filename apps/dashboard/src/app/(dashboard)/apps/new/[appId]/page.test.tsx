// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getAppTemplate, type AppTemplate } from "@repo/core";
import { baseDictionary } from "@/i18n";
import { ModalProvider } from "@/context/ModalContext";
import type { RoutingSettingsCardProps } from "@/components/routing/RoutingSettingsCard";
import AppInstallPage from "./page";

const h = vi.hoisted(() => ({
  template: vi.fn(),
  hostFit: vi.fn(),
  services: vi.fn(),
  info: vi.fn(),
  install: vi.fn(),
  updateService: vi.fn(),
  updateSettings: vi.fn(),
  build: vi.fn(),
  buildStatus: vi.fn(),
  toast: vi.fn(),
  requireCloud: vi.fn(),
  cloud: false,
  appId: "convex",
  query: "projectId=draft",
  router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("@/lib/api", () => ({
  appsApi: {
    template: h.template,
    hostFit: h.hostFit,
    install: h.install,
    updateSettings: h.updateSettings,
  },
  servicesApi: { list: h.services, update: h.updateService },
  projectsApi: { getInfo: h.info },
  deployApi: { buildAccess: h.build, getBuildStatus: h.buildStatus },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  useParams: () => ({ appId: h.appId }),
  useSearchParams: () => new URLSearchParams(h.query),
}));
vi.mock("@/components/i18n-provider", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/i18n-provider")>(),
  useI18n: () => ({ t: baseDictionary, locale: "en" }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: h.toast }) }));
vi.mock("@/context/PlatformContext", () => ({
  usePlatform: () => ({
    baseDomain: "example.test",
    deployMode: h.cloud ? "cloud" : "docker",
    selfHosted: !h.cloud,
  }),
}));
vi.mock("@/context/CloudContext", () => ({
  useCloud: () => ({ connected: h.cloud, loading: false, requireCloud: h.requireCloud }),
}));
vi.mock("@/hooks/useSSEConnection", () => ({
  useBuildStream: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
}));
vi.mock("@/hooks/useCloudDeployPricing", () => ({ useCloudDeployPricing: () => vi.fn() }));
vi.mock("@/hooks/useLocalDeployGate", () => ({
  useLocalDeployGate: () => ({ blocks: () => false }),
}));
vi.mock("@/components/deploy/AppDestinationPicker", () => ({
  AppDestinationPicker: ({ onChange }: { onChange: (target: object) => void }) => (
    <button onClick={() => onChange({ deployTarget: "server", serverId: "small-server" })}>
      Select small server
    </button>
  ),
}));
vi.mock("@/components/routing/RoutingSettingsCard", () => ({
  RoutingSettingsCard: (props: RoutingSettingsCardProps) => (
    <div>
      <button type="button" onClick={() => props.onDomainTypeChange("custom")}>
        Use custom domain
      </button>
      <button type="button" onClick={() => props.onCustomDomainChange("app.example.test")}>
        Enter hostname
      </button>
      <button type="button" onClick={() => props.onCustomDomainChange("not-a-hostname")}>
        Enter invalid hostname
      </button>
      <input
        aria-label="Custom domain"
        value={props.customDomain}
        onChange={(event) => props.onCustomDomainChange(event.target.value)}
      />
    </div>
  ),
}));
vi.mock("@/components/deploy/CleanDeployProgress", () => ({
  CleanDeployProgressCard: () => null,
  firstPublicHost: () => null,
}));
vi.mock("@/components/domains/DnsRecordsModal", () => ({
  default: ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) => (
    <>
      <button onClick={onConfirm}>Deploy after DNS</button>
      <button onClick={onCancel}>Cancel DNS</button>
    </>
  ),
}));
vi.mock("@/components/LocalDeployComingSoonModal", () => ({
  LocalDeployComingSoonModal: () => null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const template = getAppTemplate("convex")!;
const saved = {
  services: template.services!.map((service) => ({
    id: service.name,
    name: service.name,
    ports: [...(service.ports ?? [])],
    exposed: false,
    publicEndpoints: [],
  })),
};
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.cloud = false;
  h.appId = "convex";
  h.query = "projectId=draft";
  h.template.mockReset();
  h.hostFit.mockReset().mockResolvedValue({
    data: {
      minResources: null,
      capacity: { cpuCores: 0, memoryMb: 0, source: "unknown" },
      fit: { ok: true },
    },
  });
  h.services.mockReset();
  h.info.mockResolvedValue({ data: { project: { slug: "saved-convex" } } });
  h.install.mockResolvedValue({ data: { kind: "template", projectId: "installed-app" } });
  h.updateSettings.mockResolvedValue(undefined);
  h.updateService.mockResolvedValue(undefined);
  h.build.mockResolvedValue({ data: { deployment_id: "new-deployment" } });
  h.buildStatus.mockResolvedValue({ data: { status: "pending" } });
  h.requireCloud.mockResolvedValue(true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const controls = () => [...container.querySelectorAll<HTMLButtonElement>(
  'section[aria-labelledby^="endpoint-"] button[aria-haspopup="listbox"]',
)];
const choices = () => controls().map((control) => control.textContent?.trim());
const render = () =>
  act(async () =>
    root.render(
      <ModalProvider>
        <AppInstallPage />
      </ModalProvider>,
    ),
  );
const button = (label: string) => {
  const node = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === label,
  );
  expect(node, `button ${label}`).toBeDefined();
  return node!;
};
const click = (label: string) => act(async () => button(label).click());

async function supabase(
  options: { cloud?: boolean; draft?: boolean; template?: AppTemplate } = {},
) {
  h.cloud = options.cloud ?? true;
  h.appId = "supabase";
  h.query = options.draft ? "projectId=draft" : "";
  const app = options.template ?? getAppTemplate("supabase")!;
  h.template.mockResolvedValue({ data: app });
  h.services.mockResolvedValue({
    services: app.services!.map((service) => ({
      id: service.name,
      name: service.name,
      ports: [],
      exposed: false,
      publicEndpoints: [],
    })),
  });
  await render();
}

it("restores saved routes when a catalog refresh interrupts the draft read", async () => {
  const catalog = deferred<{ data: AppTemplate }>();
  const services = deferred<typeof saved>();
  h.template.mockReturnValue(catalog.promise);
  h.services.mockReturnValue(services.promise);
  await render();
  expect(choices()).toEqual(["Domain", "Domain", "Domain"]);

  await act(async () => catalog.resolve({ data: structuredClone(template) }));
  await act(async () => services.resolve(saved));
  expect(choices()).toEqual([
    "Port only (no domain)", "Port only (no domain)", "Port only (no domain)",
  ]);
});

it("preserves edits after a draft has finished loading when the catalog arrives later", async () => {
  const catalog = deferred<{ data: AppTemplate }>();
  h.template.mockReturnValue(catalog.promise);
  h.services.mockResolvedValue(saved);
  await render();
  expect(choices()[0]).toBe("Port only (no domain)");

  await act(async () => controls()[0].click());
  await act(async () => document.querySelector<HTMLButtonElement>('[role="option"]')!.click());
  expect(choices()[0]).toBe("Domain");

  await act(async () => catalog.resolve({ data: structuredClone(template) }));
  expect(choices()).toEqual(["Domain", "Port only (no domain)", "Port only (no domain)"]);
  expect(h.services).toHaveBeenCalledTimes(1);
});

it("installs Supabase with the generated managed domain when its label is left blank", async () => {
  await supabase();
  await click("Install");
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(h.install).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      templateId: "supabase",
      routes: [{ service: "kong", port: 8000, mode: "free" }],
    }),
  );
  expect(h.build).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ projectId: "installed-app" }),
  );
});

it("lets a Cloud user return to missing domains before creating a Supabase project", async () => {
  await supabase();
  await click("Use custom domain");
  await click("Install");
  const dialog = document.querySelector('[role="alertdialog"]');
  expect(dialog?.textContent).toContain("Studio & API");
  expect(h.install).not.toHaveBeenCalled();
  expect(h.build).not.toHaveBeenCalled();
  await click("Add domains");
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(h.install).not.toHaveBeenCalled();
  expect(button("Install").disabled).toBe(false);
});

it("only deploys Supabase without a domain after explicit confirmation, once", async () => {
  await supabase();
  await click("Use custom domain");
  await act(async () => {
    button("Install").click();
    button("Install").click();
  });
  expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
  expect(h.install).not.toHaveBeenCalled();
  await act(async () => {
    const confirm = button("Continue without domains");
    confirm.click();
    confirm.click();
  });
  expect(h.install).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      templateId: "supabase",
      routes: [{ service: "kong", port: 8000, mode: "port" }],
    }),
  );
  expect(h.build).toHaveBeenCalledTimes(1);
});

it("warns about port-only public endpoints but not Supabase's internal database", async () => {
  await supabase();
  await act(async () => controls()[0].click());
  const port = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((node) =>
    node.textContent?.includes("No public URL"),
  )!;
  await act(async () => port.click());
  await click("Install");
  const dialog = document.querySelector('[role="alertdialog"]');
  expect(dialog?.textContent).toContain("Studio & API");
  expect(dialog?.textContent).not.toContain("Database");
  expect(h.install).not.toHaveBeenCalled();
  await act(async () =>
    dialog!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(h.build).not.toHaveBeenCalled();
});

it("cancels domain confirmation when leaving the installer", async () => {
  await supabase();
  await click("Use custom domain");
  await click("Install");
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  await act(async () =>
    root.render(
      <ModalProvider>
        <div>Another page</div>
      </ModalProvider>,
    ),
  );
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(h.install).not.toHaveBeenCalled();
  expect(h.build).not.toHaveBeenCalled();
});

it("applies the confirmed port-only choice to an adopted draft without recreating it", async () => {
  await supabase({ cloud: false, draft: true });
  await click("Install");
  expect(h.updateService).not.toHaveBeenCalled();
  await click("Continue without domains");
  expect(h.install).not.toHaveBeenCalled();
  expect(h.updateService).toHaveBeenCalledWith(
    "draft",
    "kong",
    expect.objectContaining({
      exposed: false,
      publicEndpoints: [],
      domainType: "free",
      domain: null,
      customDomain: null,
      ports: ["0.0.0.0:8000:8000"],
    }),
  );
  expect(h.build).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ projectId: "draft" }));
});

it("offers an upgrade before Cloud installation, then refreshes after returning from billing", async () => {
  const capacity = {
    minResources: null,
    capacity: { cpuCores: 0, memoryMb: 0, source: "unknown" },
    fit: { ok: true },
    cloud: {
      resources: { cpuCores: 4, memoryMb: 8192, diskMb: 40960 },
      status: "upgrade",
      message: "This app needs 4 vCPU; the plan allows 2 vCPU.",
    },
  };
  h.hostFit.mockResolvedValueOnce({ data: capacity });
  await supabase();
  expect(container.textContent).toContain("This app needs 4 vCPU");
  const upgrade = [...container.querySelectorAll<HTMLAnchorElement>("a")].find((link) =>
    link.textContent?.includes("Upgrade plan"),
  );
  expect(upgrade?.getAttribute("href")).toBe("/billing/plans");
  expect(upgrade?.target).toBe("_blank");
  expect(h.install).not.toHaveBeenCalled();
  expect(h.build).not.toHaveBeenCalled();
  h.hostFit.mockResolvedValue({
    data: { ...capacity, cloud: { ...capacity.cloud, status: "ready" } },
  });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).not.toContain("This app needs 4 vCPU");
  expect(h.build).not.toHaveBeenCalled();
  await click("Install");
  expect(h.build).toHaveBeenCalledOnce();
});

it("shows a small host warning while still allowing an undersized self-hosted installation", async () => {
  const capacity = deferred<unknown>();
  h.hostFit.mockReturnValue(capacity.promise);
  await supabase({ cloud: false });
  await click("Select small server");
  expect(button("Install").disabled).toBe(false);
  await act(async () =>
    capacity.resolve({
      data: {
        minResources: { cpuCores: 4, memoryMb: 8192 },
        capacity: { cpuCores: 2, memoryMb: 4096, source: "docker" },
        fit: { ok: false, memory: { needed: 8192, available: 4096 } },
      },
    }),
  );
  expect(container.textContent).toContain("You can continue.");
  await click("Install");
  await click("Continue without domains");
  expect(h.build).toHaveBeenCalledOnce();
});

it.each(["install", "advanced"])(
  "checks the renamed instance instead of an unrelated draft: %s",
  async (action) => {
    h.cloud = true;
    h.appId = "supabase";
    h.query = "";
    h.template.mockResolvedValue({
      data: getAppTemplate("supabase")!,
      draft: { projectId: "existing-draft", slug: "supabase", name: "Supabase" },
    });
    h.services.mockResolvedValue({ services: [] });
    h.hostFit.mockImplementation(async (_id, options) => ({
      data: {
        minResources: null,
        capacity: { cpuCores: 0, memoryMb: 0, source: "unknown" },
        fit: { ok: true },
        cloud: {
          resources: { cpuCores: 4, memoryMb: 8192, diskMb: 40960 },
          status: options.projectId === "existing-draft" ? "upgrade" : "ready",
          message: "The existing draft exceeds this plan.",
        },
      },
    }));
    await render();
    expect(container.textContent).toContain("The existing draft exceeds this plan.");
    const name = container.querySelector<HTMLInputElement>("#app-name")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        name,
        "Supabase analytics",
      );
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("The existing draft exceeds this plan.");
    expect(h.hostFit).toHaveBeenLastCalledWith(
      "supabase",
      expect.objectContaining({ projectId: undefined }),
    );
    await click(
      action === "install" ? "Install" : baseDictionary.projectSettings.appInstall.advanced,
    );
    expect(h.install).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "Supabase analytics" }),
    );
    if (action === "install") {
      expect(h.build).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ projectId: "installed-app" }),
      );
    } else {
      expect(h.router.push).toHaveBeenCalledOnce();
      expect(h.build).not.toHaveBeenCalled();
    }
  },
);

it("uses the created draft's current plan check after cancelling DNS confirmation", async () => {
  h.hostFit.mockImplementation(async (_id, options) => ({
    data: {
      minResources: null,
      capacity: { cpuCores: 0, memoryMb: 0, source: "unknown" },
      fit: { ok: true },
      cloud: {
        resources: { cpuCores: 4, memoryMb: 8192, diskMb: 40960 },
        status: options.projectId === "installed-app" ? "upgrade" : "ready",
        message: "The saved allocation needs a larger plan.",
      },
    },
  }));
  await supabase();
  await click("Use custom domain");
  await click("Enter hostname");
  await click("Install");
  await click("Cancel DNS");
  expect(h.install).toHaveBeenCalledOnce();
  expect(h.build).not.toHaveBeenCalled();
  expect(h.hostFit).toHaveBeenLastCalledWith(
    "supabase",
    expect.objectContaining({ projectId: "installed-app" }),
  );
  expect(container.textContent).toContain("The saved allocation needs a larger plan.");
  expect(container.querySelector('a[href="/billing/plans"]')).not.toBeNull();
});

it.each([false, true])(
  "does not offer domainless installation when the endpoint requires a domain (draft: %s)",
  async (draft) => {
    const app = structuredClone(getAppTemplate("supabase")!);
    app.endpoints = app.endpoints!.map((endpoint) =>
      endpoint.kind === "http" ? { ...endpoint, allowedModes: ["domain"] } : endpoint,
    );
    await supabase({ template: app, draft });
    if (!draft) await click("Use custom domain");
    await click("Install");
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(h.toast).toHaveBeenCalledWith(
      baseDictionary.projectSettings.appInstall.customRequired,
      "error",
    );
    expect(h.install).not.toHaveBeenCalled();
    expect(h.updateService).not.toHaveBeenCalled();
    expect(h.build).not.toHaveBeenCalled();
  },
);

it("blocks repeat submission while DNS confirmation is open and cancels it on navigation", async () => {
  await supabase();
  await click("Use custom domain");
  await click("Enter hostname");
  const install = button("Install");
  await act(async () => install.click());
  expect(button("Deploy after DNS")).toBeDefined();
  expect(h.install).toHaveBeenCalledTimes(1);
  expect(h.build).not.toHaveBeenCalled();
  expect(install.disabled).toBe(true);
  await act(async () =>
    root.render(
      <ModalProvider>
        <div>Another page</div>
      </ModalProvider>,
    ),
  );
  expect(document.body.textContent).not.toContain("Deploy after DNS");
  expect(h.build).not.toHaveBeenCalled();
});

it("never converts an invalid nonempty hostname into a domainless install", async () => {
  await supabase();
  await click("Use custom domain");
  await click("Enter invalid hostname");
  await click("Install");
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(h.toast).toHaveBeenCalledWith(
    expect.stringContaining("isn't a valid domain name"),
    "error",
  );
  expect(h.install).not.toHaveBeenCalled();
  expect(h.build).not.toHaveBeenCalled();
});
