// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPublicEndpoint, type DeployTarget } from "@/context/deployment/types";
import DomainSettings from "./DomainSettings";

const mocks = vi.hoisted(() => ({ selfHosted: true, picker: vi.fn() }));
vi.mock("@/context/PlatformContext", () => ({
  usePlatform: () => ({ selfHosted: mocks.selfHosted }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ projectsApi: { update: vi.fn() }, getApiErrorMessage: vi.fn() }));
vi.mock("@/components/routing/RoutingModePicker", () => ({
  RoutingModePicker: (props: unknown) => {
    mocks.picker(props);
    return null;
  },
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.picker.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it.each([
  [true, "local", true],
  [true, "server", true],
  [true, "cloud", false],
  [false, "cloud", false],
] as const)(
  "redirect capability follows the destination (selfHosted=%s, target=%s)",
  async (selfHosted, deployTarget, allowed) => {
    mocks.selfHosted = selfHosted;
    await act(async () =>
      root.render(
        <DomainSettings
          deployTarget={deployTarget as DeployTarget}
          projectName="site"
          endpoints={[
            createPublicEndpoint({
              domainType: "custom",
              customDomain: "example.com",
              targetPath: "/",
            }),
          ]}
          hasServer={false}
          runtimePort=""
          setEndpoints={() => {}}
          noPublicRoute={false}
          setNoPublicRoute={() => {}}
        />,
      ),
    );
    expect(mocks.picker).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowRedirects: allowed }),
    );
  },
);
