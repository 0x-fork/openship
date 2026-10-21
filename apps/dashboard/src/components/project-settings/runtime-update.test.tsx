// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { baseDictionary } from "@/i18n";
import { ApiError, setApiResourceScope } from "@/lib/api/client";
import { useRuntimeUpdate } from "@/hooks/useRuntimeUpdate";
import { RuntimeRedeployMenu } from "./RuntimeRedeployMenu";
import { RuntimeImageUpdateNotice } from "./RuntimeImageUpdateNotice";

const h = vi.hoisted(() => ({
  update: vi.fn(),
  check: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
  pricing: vi.fn(),
  resourceKey: "account-one",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/components/i18n-provider", () => ({ useI18n: () => ({ t: baseDictionary }) }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: h.toast }) }));
vi.mock("@/context/CloudResourceContext", () => ({ useCloudResourceKey: () => h.resourceKey }));
vi.mock("@/hooks/useCloudDeployPricing", () => ({ useCloudDeployPricing: () => h.pricing }));
vi.mock("@/lib/api/updates", () => ({
  updatesApi: { updateRuntime: h.update, checkRuntime: h.check },
}));

let root: Root;
let element: HTMLDivElement;
const c = baseDictionary.projectSettings.runtimeUpdates;
function Harness({
  projectId = "project-a",
  serviceId = "php",
  disabled = false,
  revision,
}: {
  projectId?: string;
  serviceId?: string;
  disabled?: boolean;
  revision?: string;
}) {
  const runtime = useRuntimeUpdate(projectId, serviceId, undefined, revision);
  return (
    <>
      <button disabled={disabled || runtime.updating} onClick={() => void runtime.update()}>
        Redeploy
      </button>
      <RuntimeRedeployMenu runtime={runtime} disabled={disabled} />
      <RuntimeImageUpdateNotice
        result={runtime.checkResult}
        busy={runtime.updating}
        onRefresh={runtime.update}
      />
    </>
  );
}
function button(label: string) {
  const match = [...element.querySelectorAll("button")].find(
    (item) => item.textContent === label || item.getAttribute("aria-label") === label,
  );
  expect(match, label).toBeDefined();
  return match!;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function menuAction(label: string) {
  await click(c.options);
  await click(label);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
const image = {
  serviceId: "php",
  serviceName: "php",
  role: "image",
  ref: "php:8.4-fpm",
  currentDigest: "sha256:old",
  latestDigest: "sha256:new",
  status: "update_available",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.resourceKey = "account-one";
  setApiResourceScope(`runtime-test-${Math.random()}`);
  h.update.mockResolvedValue({
    data: { deployment_id: "new-deployment", project_id: "project-a" },
  });
  h.check.mockResolvedValue({
    data: { checkedAt: new Date().toISOString(), images: [image] },
  });
  h.pricing.mockReturnValue(false);
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
});
afterEach(async () => {
  await act(async () => root.unmount());
  element.remove();
  vi.unstubAllGlobals();
});

it("refreshes exactly the selected service through the Redeploy menu", async () => {
  await act(async () => root.render(<Harness />));
  await menuAction(c.refresh);
  expect(h.update).toHaveBeenCalledExactlyOnceWith("project-a", { serviceIds: ["php"] });
  expect(h.push).toHaveBeenCalledExactlyOnceWith("/build/new-deployment");
});

it("routes an Actions-gated refresh to the project's existing Actions flow", async () => {
  h.update.mockResolvedValue({
    data: { awaiting_actions: true, action_request_id: "request-a", project_id: "project-a" },
  });
  await act(async () => root.render(<Harness />));
  await menuAction(c.refresh);
  expect(h.push).toHaveBeenCalledExactlyOnceWith("/projects/project-a/actions");
  expect(h.toast).not.toHaveBeenCalled();
});

it("deduplicates repeated refresh clicks while admission is pending", async () => {
  const pending = deferred<unknown>();
  h.update.mockReturnValue(pending.promise);
  await act(async () => root.render(<Harness />));
  await act(async () => {
    button("Redeploy").click();
    button("Redeploy").click();
  });
  expect(h.update).toHaveBeenCalledOnce();
  expect(button("Redeploy").disabled).toBe(true);
  expect(button(c.options).disabled).toBe(true);
  await act(async () =>
    pending.resolve({ data: { deployment_id: "new", project_id: "project-a" } }),
  );
});

it("keeps disabled lifecycle controls unavailable", async () => {
  await act(async () => root.render(<Harness disabled />));
  expect(button("Redeploy").disabled).toBe(true);
  expect(button(c.options).disabled).toBe(true);
  await click("Redeploy");
  expect(h.update).not.toHaveBeenCalled();
});

it("checks runtime digests in exactly the same service scope and offers one refresh notice", async () => {
  await act(async () => root.render(<Harness />));
  await menuAction(c.check);
  expect(h.check).toHaveBeenCalledExactlyOnceWith("project-a", { serviceIds: ["php"] });
  expect(element.textContent).toContain(c.available);
  expect(element.textContent).toContain("php:8.4-fpm");
  expect(element.textContent).toContain("sha256:old → sha256:new");
  expect(h.update).not.toHaveBeenCalled();
  await click(c.refresh);
  expect(h.update).toHaveBeenCalledExactlyOnceWith("project-a", { serviceIds: ["php"] });
});

it.each([
  { status: "unknown", currentDigest: null, expected: c.checkUnavailable },
  { status: "pinned", currentDigest: "sha256:fixed", expected: c.pinned },
  { status: "current", currentDigest: "sha256:new", expected: c.current },
])(
  "reports $status distinctly without claiming a runtime patch version",
  async ({ status, currentDigest, expected }) => {
    h.check.mockResolvedValue({
      data: {
        checkedAt: new Date().toISOString(),
        images: [{ ...image, status, currentDigest }],
      },
    });
    await act(async () => root.render(<Harness />));
    await menuAction(c.check);
    expect(h.toast).toHaveBeenCalledExactlyOnceWith(expected, "info");
    expect(element.textContent).not.toContain(c.available);
  },
);

it("keeps check failures retryable without triggering redeploy", async () => {
  h.check.mockRejectedValue(new ApiError(502, "Bad gateway", { error: "Registry unavailable" }));
  await act(async () => root.render(<Harness />));
  await menuAction(c.check);
  expect(h.toast).toHaveBeenCalledWith("Registry unavailable", "error");
  expect(button(c.options).disabled).toBe(false);
  expect(h.update).not.toHaveBeenCalled();
});

it("surfaces an API rejection and restores the refresh action", async () => {
  h.update.mockRejectedValue(new ApiError(409, "Conflict", { error: "Digest pins stay fixed" }));
  await act(async () => root.render(<Harness />));
  await menuAction(c.refresh);
  expect(h.toast).toHaveBeenCalledWith("Digest pins stay fixed", "error", c.title);
  expect(h.push).not.toHaveBeenCalled();
  expect(button(c.options).disabled).toBe(false);
});

it("does not navigate or show private results after changing account", async () => {
  const pending = deferred<unknown>();
  h.update.mockReturnValue(pending.promise);
  await act(async () => root.render(<Harness />));
  await menuAction(c.refresh);
  h.resourceKey = "account-two";
  setApiResourceScope("account-two");
  await act(async () => root.render(<Harness />));
  await act(async () =>
    pending.resolve({ data: { deployment_id: "old-account", project_id: "project-a" } }),
  );
  expect(h.push).not.toHaveBeenCalled();
  expect(h.toast).not.toHaveBeenCalled();
  expect(button(c.options).disabled).toBe(false);
});

it("discards a digest check completed after switching services", async () => {
  const pending = deferred<unknown>();
  h.check.mockReturnValue(pending.promise);
  await act(async () => root.render(<Harness />));
  await menuAction(c.check);
  await act(async () => root.render(<Harness serviceId="node" />));
  await act(async () =>
    pending.resolve({
      data: { checkedAt: new Date().toISOString(), images: [image] },
    }),
  );
  expect(element.textContent).not.toContain("php:8.4-fpm");
  expect(h.toast).not.toHaveBeenCalled();
});

it("does not use a saved billing retry after changing project", async () => {
  h.update.mockRejectedValue(new ApiError(402, "Payment required", { error: "Plan required" }));
  h.pricing.mockReturnValue(true);
  await act(async () => root.render(<Harness />));
  await menuAction(c.refresh);
  const retry = h.pricing.mock.calls[0][1] as () => Promise<void>;
  await act(async () => root.render(<Harness projectId="project-b" />));
  await act(async () => retry());
  expect(h.update).toHaveBeenCalledOnce();
  expect(h.toast).not.toHaveBeenCalled();
});

it("keeps a timed-out refresh recoverable without starting a second deployment", async () => {
  h.update.mockRejectedValue(new DOMException("Timed out", "AbortError"));
  await act(async () => root.render(<Harness />));
  await menuAction(c.refresh);
  expect(h.toast).toHaveBeenCalledWith(c.uncertain, "info");
  expect(h.push).toHaveBeenCalledWith("/projects/project-a/deployments");
  expect(h.update).toHaveBeenCalledOnce();
});

it("clears old image drift when the active deployment or configuration changes", async () => {
  await act(async () => root.render(<Harness revision="deployment-one" />));
  await menuAction(c.check);
  expect(element.textContent).toContain(c.available);
  await act(async () => root.render(<Harness revision="deployment-two" />));
  expect(element.textContent).not.toContain(c.available);
});
