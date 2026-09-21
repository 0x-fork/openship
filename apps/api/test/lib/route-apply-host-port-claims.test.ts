import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, HOST_PORT_QUARANTINE_OWNER, repos, schema, type HostPortClaim } from "@repo/db";
import type { Platform } from "@repo/adapters";
import type { HostPortTargetIdentity } from "@repo/platform/engine/lib/host-port-target";
import { reconcileProjectRoutes } from "@repo/platform/engine/lib/route-apply.service";
import { reserveTargetPinnedHostPort } from "@repo/platform/engine/modules/deployments/pinned-host-ports";

// Real claim repository, target lock, inventory and route reconciliation. Only
// edge I/O is controlled; Vitest gives @repo/db an isolated in-memory PGlite.
const localTarget: HostPortTargetIdentity = {
  targetKey: "local",
  legacyTargetKeys: [],
  stable: true,
};
const remoteTarget: HostPortTargetIdentity = {
  targetKey: `host:${"a".repeat(64)}`,
  legacyTargetKeys: ["server:srv_1"],
  stable: true,
};
const project = {
  id: "proj_1",
  slug: "app",
  organizationId: "org_1",
  cloudWorkspaceId: null,
  activeDeploymentId: "dep_1",
};
const owner = { projectId: project.id, serviceId: "svc_api", containerPort: 3000, port: 23000 };

function routeOptions(hostPortTarget = localTarget) {
  const registerRoute = vi.fn(async () => {});
  const removeRoute = vi.fn(async () => {});
  return {
    hostPortTarget,
    routing: { registerRoute, removeRoute } as unknown as Platform["routing"],
    registerRoute,
    removeRoute,
    // The second port belongs to an unknown vhost and must stay quarantined.
    edgeProxy: { listLoopbackUpstreamPortsStrict: async () => new Set([23000, 24000]) },
    registers: [
      {
        hostname: "app.example.com",
        isCustomDomain: true,
        targetUrl: "http://127.0.0.1:23000",
        observedLoopbackPublishes: [
          { serviceId: owner.serviceId, containerPort: owner.containerPort, hostPort: owner.port },
        ],
      },
    ],
  };
}

describe("live route host-port recovery (#915)", () => {
  beforeEach(async () => {
    await db.delete(schema.hostPortClaim);
  });

  describe.each([
    ["local", localTarget],
    ["remote", remoteTarget],
  ] as const)("%s target", (_name, target) => {
    it("atomically recovers an existing quarantine and keeps repeated retries idempotent", async () => {
      const quarantined = await repos.hostPortClaim.reserveQuarantinedHostPortClaim({
        targetKey: target.targetKey,
        port: owner.port,
      });
      // New allocations have no live ownership proof and must still fail.
      await expect(reserveTargetPinnedHostPort(target, owner)).rejects.toThrow("already reserved");
      const options = routeOptions(target);
      const claimsAtRegistration: HostPortClaim[][] = [];
      options.registerRoute.mockImplementation(async () => {
        claimsAtRegistration.push(await repos.hostPortClaim.listHostPortClaims(target.targetKey));
      });

      await reconcileProjectRoutes(project, options);
      await reconcileProjectRoutes(project, options);

      expect(options.registerRoute).toHaveBeenCalledTimes(2);
      for (const claims of claimsAtRegistration) {
        expect(claims).toContainEqual(expect.objectContaining({ ...owner, id: quarantined.id }));
      }
      expect(await repos.hostPortClaim.listHostPortClaims(target.targetKey)).toEqual([
        expect.objectContaining({ ...owner, id: quarantined.id }),
        expect.objectContaining({ port: 24000, projectId: HOST_PORT_QUARANTINE_OWNER }),
      ]);
    });

    it("recovers a live upstream quarantined by the same retry's inventory", async () => {
      const options = routeOptions(target);

      await reconcileProjectRoutes(project, options);

      expect(options.registerRoute).toHaveBeenCalledOnce();
      expect(await repos.hostPortClaim.listHostPortClaims(target.targetKey)).toEqual([
        expect.objectContaining(owner),
        expect.objectContaining({ port: 24000, projectId: HOST_PORT_QUARANTINE_OWNER }),
      ]);
    });
  });

  it.each([
    { projectId: "another_project" },
    { serviceId: "another_service" },
    { containerPort: 4000 },
  ])("preserves a conflicting workload %j before any edge mutation", async (otherOwner) => {
    const existing = await repos.hostPortClaim.reserveHostPortClaim({
      targetKey: localTarget.targetKey,
      ...owner,
      ...otherOwner,
    });
    const options = routeOptions();

    await expect(
      reconcileProjectRoutes(project, {
        ...options,
        removes: [{ hostname: "old.example.com", isCustomDomain: true }],
      }),
    ).rejects.toThrow("already reserved");

    expect(options.registerRoute).not.toHaveBeenCalled();
    expect(options.removeRoute).not.toHaveBeenCalled();
    expect(await repos.hostPortClaim.listHostPortClaims(localTarget.targetKey)).toContainEqual(
      existing,
    );
  });

  it("still refines a matching legacy scalar claim without replacing its identity", async () => {
    const existing = await repos.hostPortClaim.reserveHostPortClaim({
      targetKey: localTarget.targetKey,
      ...owner,
      containerPort: null,
    });
    const options = routeOptions();

    await reconcileProjectRoutes(project, options);

    expect(options.registerRoute).toHaveBeenCalledOnce();
    expect(await repos.hostPortClaim.listHostPortClaims(localTarget.targetKey)).toContainEqual(
      expect.objectContaining({ ...owner, id: existing.id }),
    );
  });

  it("leaves the same port on another physical host untouched", async () => {
    const otherHost = await repos.hostPortClaim.reserveHostPortClaim({
      targetKey: remoteTarget.targetKey,
      ...owner,
      projectId: "another_project",
    });

    await reconcileProjectRoutes(project, routeOptions(localTarget));

    expect(await repos.hostPortClaim.listHostPortClaims(remoteTarget.targetKey)).toEqual([
      otherHost,
    ]);
    expect(await repos.hostPortClaim.listHostPortClaims(localTarget.targetKey)).toContainEqual(
      expect.objectContaining(owner),
    );
  });
});
