import "./_setup-env";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initPlatform, resetPlatform } from "@repo/adapters";
import { getAppTemplate } from "@repo/core";
import { repos, seedOwner, seedServer } from "../jobs/_harness";
import { decrypt } from "@repo/platform/engine/lib/encryption";
import { mergeServiceDeployEnv } from "@repo/platform/engine/modules/deployments/compose/service-env-layers";
import {
  buildServicePublicUrlMap,
  resolveEnvPublicUrls,
} from "@repo/platform/engine/modules/deployments/compose/deploy.service";
import {
  startExternalWebmailDeploy,
  startWebmailDeploy,
} from "@repo/platform/engine/modules/mail/webmail/webmail-install.service";
import type { ExecutionContext } from "@repo/platform";

const h = vi.hoisted(() => ({
  queued: vi.fn(async (_ctx: unknown, _input: unknown) => ({
    deployment_id: "test-webmail-deployment",
  })),
  linkError: null as Error | null,
}));
// Use the shipped catalog. Stop at deployment admission: the real installer,
// routing, settings merge and encrypted DB rows run, without creating containers.
vi.mock("@repo/platform/engine/modules/apps/catalog-source", async (original) => ({
  ...(await original<object>()),
  getTemplateForOrg: async (_org: string, id: string) => getAppTemplate(id),
}));
vi.mock("@repo/platform/engine/modules/deployments/build.service", () => ({
  requestBuildAccess: h.queued,
  resolveSnapshotTarget: async (...args: unknown[]) => {
    const original = await vi.importActual<
      typeof import("@repo/platform/engine/modules/deployments/build.service")
    >("@repo/platform/engine/modules/deployments/build.service");
    return original.resolveSnapshotTarget(
      ...(args as Parameters<typeof original.resolveSnapshotTarget>),
    );
  },
}));
vi.mock("@repo/platform/engine/lib/domain-ssl", () => ({
  verifyExistingCert: vi.fn(async () => ({ valid: false })),
}));
vi.mock("@repo/platform/engine/lib/route-apply.service", () => ({
  reconcileProjectRoutes: vi.fn(),
}));
vi.mock("@repo/platform/engine/lib/cloud/server-link", () => ({
  // Only the saved remote account identity is simulated. Placement and workspace
  // ownership still use real repository rows and the generic project installer.
  requireLinkedCloudServer: async (org: string, id: string) => {
    if (h.linkError) throw h.linkError;
    return repos.cloudWorkspace.findByIdInOrganization(id, org);
  },
  remoteCloudRequest: async (_org: string, path: string, init: RequestInit) => {
    // Acknowledge only the normal shared activity claims; no Cloud request leaves
    // this fixture. The real local admission/release records still run.
    if (!/^\/api\/cloud\/servers\/cloud-test-server-[^/]+\/activity(?:\/release)?$/.test(path))
      throw new Error(`Unexpected Cloud request: ${path}`);
    const { id } = JSON.parse(String(init.body));
    return { id, ...(path.endsWith("/release") ? { released: true } : {}) };
  },
}));

beforeAll(async () => {
  await initPlatform({ target: "desktop", runtime: "bare" });
});
beforeEach(() => {
  h.queued.mockClear();
  h.linkError = null;
  h.queued.mockImplementation(async (_ctx, input) => {
    const { projectId, ...overrides } = input as {
      projectId: string;
      deployTarget: "server" | "cloud";
      serverId: string;
    };
    const project = (await repos.project.findById(projectId))!;
    const { resolveSnapshotTarget } = await vi.importActual<
      typeof import("@repo/platform/engine/modules/deployments/build.service")
    >("@repo/platform/engine/modules/deployments/build.service");
    // Run real deployment placement too: a queued mock alone would hide the
    // missing Cloud binding that used to reject this request after installation.
    expect(await resolveSnapshotTarget(project, overrides)).toMatchObject({
      deployTarget: overrides.deployTarget,
      serverId: overrides.serverId,
    });
    return { deployment_id: "test-webmail-deployment" };
  });
});
afterAll(() => resetPlatform());

async function prepared() {
  const owner = await seedOwner({ instanceAdmin: true });
  const serverId = await seedServer(owner.orgId);
  await repos.mailServer.markInstalled(serverId, "example.com");
  return {
    ctx: { organizationId: owner.orgId, userId: owner.userId, role: "owner" } as ExecutionContext,
    serverId,
  };
}

async function deploymentEnv(projectId: string) {
  const project = (await repos.project.findById(projectId))!;
  const services = await repos.service.listByProject(projectId);
  expect(services).toHaveLength(1);
  const service = services[0]!;
  const decryptMap = (values: Record<string, string>) =>
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, decrypt(value)]));
  // These are the same layers and public-URL resolver consumed by compose deploy.
  const merged = mergeServiceDeployEnv(
    {
      project: decryptMap(await repos.project.getEnvMap(projectId, "production", null)),
      frozen: {},
      inline: service.environment ?? {},
      service: decryptMap(await repos.project.getEnvMap(projectId, "production", service.id)),
    },
    false,
  );
  const urls = buildServicePublicUrlMap(project, services, null);
  const resolved = resolveEnvPublicUrls(merged.env, (name, port) =>
    urls.get(port === undefined ? name : `${name}:${port}`),
  );
  expect(resolved.unresolved).toEqual([]);
  return { service, values: resolved.env };
}

async function managedDestination(ctx: ExecutionContext) {
  const workspace = await repos.cloudWorkspace.link({
    organizationId: ctx.organizationId,
    name: "Webmail Cloud",
    remote: {
      apiUrl: "https://cloud.example.test",
      userId: "cloud-test-user",
      organizationId: "cloud-test-org",
      serverId: `cloud-test-server-${ctx.organizationId}`,
      workspaceId: `cloud-test-workspace-${ctx.organizationId}`,
    },
  });
  return {
    workspace,
    server: (await repos.server.findByWorkspace(workspace.id, ctx.organizationId))!,
  };
}

describe("Deploy webmail backend configuration", () => {
  it("carries the mail server backend and generated secrets through install and redeploy", async () => {
    const { ctx, serverId } = await prepared();
    const input = {
      mailServerId: serverId,
      hostname: "webmail.example.com",
      target: { kind: "self" as const, serverId },
    };
    const first = await startWebmailDeploy(ctx, input);
    const initial = await deploymentEnv(first.projectId);
    expect(initial.values).toMatchObject({
      DEFAULT_IMAP_HOST: "mail.example.com",
      DEFAULT_IMAP_PORT: "993",
      DEFAULT_SMTP_HOST: "mail.example.com",
      DEFAULT_SMTP_PORT: "465",
      TRUSTED_ORIGINS: "https://webmail.example.com",
    });
    expect(initial.values.SESSION_ENCRYPTION_KEY).toMatch(/^[a-f0-9]{64}$/);
    expect(initial.values.BRANDING_ADMIN_TOKEN).toMatch(/^[a-f0-9]{64}$/);
    expect((await repos.mailServer.get(serverId))?.webmailProjectId).toBe(first.projectId);

    const retry = await startWebmailDeploy(ctx, { ...input, hostname: "inbox.example.com" });
    expect(retry.projectId).toBe(first.projectId);
    const next = await deploymentEnv(retry.projectId);
    expect(next.service.id).toBe(initial.service.id);
    expect(next.values).toEqual({
      ...initial.values,
      TRUSTED_ORIGINS: "https://inbox.example.com",
    });
    expect(h.queued).toHaveBeenCalledTimes(2);
    expect(h.queued.mock.calls[1]).toEqual([
      ctx,
      expect.objectContaining({ projectId: first.projectId, deployTarget: "server", serverId }),
    ]);
  });

  it("keeps the mail backend pinned when Cloud serves the mail hostname through its proxy", async () => {
    const { ctx, serverId } = await prepared();
    const { workspace, server: managedServer } = await managedDestination(ctx);
    const installed = await startWebmailDeploy(ctx, {
      mailServerId: serverId,
      hostname: "mail.example.com",
      target: { kind: "cloud", serverId: managedServer.id },
    });
    expect(await repos.project.findById(installed.projectId)).toMatchObject({
      workspaceId: workspace.id,
      serverId: managedServer.id,
    });
    const { values } = await deploymentEnv(installed.projectId);
    expect(values).toMatchObject({
      DEFAULT_IMAP_HOST: "mail.example.com",
      DEFAULT_IMAP_PORT: "993",
      DEFAULT_SMTP_HOST: "mail.example.com",
      DEFAULT_SMTP_PORT: "465",
      TRUSTED_ORIGINS: "https://mail.example.com",
    });
    expect(h.queued.mock.calls[0]).toEqual([
      ctx,
      expect.objectContaining({ deployTarget: "cloud", serverId: managedServer.id }),
    ]);
    const retried = await startWebmailDeploy(ctx, {
      mailServerId: serverId,
      hostname: "mail.example.com",
      target: { kind: "cloud", serverId: managedServer.id },
    });
    expect(retried.projectId).toBe(installed.projectId);
    expect((await deploymentEnv(retried.projectId)).values).toEqual(values);
  });

  it.each(["missing", "foreign", "unmanaged"] as const)(
    "rejects a %s Cloud destination before creating a draft or mail link",
    async (kind) => {
      const { ctx, serverId } = await prepared();
      const targetId =
        kind === "missing"
          ? undefined
          : kind === "foreign"
            ? await seedServer((await seedOwner()).orgId)
            : serverId;
      await expect(
        startWebmailDeploy(ctx, {
          mailServerId: serverId,
          hostname: "webmail.example.com",
          target: { kind: "cloud", serverId: targetId },
        }),
      ).rejects.toMatchObject({
        statusCode: kind === "missing" ? 409 : kind === "foreign" ? 404 : 400,
      });
      expect(await repos.project.listByOrganization(ctx.organizationId)).toMatchObject({
        rows: [],
        total: 0,
      });
      expect((await repos.mailServer.get(serverId))?.webmailProjectId).toBeNull();
      expect(h.queued).not.toHaveBeenCalled();
    },
  );

  it("refuses a Cloud migration before changing the linked webmail route, backend, or secrets", async () => {
    const { ctx, serverId } = await prepared();
    const { server: managedServer } = await managedDestination(ctx);
    const installed = await startWebmailDeploy(ctx, {
      mailServerId: serverId,
      hostname: "mail.example.com",
      target: { kind: "cloud", serverId: managedServer.id },
    });
    const before = await deploymentEnv(installed.projectId);
    await expect(
      startWebmailDeploy(ctx, {
        mailServerId: serverId,
        hostname: "different.example.com",
        target: { kind: "self", serverId },
      }),
    ).rejects.toMatchObject({ code: "CLOUD_WORKSPACE_TARGET_CONFLICT" });
    expect(await deploymentEnv(installed.projectId)).toEqual(before);
    expect((await repos.mailServer.get(serverId))?.webmailProjectId).toBe(installed.projectId);
    expect(h.queued).toHaveBeenCalledOnce();
  });

  it("checks server write permission before creating or linking a project", async () => {
    const { ctx, serverId } = await prepared();
    await expect(
      startWebmailDeploy(
        { ...ctx, credential: { organizationId: ctx.organizationId, readOnly: true } },
        {
          mailServerId: serverId,
          hostname: "webmail.example.com",
          target: { kind: "self", serverId },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "TOKEN_READ_ONLY" });
    expect(await repos.project.listByOrganization(ctx.organizationId)).toMatchObject({ total: 0 });
    expect((await repos.mailServer.get(serverId))?.webmailProjectId).toBeNull();
    expect(h.queued).not.toHaveBeenCalled();
  });

  it("requires the saved Cloud account binding before writing deployment configuration", async () => {
    const { ctx, serverId } = await prepared();
    const { server } = await managedDestination(ctx);
    h.linkError = new Error("Cloud account must be reconnected");
    await expect(
      startWebmailDeploy(ctx, {
        mailServerId: serverId,
        hostname: "webmail.example.com",
        target: { kind: "cloud", serverId: server.id },
      }),
    ).rejects.toBe(h.linkError);
    expect(await repos.project.listByOrganization(ctx.organizationId)).toMatchObject({ total: 0 });
    expect((await repos.mailServer.get(serverId))?.webmailProjectId).toBeNull();
    expect(h.queued).not.toHaveBeenCalled();
  });

  it.each(["server", "cloud"] as const)(
    "preserves an external backend when deploying to %s and retrying",
    async (deployTarget) => {
      const { ctx, serverId } = await prepared();
      const destinationId =
        deployTarget === "cloud" ? (await managedDestination(ctx)).server.id : serverId;
      const input = {
        hostname: `external-webmail-${deployTarget}.example.com`,
        backend: {
          imapHost: "imap.external.example",
          imapPort: 143,
          smtpHost: "smtp.external.example",
          smtpPort: 587,
        },
        target: { deployTarget, serverId: destinationId },
      };
      const first = await startExternalWebmailDeploy(ctx, input);
      const initial = await deploymentEnv(first.projectId);
      expect(initial.values).toMatchObject({
        DEFAULT_IMAP_HOST: input.backend.imapHost,
        DEFAULT_IMAP_PORT: "143",
        DEFAULT_SMTP_HOST: input.backend.smtpHost,
        DEFAULT_SMTP_PORT: "587",
        TRUSTED_ORIGINS: `https://${input.hostname}`,
      });
      const retried = await startExternalWebmailDeploy(ctx, input);
      expect(retried.projectId).toBe(first.projectId);
      expect((await deploymentEnv(retried.projectId)).values).toEqual(initial.values);
    },
  );
});
