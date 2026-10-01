// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { baseDictionary } from "@/i18n";
import { AddServiceModal } from "./AddServiceModal";

const h = vi.hoisted(() => ({
  mode: "cloud",
  list: vi.fn(),
  images: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("@/context/PlatformContext", () => ({ usePlatform: () => ({ deployMode: h.mode }) }));
vi.mock("@/context/CloudContext", () => ({ useCloud: () => ({ connected: true }) }));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { session: { activeOrganizationId: "org-a" } } }),
}));
vi.mock("@/lib/api/cloud-workspaces", () => ({ cloudWorkspacesApi: { list: h.list } }));
vi.mock("@/lib/api/images", () => ({ imagesApi: { list: h.images } }));
vi.mock("@/components/ui/Modal", () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) =>
    isOpen ? children : null,
}));
vi.mock("../UseInProjectModal", () => ({ ProjectConnectionForm: () => null }));
vi.mock("@/components/import-project/EnvironmentVariables", () => ({ default: () => null }));
vi.mock("@/components/routing/RoutingSettingsCard", () => ({ RoutingSettingsCard: () => null }));

const workspace = { id: "workspace-a", runtime: "docker" };
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.mode = "cloud";
  h.list.mockResolvedValue({ workspaces: [workspace], dedicatedBilling: false });
  h.images.mockResolvedValue({
    images: [{ id: "provider-db", name: "Provider database", image: "oblien/postgres" }],
    cloudConnected: true,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = (workspaceId?: string) =>
  act(async () =>
    root.render(
      <I18nProvider>
        <AddServiceModal
          open
          projectName="Example"
          workspaceId={workspaceId}
          onClose={() => {}}
          onSubmit={h.submit}
        />
      </I18nProvider>,
    ),
  );

it("waits for workspace placement, then submits an upstream Docker image and its persistent volume", async () => {
  let resolve!: (value: { workspaces: (typeof workspace)[] }) => void;
  h.list.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render(workspace.id);
  expect(host.querySelector("[aria-busy=true]")).not.toBeNull();
  expect(h.images).not.toHaveBeenCalled();
  await act(async () => resolve({ workspaces: [workspace] }));
  const redis = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.includes("redis:7-alpine"),
  );
  expect(redis).toBeDefined();
  await act(async () => redis!.click());
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(h.submit).toHaveBeenCalledWith(
    expect.objectContaining({ image: "redis:7-alpine", volumes: ["redis_data:/data"] }),
  );
  expect(h.images).not.toHaveBeenCalled();
});

it("keeps the existing native Cloud catalog for project-owned deployments", async () => {
  await render();
  expect(h.list).not.toHaveBeenCalled();
  expect(h.images).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Provider database");
});

it("keeps self-hosted projects on the upstream Docker catalog", async () => {
  h.mode = "local";
  await render();
  expect(host.textContent).toContain("redis:7-alpine");
  expect(h.list).not.toHaveBeenCalled();
  expect(h.images).not.toHaveBeenCalled();
});

it("explains the single-application restriction for dedicated native workspaces", async () => {
  h.list.mockResolvedValue({
    workspaces: [{ ...workspace, runtime: "native" }],
    dedicatedBilling: false,
  });
  await render(workspace.id);
  expect(host.textContent).toContain(baseDictionary.billing.workspaces.nativeHint);
  expect(h.images).not.toHaveBeenCalled();
  expect(h.submit).not.toHaveBeenCalled();
});

it("allows retry after a placement lookup failure without falling back to the wrong catalog", async () => {
  h.list.mockRejectedValueOnce(new Error("Workspace lookup failed"));
  await render(workspace.id);
  expect(host.querySelector("[role=alert]")?.textContent).toContain("Workspace lookup failed");
  expect(h.images).not.toHaveBeenCalled();
  const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === baseDictionary.billing.plansRoute.tryAgain,
  );
  await act(async () => retry!.click());
  expect(host.textContent).toContain("redis:7-alpine");
  expect(h.images).not.toHaveBeenCalled();
});
