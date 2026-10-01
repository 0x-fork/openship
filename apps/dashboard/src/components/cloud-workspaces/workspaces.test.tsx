// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { baseDictionary } from "@/i18n";
import { PlatformProvider } from "@/context/PlatformContext";
import { ApiError } from "@/lib/api/client";
import {
  BillingLink,
  BillingWorkspaceProvider,
  workspaceBillingHref,
} from "@/components/billing/BillingWorkspaceContext";
import { WorkspacePicker } from "./WorkspacePicker";
import { WorkspaceDetail } from "./WorkspaceDetail";
import { WorkspaceUsage } from "./WorkspaceUsage";

const h = vi.hoisted(() => ({
  organizationId: "org-a",
  list: vi.fn(),
  get: vi.fn(),
  usage: vi.fn(),
  ensure: vi.fn(),
  previewResize: vi.fn(),
  resize: vi.fn(),
  retry: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { session: { activeOrganizationId: h.organizationId } } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace, push: h.push }) }));
vi.mock("@/lib/api/cloud-workspaces", () => ({ cloudWorkspacesApi: h }));

const copy = baseDictionary.billing.workspaces;
const row = {
  id: "cws-a",
  name: "Production",
  mode: "shared",
  runtime: "docker",
  planTierId: "hobby",
  subscriptionStatus: "active",
  projectCount: 2,
  state: "running",
  operation: null,
  resources: { cpuCores: 1, memoryMb: 4096, diskMb: 25600 },
  createdAt: "2026-10-01T00:00:00Z",
};
const usage = {
  measuredAt: "2026-10-01T00:00:00Z",
  available: true,
  reason: null,
  cpuPercent: 23,
  memoryUsedMb: 512,
  memoryAvailableMb: 3584,
  diskUsedMb: 2048,
  diskAvailableMb: 23552,
  diskTotalMb: 25600,
  sharedDiskMb: 1024,
  projects: [{ id: "p-a", name: "API", diskMb: 1024 }],
};
let root: Root;
let host: HTMLDivElement;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const render = async (children: ReactNode) => {
  await act(async () =>
    root.render(
      <I18nProvider>
        <PlatformProvider selfHosted={false}>{children}</PlatformProvider>
      </I18nProvider>,
    ),
  );
};
const button = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === label || button.getAttribute("aria-label") === label,
  )!;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.organizationId = "org-a";
  h.list.mockResolvedValue({ workspaces: [row], dedicatedBilling: false });
  h.get.mockResolvedValue(row);
  h.usage.mockResolvedValue(usage);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("selects the only available workspace and presents a summary without a redundant choice", async () => {
  const change = vi.fn();
  await render(<WorkspacePicker onChange={change} />);
  expect(change).toHaveBeenCalledExactlyOnceWith("cws-a");
  expect(host.querySelector('[role="combobox"]')).toBeNull();
  expect(host.textContent).toContain("Production");
});
it("explains first workspace setup without making a purchase or creating a host on render", async () => {
  h.list.mockResolvedValue({ workspaces: [], dedicatedBilling: false });
  const change = vi.fn();
  await render(<WorkspacePicker onChange={change} />);
  expect(host.textContent).toContain(copy.defaultHint);
  expect(change).not.toHaveBeenCalled();
  expect(h.ensure).not.toHaveBeenCalled();
});
it("does not auto-select a native workspace for a multi-service app", async () => {
  h.list.mockResolvedValue({
    workspaces: [{ ...row, mode: "dedicated", runtime: "native", projectCount: 0 }],
    dedicatedBilling: false,
  });
  const change = vi.fn();
  await render(<WorkspacePicker dockerOnly onChange={change} />);
  expect(host.textContent).toContain(copy.noneAvailable);
  expect(change).not.toHaveBeenCalled();
});
it("ignores a workspace-list response from the previous organization", async () => {
  const old = deferred<unknown>();
  h.list.mockReturnValueOnce(old.promise);
  const change = vi.fn();
  await render(<WorkspacePicker onChange={change} />);
  h.organizationId = "org-b";
  h.list.mockResolvedValue({
    workspaces: [{ ...row, id: "cws-b", name: "Other team" }],
    dedicatedBilling: false,
  });
  await render(<WorkspacePicker onChange={change} />);
  await act(async () =>
    old.resolve({ workspaces: [{ ...row, name: "Previous team" }], dedicatedBilling: false }),
  );
  expect(host.textContent).toContain("Other team");
  expect(host.textContent).not.toContain("Previous team");
  expect(change).toHaveBeenCalledExactlyOnceWith("cws-b");
});
it("resumes a stopped workspace once and polls its saved operation", async () => {
  h.get.mockResolvedValue({ ...row, state: "stopped" });
  const pending = deferred<unknown>();
  h.ensure.mockReturnValue(pending.promise);
  await render(<WorkspaceDetail id={row.id} />);
  await act(async () => {
    button(copy.resume).click();
    button(copy.resume).click();
  });
  expect(h.ensure).toHaveBeenCalledExactlyOnceWith(row.id);
  expect(button(copy.resume).disabled).toBe(true);
  const queued = {
    ...row,
    state: "queued",
    operation: {
      id: "op",
      kind: "ensure",
      status: "queued",
      logs: ["Resuming workspace"],
      nextAttemptAt: null,
      error: null,
    },
  };
  h.get.mockResolvedValue(queued);
  await act(async () => pending.resolve(queued));
  expect(host.textContent).toContain("Resuming workspace");
  h.get.mockResolvedValue(row);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(host.textContent).toContain(copy.states.running);
});
it("keeps the reviewed resize and request key after an uncertain response", async () => {
  const preview = {
    revision: "a".repeat(64),
    before: row.resources,
    after: { cpuCores: 2, memoryMb: 8192, diskMb: 32768 },
    restartProjects: [{ id: "p-a", name: "API" }],
  };
  h.previewResize.mockResolvedValue(preview);
  h.resize.mockRejectedValueOnce(
    new ApiError(504, "Gateway Timeout", { error: "Request timed out" }),
  );
  await render(<WorkspaceDetail id={row.id} />);
  await act(async () => button(copy.resize).click());
  expect(host.textContent).toContain("API");
  expect(h.resize).not.toHaveBeenCalled();
  await act(async () => button(copy.confirmResize).click());
  const request = h.resize.mock.calls[0]![1];
  expect(request).toMatchObject({ revision: preview.revision, confirmRestart: true });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Request timed out");
  h.resize.mockResolvedValue({ ...row, state: "queued" });
  await act(async () => button(copy.confirmResize).click());
  expect(h.resize.mock.calls[1]).toEqual([row.id, request]);
});
it("does not keep displaying old usage after a failed refresh", async () => {
  await render(<WorkspaceUsage workspaceId={row.id} resources={row.resources} showProjects />);
  expect(host.textContent).toContain("API");
  h.usage.mockRejectedValue(
    new ApiError(503, "Service Unavailable", { error: "Workspace unreachable" }),
  );
  await act(async () => button(baseDictionary.billing.resourceOverview.refresh).click());
  expect(host.textContent).not.toContain("API");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Workspace unreachable");
});
it("keeps billing links scoped without duplicate query parameters or broken fragments", async () => {
  expect(workspaceBillingHref("/billing/usage?workspaceId=old&groupBy=day#chart", "new")).toBe(
    "/billing/usage?workspaceId=new&groupBy=day#chart",
  );
  await render(
    <BillingWorkspaceProvider workspaceId="cws-b">
      <BillingLink href="/billing/plans">Plans</BillingLink>
    </BillingWorkspaceProvider>,
  );
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/billing/plans?workspaceId=cws-b");
});
