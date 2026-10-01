import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  server: vi.fn(),
  workspaceServer: vi.fn(),
  workspace: vi.fn(),
  binding: vi.fn(),
  create: vi.fn(),
  issueToken: vi.fn(),
  ssh: vi.fn(),
}));
vi.mock("@repo/platform/engine/config/env", async (original) => ({
  ...(await original<any>()),
  env: { CLOUD_MODE: true, OBLIEN_API_URL: "https://provider.test" },
}));
vi.mock("@repo/db", () => ({
  repos: {
    server: { getInOrganization: h.server, findByWorkspace: h.workspaceServer },
    cloudWorkspace: { findByIdInOrganization: h.workspace },
    cloudDockerWorkspace: { find: h.binding },
  },
}));
vi.mock("@repo/platform/engine/lib/openship-cloud", () => ({ issueNamespaceToken: h.issueToken }));
vi.mock("@repo/platform/engine/lib/cloud-tenant-admin", () => ({
  createTenantCloudAdmin: () => ({}),
}));
vi.mock("@repo/platform/engine/modules/billing/billing-oblien-quota", () => ({
  assertCloudCanSpend: vi.fn(),
}));
vi.mock("@repo/platform/engine/lib/ssh-manager", () => ({ sshManager: { acquire: h.ssh } }));
vi.mock("@repo/platform/engine/lib/platform-config", () => ({
  platform: () => ({ target: "cloud", runtime: { name: "cloud" } }),
}));
vi.mock("@repo/adapters", async (original) => ({
  ...(await original<any>()),
  createPlatform: h.create,
}));

import {
  resolveDeploymentPlatform,
  resolveExecutionDestination,
  resolveServerExecutor,
} from "@repo/platform/engine/lib/deployment-runtime";
import { isLocalHostRow } from "@repo/platform/engine/lib/box-org";

const server = {
  id: "managed-server",
  workspaceId: "owner",
  organizationId: "org",
  isLocal: false,
  sshHost: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  h.server.mockResolvedValue(server);
  h.workspaceServer.mockResolvedValue(server);
  h.workspace.mockResolvedValue({
    id: "owner",
    organizationId: "org",
    runtime: "native",
    mode: "dedicated",
  });
  h.binding.mockResolvedValue({
    projectId: null,
    ownerWorkspaceId: "owner",
    workspaceId: "provider-vm",
    namespace: "tenant",
  });
  h.issueToken.mockResolvedValue({ token: "test-token", namespace: "tenant" });
  h.create.mockImplementation(async (config) => ({
    target: "cloud",
    runtime: { name: config.cloudDocker ? "docker" : "cloud" },
    routing: {},
    executor: null,
  }));
});

describe("managed server execution destinations", () => {
  it("resolves a dedicated native server through the existing Cloud adapter exactly once", async () => {
    const resolved = await resolveDeploymentPlatform(
      { serverId: server.id },
      { organizationId: "org" },
    );
    expect(resolved).toMatchObject({
      serverId: server.id,
      effectiveTarget: "cloud",
      platform: { runtime: { name: "cloud" } },
    });
    expect(h.server).toHaveBeenCalledExactlyOnceWith(server.id, "org");
    expect(h.issueToken).toHaveBeenCalledExactlyOnceWith("org", "owner");
    expect(h.create.mock.calls[0][0].cloudDocker).toBeUndefined();
    expect(h.ssh).not.toHaveBeenCalled();
  });
  it("resolves shared Docker through the same destination and existing Docker adapter", async () => {
    h.workspace.mockResolvedValue({
      id: "owner",
      organizationId: "org",
      runtime: "docker",
      mode: "shared",
    });
    const resolved = await resolveDeploymentPlatform(
      {
        serverId: server.id,
        runtimeMode: "docker",
        cloudDockerWorkspace: {
          projectId: "project",
          workspaceId: "provider-vm",
          ownerWorkspaceId: "owner",
        },
      },
      { organizationId: "org" },
    );
    expect(resolved).toMatchObject({
      serverId: server.id,
      effectiveTarget: "cloud",
      platform: { runtime: { name: "docker" } },
    });
    expect(h.create.mock.calls[0][0].cloudDocker).toMatchObject({
      projectId: "project",
      ownerWorkspaceId: "owner",
      workspaceId: "provider-vm",
    });
    expect(h.server).toHaveBeenCalledTimes(1);
    expect(h.ssh).not.toHaveBeenCalled();
  });
  it("rejects another organization before requesting provider credentials", async () => {
    h.server.mockResolvedValue(undefined);
    await expect(
      resolveDeploymentPlatform({ serverId: server.id }, { organizationId: "foreign" }),
    ).rejects.toMatchObject({ code: "SERVER_TARGET_UNAVAILABLE" });
    expect(h.issueToken).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });
  it.each([
    { managedWorkspaceId: "different-owner" },
    { deployTarget: "local" },
    { clusterId: "cluster" },
    {
      cloudDockerWorkspace: {
        projectId: "project",
        workspaceId: "provider-vm",
        ownerWorkspaceId: "different-owner",
      },
    },
  ])("rejects conflicting ownership or placement: %j", async (conflict) => {
    await expect(
      resolveDeploymentPlatform({ serverId: server.id, ...conflict } as any, {
        organizationId: "org",
      }),
    ).rejects.toMatchObject({ code: "CLOUD_WORKSPACE_TARGET_CONFLICT" });
    expect(h.issueToken).not.toHaveBeenCalled();
    expect(h.ssh).not.toHaveBeenCalled();
  });
  it("cannot use a managed server as an SSH or control-plane-local host", async () => {
    await expect(resolveServerExecutor(server.id, "org")).rejects.toMatchObject({
      code: "MANAGED_SERVER_CONTEXT_REQUIRED",
    });
    expect(await isLocalHostRow({ ...server, isLocal: true, sshHost: "127.0.0.1" })).toBe(false);
    expect(h.ssh).not.toHaveBeenCalled();
  });
  it("restores a historical owner snapshot to the workspace's stable server identity", async () => {
    const destination = await resolveExecutionDestination(
      { managedWorkspaceId: "owner", deployTarget: "cloud" },
      "org",
    );
    expect(destination.snapshot).toMatchObject({
      serverId: server.id,
      managedWorkspaceId: "owner",
      deployTarget: "cloud",
    });
    expect(h.workspaceServer).toHaveBeenCalledExactlyOnceWith("owner", "org");
  });
  it("keeps the existing direct Cloud destination available without a shared Docker binding", async () => {
    const resolved = await resolveDeploymentPlatform(
      { deployTarget: "cloud", workspaceId: "dedicated-vm" },
      { organizationId: "org" },
    );
    expect(resolved.platform.runtime.name).toBe("cloud");
    expect(h.issueToken).toHaveBeenCalledExactlyOnceWith("org", null);
    expect(h.server).not.toHaveBeenCalled();
    expect(h.ssh).not.toHaveBeenCalled();
  });
});
