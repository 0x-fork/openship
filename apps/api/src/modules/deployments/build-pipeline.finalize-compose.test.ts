import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deployment, Project } from "@repo/db";
import type { BuildLogger } from "@repo/adapters";

const findById = vi.fn();
const listByDeployment = vi.fn();
const onDeploymentReady = vi.fn();
const rollupDeploymentStatus = vi.fn();
const setDeploymentStatus = vi.fn();
const destroyPrevious = vi.fn();

vi.mock("@repo/platform/engine/lib/deployment-runtime", async (original) => ({
  ...(await original<typeof import("@repo/platform/engine/lib/deployment-runtime")>()),
  withDeploymentRuntime: (_dep: unknown, work: (runtime: unknown) => Promise<unknown>) =>
    work({ destroy: destroyPrevious }),
}));

vi.mock("@repo/db", () => ({
  repos: {
    deployment: { findById: (...args: unknown[]) => findById(...args) },
    serviceDeployment: {
      listByDeployment: (...args: unknown[]) => listByDeployment(...args),
    },
  },
}));

vi.mock("../../lib/controller-helpers", () => ({ platform: vi.fn() }));

vi.mock("@repo/platform/engine/lib/openship-manifest-sync", () => ({
  syncProjectToServerManifest: vi.fn(),
}));

vi.mock("@repo/platform/engine/modules/github/clone-auth", () => ({ resolveBuildGitToken: vi.fn() }));

vi.mock("@repo/platform/engine/lib/git-forwarding/index", () => ({ openDeployRelay: vi.fn() }));

vi.mock("@repo/platform/engine/modules/deployments/service-checks", () => ({
  preCreateServiceDeployments: vi.fn(),
  emitServiceCheckRun: vi.fn().mockResolvedValue(undefined),
  emitInitialServiceChecks: vi.fn(),
  rollupDeploymentStatus: (...args: unknown[]) => rollupDeploymentStatus(...args),
}));

vi.mock("@repo/platform/engine/modules/deployments/deployment-lifecycle", () => ({
  onFailure: vi.fn(),
  onSuccess: vi.fn(),
  onCancelled: vi.fn(),
  setDeploymentStatus: (...args: unknown[]) => setDeploymentStatus(...args),
}));

vi.mock("@repo/platform/engine/modules/deployments/rollback/index", () => ({
  onDeploymentReady: (...args: unknown[]) => onDeploymentReady(...args),
}));

import { finalizeComposeDeploy } from "@repo/platform/engine/modules/deployments/build-pipeline";

const asDeployment = (deployment: Partial<Deployment>) => ({ organizationId: "org-1", ...deployment }) as Deployment;
const asProject = (project: Partial<Project>) => project as Project;
const logger = { log: vi.fn() } as unknown as BuildLogger;
const previousDeploymentId = "previous-deployment";
const project = asProject({ id: "project-1", organizationId: "org-1", activeDeploymentId: previousDeploymentId });

function deploymentWithStatus(status: Deployment["status"]): Deployment {
  return asDeployment({
    id: "new-deployment",
    projectId: project.id,
    rollbackStrategy: "snapshot",
    status,
  });
}

describe("finalizeComposeDeploy", () => {
  beforeEach(() => {
    findById.mockReset();
    listByDeployment.mockReset();
    onDeploymentReady.mockReset();
    rollupDeploymentStatus.mockReset();
    setDeploymentStatus.mockReset();
    destroyPrevious.mockReset();
    destroyPrevious.mockResolvedValue(undefined);
    listByDeployment.mockResolvedValue([]);
    rollupDeploymentStatus.mockReturnValue("ready");
    setDeploymentStatus.mockResolvedValue(undefined);
  });

  it.each(["failed", "cancelled", "reconciling"] as const)(
    "does not retire the prior release when the compose deployment is %s",
    async (status) => {
      const deployment = deploymentWithStatus(status);
      findById.mockResolvedValue(deployment);

      await finalizeComposeDeploy({ project, dep: deployment, logger });

      expect(onDeploymentReady).not.toHaveBeenCalled();
    },
  );

  it("does not retire the prior release when compose rollup records a failure", async () => {
    let deployment = deploymentWithStatus("ready");
    findById.mockResolvedValue(deployment);
    rollupDeploymentStatus.mockReturnValue("failed");
    setDeploymentStatus.mockImplementation(async (_id, status) => {
      deployment = { ...deployment, status };
      findById.mockResolvedValue(deployment);
    });

    await finalizeComposeDeploy({ project, dep: deployment, logger });

    expect(onDeploymentReady).not.toHaveBeenCalled();
  });

  it("retires the prior release when the compose deployment is ready", async () => {
    const deployment = deploymentWithStatus("ready");
    const previous = asDeployment({ id: previousDeploymentId, projectId: project.id });
    findById.mockImplementation(async (id: string) => (id === previous.id ? previous : deployment));

    await finalizeComposeDeploy({ project, dep: deployment, logger });

    expect(onDeploymentReady).toHaveBeenCalledWith({
      newDeployment: deployment,
      previousActive: previous,
    });
  });

  it("retires the prior release when the compose deployment partially failed", async () => {
    const deployment = deploymentWithStatus("partial_failure");
    const previous = asDeployment({ id: previousDeploymentId, projectId: project.id });
    findById.mockImplementation(async (id: string) => (id === previous.id ? previous : deployment));

    await finalizeComposeDeploy({ project, dep: deployment, logger });

    expect(onDeploymentReady).toHaveBeenCalledWith({
      newDeployment: deployment,
      previousActive: previous,
    });
  });

  it.each(["ready", "partial_failure"] as const)(
    "surfaces role retirement failures on a %s deployment without turning them into routing failures",
    async (status) => {
      const deployment = {
        ...deploymentWithStatus(status),
        meta:
          status === "partial_failure"
            ? {
                composeDeployment: {
                  decision: "pending",
                  warningMessage: "Database service failed.",
                },
              }
            : null,
      } as Deployment;
      const previous = asDeployment({
        id: previousDeploymentId,
        projectId: project.id,
        roleContainers: [{ role: "queue", replica: 1, containerId: "old-worker-id-12345" }],
      });
      findById.mockImplementation(async (id: string) => (id === previous.id ? previous : deployment));
      destroyPrevious.mockRejectedValue(new Error("daemon refused removal"));

      await finalizeComposeDeploy({ project, dep: deployment, logger });

      expect(setDeploymentStatus).toHaveBeenCalledWith(deployment.id, status, {
        sse: {
          status: "ready",
          meta: {
            warningMessage: expect.stringContaining("queue replica 1 (old-worker-i)"),
            decisionPending: status === "partial_failure",
          },
        },
      });
      const warning = setDeploymentStatus.mock.calls.at(-1)![2].sse.meta.warningMessage;
      if (status === "partial_failure") expect(warning).toContain("Database service failed.");
      expect(onDeploymentReady).toHaveBeenCalled();
    },
  );
});

// The application seams moved with the shared engine.
vi.mock("@repo/platform/engine/lib/platform-config", () => ({ platform: vi.fn() }));

vi.mock("@repo/platform/engine/lib/resource-access", () => ({ platform: vi.fn() }));
