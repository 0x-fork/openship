// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getAppTemplate, type AppTemplate } from "@repo/core";
import { baseDictionary } from "@/i18n";
import AppInstallPage from "./page";

const h = vi.hoisted(() => ({
  template: vi.fn(),
  services: vi.fn(),
  info: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("@/lib/api", () => ({
  appsApi: { template: h.template },
  servicesApi: { list: h.services },
  projectsApi: { getInfo: h.info },
  deployApi: {},
}));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  useParams: () => ({ appId: "convex" }),
  useSearchParams: () => new URLSearchParams("projectId=draft"),
}));
vi.mock("@/components/i18n-provider", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/i18n-provider")>(),
  useI18n: () => ({ t: baseDictionary, locale: "en" }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/context/PlatformContext", () => ({
  usePlatform: () => ({ baseDomain: "example.test", deployMode: "docker", selfHosted: true }),
}));
vi.mock("@/context/CloudContext", () => ({
  useCloud: () => ({ connected: false, loading: false, requireCloud: vi.fn() }),
}));
vi.mock("@/context/ModalContext", () => ({
  useModal: () => ({ showModal: vi.fn(), hideModal: vi.fn() }),
}));
vi.mock("@/hooks/useSSEConnection", () => ({
  useBuildStream: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
}));
vi.mock("@/hooks/useCloudDeployPricing", () => ({ useCloudDeployPricing: () => vi.fn() }));
vi.mock("@/hooks/useLocalDeployGate", () => ({ useLocalDeployGate: () => ({ blocks: () => false }) }));
vi.mock("@/components/deploy/AppDestinationPicker", () => ({ AppDestinationPicker: () => null }));
vi.mock("@/components/routing/RoutingSettingsCard", () => ({ RoutingSettingsCard: () => null }));
vi.mock("@/components/deploy/CleanDeployProgress", () => ({
  CleanDeployProgressCard: () => null,
  firstPublicHost: () => null,
}));
vi.mock("@/components/domains/DnsRecordsModal", () => ({ default: () => null }));
vi.mock("@/components/LocalDeployComingSoonModal", () => ({ LocalDeployComingSoonModal: () => null }));

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
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.template.mockReset();
  h.services.mockReset();
  h.info.mockResolvedValue({ data: { project: { slug: "saved-convex" } } });
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

it("restores saved routes when a catalog refresh interrupts the draft read", async () => {
  const catalog = deferred<{ data: AppTemplate }>();
  const services = deferred<typeof saved>();
  h.template.mockReturnValue(catalog.promise);
  h.services.mockReturnValue(services.promise);
  await act(async () => root.render(<AppInstallPage />));
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
  await act(async () => root.render(<AppInstallPage />));
  expect(choices()[0]).toBe("Port only (no domain)");

  await act(async () => controls()[0].click());
  await act(async () => document.querySelector<HTMLButtonElement>('[role="option"]')!.click());
  expect(choices()[0]).toBe("Domain");

  await act(async () => catalog.resolve({ data: structuredClone(template) }));
  expect(choices()).toEqual(["Domain", "Port only (no domain)", "Port only (no domain)"]);
  expect(h.services).toHaveBeenCalledTimes(1);
});
