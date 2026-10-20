import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@repo/platform";
const state = vi.hoisted(() => ({
  project: {
    id: "proj",
    organizationId: "org",
    workspaceId: null,
    clusterId: null,
    serverId: null,
    deletionInProgress: false,
  } as Record<string, unknown>,
  row: null as Record<string, unknown> | null,
  domain: { id: "domain", projectId: "proj", domainType: "custom", externalIngress: false },
  target: "local",
  active: true,
  cloud: false,
  save: vi.fn(),
  markApplied: vi.fn(),
  setProtection: vi.fn(),
  register: vi.fn(),
  dispose: vi.fn(),
  hostAdmission: vi.fn(),
}));
vi.mock("@repo/db", () => ({
  repos: {
    project: { findById: async () => state.project },
    domain: { findByHostname: async () => state.domain },
    server: { getInOrganization: async () => null },
    routeProtection: {
      list: async () => (state.row ? [state.row] : []),
      readPrivate: async () => state.row,
      save: state.save,
      markApplied: state.markApplied,
    },
  },
}));
vi.mock("@repo/platform/engine/config", () => ({
  env: {
    get CLOUD_MODE() {
      return state.cloud;
    },
  },
}));
vi.mock("@repo/platform/engine/lib/project-runtime-lock", () => ({
  withProjectRuntimeLock: async (_: string, fn: () => unknown) => fn(),
}));
vi.mock("@repo/platform/engine/lib/active-deployment", () => ({
  findActiveDeployment: async () => (state.active ? { meta: {} } : null),
}));
vi.mock("@repo/platform/engine/lib/deployment-runtime", () => ({
  resolveDeploymentPlatform: async () => ({
    platform: { routing: { setRouteProtection: state.setProtection } },
  }),
  disposePlatform: state.dispose,
}));
vi.mock("@repo/platform/engine/modules/projects/project-deploy-target", () => ({
  resolveProjectDeployTarget: async () => ({ deployTarget: state.target }),
}));
vi.mock("@repo/platform/engine/modules/domains/domain-execution", () => ({
  domainExecution: state.hostAdmission,
}));

import {
  changeRouteProtection,
  registerProtectedProjectRoute,
  assertRouteProtectionTarget,
  listRouteProtection,
} from "@repo/platform/engine/lib/route-protection";
const ctx = { organizationId: "org" } as ExecutionContext;
const route = { domain: "private.test", targetUrl: "http://127.0.0.1:3000", tls: true };
const policy = {
  version: "a".repeat(32),
  salt: "b".repeat(64),
  verifier: "c".repeat(64),
  signingKey: "d".repeat(64),
  iterations: 600_000,
  sessionSeconds: 86400,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.target = "local";
  state.cloud = false;
  state.active = true;
  state.project.organizationId = "org";
  state.project.deletionInProgress = false;
  state.domain.projectId = "proj";
  state.row = {
    hostname: "private.test",
    enabled: true,
    secret: JSON.stringify(policy),
    revision: "v1",
    appliedRevision: null,
  };
  state.setProtection.mockResolvedValue(true);
  state.hostAdmission.mockResolvedValue(undefined);
});

describe("route protection admission and publication", () => {
  it("refuses another tenant, Cloud, cleanup and host-policy denial before writing", async () => {
    state.project.organizationId = "other";
    await expect(
      changeRouteProtection(ctx, "proj", { hostname: route.domain, action: "unlock" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    state.project.organizationId = "org";
    state.target = "cloud";
    await expect(
      changeRouteProtection(ctx, "proj", { hostname: route.domain, action: "unlock" }),
    ).rejects.toMatchObject({ code: "ROUTE_PROTECTION_UNSUPPORTED" });
    state.target = "local";
    state.project.deletionInProgress = true;
    await expect(
      changeRouteProtection(ctx, "proj", { hostname: route.domain, action: "unlock" }),
    ).rejects.toMatchObject({ code: "PROJECT_DELETION_PENDING" });
    state.project.deletionInProgress = false;
    state.hostAdmission.mockRejectedValue(new Error("host policy"));
    await expect(
      changeRouteProtection(ctx, "proj", { hostname: route.domain, action: "unlock" }),
    ).rejects.toThrow("host policy");
    expect(state.save).not.toHaveBeenCalled();
    expect(state.setProtection).not.toHaveBeenCalled();
  });

  it("keeps an unacknowledged change pending and only retries the saved policy", async () => {
    state.setProtection.mockRejectedValueOnce(new Error("reload failed"));
    await expect(
      changeRouteProtection(ctx, "proj", { hostname: route.domain, action: "retry" }),
    ).rejects.toThrow("reload failed");
    expect(state.markApplied).not.toHaveBeenCalled();
    expect(state.dispose).toHaveBeenCalled();
    expect(
      await changeRouteProtection(ctx, "proj", { hostname: route.domain, action: "retry" }),
    ).toMatchObject({ enabled: true, status: "applied" });
    expect(state.save).not.toHaveBeenCalled();
    expect(state.setProtection).toHaveBeenLastCalledWith(route.domain, policy);
    state.active = false;
    expect(
      await changeRouteProtection(ctx, "proj", { hostname: route.domain, action: "unlock" }),
    ).toMatchObject({ enabled: false, status: "pending" });
    expect(state.save.mock.calls.at(-1)?.[3]).toBeNull();
  });

  it("publishes the saved policy on deployment, and never turns missing credentials into an unlock", async () => {
    await registerProtectedProjectRoute({ id: "proj" }, { registerRoute: state.register }, route);
    expect(state.register).toHaveBeenLastCalledWith({
      ...route,
      protection: policy,
      terminatesTlsLocally: true,
    });
    state.row!.secret = null;
    state.register.mockClear();
    await expect(
      registerProtectedProjectRoute({ id: "proj" }, { registerRoute: state.register }, route),
    ).rejects.toMatchObject({ code: "ROUTE_PROTECTION_SECRET_MISSING" });
    await expect(assertRouteProtectionTarget({ id: "proj" }, "cloud")).rejects.toMatchObject({
      code: "ROUTE_PROTECTION_UNSUPPORTED",
    });
    expect(state.register).not.toHaveBeenCalled();
    state.row!.secret = JSON.stringify(policy);
    state.domain.projectId = "another";
    await expect(
      registerProtectedProjectRoute({ id: "proj" }, { registerRoute: state.register }, route),
    ).rejects.toMatchObject({ code: "ROUTE_OWNER_CHANGED" });
    expect(state.register).not.toHaveBeenCalled();
  });

  it("does not report imported missing secrets applied or expose corrupt secret data in errors", async () => {
    state.row!.appliedRevision = "v1";
    state.row!.hasSecret = false;
    state.row!.secret = null;
    expect(await listRouteProtection(ctx, "proj")).toEqual([
      { hostname: "private.test", enabled: true, status: "pending" },
    ]);
    state.row!.secret = "invalid-secret-material";
    await expect(
      changeRouteProtection(ctx, "proj", { hostname: route.domain, action: "retry" }),
    ).rejects.toMatchObject({ code: "ROUTE_PROTECTION_SECRET_INVALID" });
    expect(state.setProtection).not.toHaveBeenCalled();
    expect(state.register).not.toHaveBeenCalled();
  });

  it("does not inherit a former project's edge password when the current project has no policy", async () => {
    state.row = null;
    await registerProtectedProjectRoute({ id: "proj" }, { registerRoute: state.register }, route);
    expect(state.register).toHaveBeenCalledWith({ ...route, protection: null });
  });
});
