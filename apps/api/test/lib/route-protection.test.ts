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
  preview: null as Record<string, unknown> | null,
  source: null as Record<string, unknown> | null,
  sourceRow: null as Record<string, unknown> | null,
  enqueue: vi.fn(),
}));
vi.mock("@repo/db", () => ({
  repos: {
    project: {
      findById: async (id: string) => id === "source" ? state.source : state.project,
      findByIdInOrganization: async (id: string, org: string) => {
        const value = id === "source" ? state.source : state.project;
        return value?.organizationId === org ? value : null;
      },
    },
    pullRequestPreview: {
      findByProject: async () => state.preview,
      list: async () => state.preview ? [state.preview] : [],
      enqueue: state.enqueue,
    },
    domain: { findByHostname: async (hostname: string) => hostname === "dev.test"
      ? { ...state.domain, projectId: "source" } : state.domain },
    server: { getInOrganization: async () => null },
    routeProtection: {
      list: async () => (state.row ? [state.row] : []),
      readPrivate: async (id: string) => id === "source" ? state.sourceRow : state.row,
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
  readPreviewRouteProtection,
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
  state.save.mockReset();
  state.target = "local";
  state.cloud = false;
  state.active = true;
  state.preview = null;
  state.source = null;
  state.sourceRow = null;
  delete state.project.environmentType;
  delete state.project.previewSettings;
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

describe("native preview password inheritance", () => {
  function preview() {
    state.project.environmentType = "preview";
    state.preview = { sourceProjectId: "source", projectId: "proj", organizationId: "org" };
    state.source = {
      ...state.project,
      id: "source",
      environmentType: "development",
      previewSettings: { enabled: true, comments: false, baseDomain: "preview.test", protectionHostname: "dev.test" },
    };
    state.sourceRow = { ...state.row, hostname: "dev.test", revision: "source-v1" };
    state.row = null;
    state.save.mockImplementation(async (projectId, hostname, revision, secret) => {
      if (projectId === "proj") state.row = { hostname, revision, secret, enabled: secret !== null, appliedRevision: null };
    });
  }

  it("persists a separate child session key before first publication and reuses it on retries", async () => {
    preview();
    await registerProtectedProjectRoute({ id: "proj" }, { registerRoute: state.register }, route);
    const saved = JSON.parse(state.row!.secret as string);
    expect(saved.verifier).toBe(policy.verifier);
    expect(saved.salt).toBe(policy.salt);
    expect(saved.signingKey).not.toBe(policy.signingKey);
    expect(saved.version).not.toBe(policy.version);
    expect(state.save.mock.invocationCallOrder[0]).toBeLessThan(state.register.mock.invocationCallOrder[0]!);
    expect(state.register).toHaveBeenCalledWith(expect.objectContaining({ protection: saved }));
    await registerProtectedProjectRoute({ id: "proj" }, { registerRoute: state.register }, route);
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.register.mock.calls[1]![0].protection).toEqual(saved);
    await registerProtectedProjectRoute({ id: "proj" }, { registerRoute: state.register }, { ...route, domain: "second.preview.test" });
    expect(state.register.mock.calls[2]![0].protection.signingKey).not.toBe(saved.signingKey);
  });

  it("denies publication when a secret is missing, ownership is foreign, or the target is unsupported", async () => {
    preview();
    state.sourceRow!.secret = null;
    await expect(registerProtectedProjectRoute({ id: "proj" }, { registerRoute: state.register }, route))
      .rejects.toMatchObject({ code: "ROUTE_PROTECTION_SECRET_MISSING" });
    expect(state.register).not.toHaveBeenCalled();
    state.source!.organizationId = "another-org";
    await expect(registerProtectedProjectRoute({ id: "proj" }, { registerRoute: state.register }, route))
      .rejects.toMatchObject({ code: "PREVIEW_ROUTE_PROTECTION_REQUIRED" });
    expect(state.save).not.toHaveBeenCalled();
    state.source!.organizationId = "org";
    state.sourceRow!.secret = JSON.stringify(policy);
    state.target = "cloud";
    await expect(registerProtectedProjectRoute({ id: "proj" }, { registerRoute: state.register }, route))
      .rejects.toMatchObject({ code: "ROUTE_PROTECTION_UNSUPPORTED" });
    expect(state.register).not.toHaveBeenCalled();
  });

  it("rotates inherited sessions when the source revision changes and prevents a child unlock", async () => {
    preview();
    await registerProtectedProjectRoute({ id: "proj" }, { registerRoute: state.register }, route);
    const oldKey = JSON.parse(state.row!.secret as string).signingKey;
    state.sourceRow!.revision = "source-v2";
    await registerProtectedProjectRoute({ id: "proj" }, { registerRoute: state.register }, route);
    expect(JSON.parse(state.row!.secret as string).signingKey).not.toBe(oldKey);
    await expect(changeRouteProtection(ctx, "proj", { hostname: route.domain, action: "unlock" }))
      .rejects.toMatchObject({ code: "PREVIEW_ROUTE_PROTECTION_MANAGED" });
    await expect(changeRouteProtection(ctx, "proj", { hostname: route.domain, action: "revoke" }))
      .rejects.toMatchObject({ code: "PREVIEW_ROUTE_PROTECTION_MANAGED" });
    expect(state.setProtection).not.toHaveBeenCalled();
  });

  it("requires a custom base domain and an enabled source password", async () => {
    preview();
    const source = state.source as never;
    const settings = { enabled: true, comments: false, protectionHostname: "dev.test" };
    await expect(readPreviewRouteProtection(ctx, source, settings))
      .rejects.toMatchObject({ code: "PREVIEW_ROUTE_PROTECTION_REQUIRED" });
    state.sourceRow!.enabled = false;
    await expect(readPreviewRouteProtection(ctx, source, { ...settings, baseDomain: "preview.test" }))
      .rejects.toMatchObject({ code: "PREVIEW_ROUTE_PROTECTION_REQUIRED" });
  });
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
