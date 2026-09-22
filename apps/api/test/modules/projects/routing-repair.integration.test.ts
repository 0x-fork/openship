import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { createRepositories, schema, type Repositories } from "@repo/db/factory";
import { createEncryption } from "@repo/db/encryption";
import { NginxProvider, OPENRESTY_DEFAULT_PATHS, type RootChecked } from "@repo/adapters";
import type { ExecutionContext } from "@repo/platform";
import type { ResolvedDeploymentPlatform } from "@repo/platform/engine/lib/deployment-runtime";
import { makeTestCert } from "../../../../../packages/adapters/src/system/proxy/test-certs";

// Real SQL repositories, route planners/writer, and certificate parser. Only the
// remote transport, edge health and request authorization are simulated here.
const h = vi.hoisted(() => ({
  repos: {} as Repositories,
  resolved: {} as ResolvedDeploymentPlatform,
  files: new Map<string, string>(),
  resolutionError: null as Error | null,
}));
vi.mock("@repo/db", async (original) => ({
  ...(await original<typeof import("@repo/db")>()),
  repos: h.repos,
}));
vi.mock("@repo/platform/engine/lib/platform-config", () => ({
  platform: () => ({ target: "local", runtime: { name: "docker" } }),
}));
vi.mock("@repo/platform/engine/lib/provision-lock", () => ({
  createProvisionLock: () => ({ run: <T>(work: () => Promise<T>) => work() }),
}));
vi.mock("@repo/platform/engine/lib/authorization", () => ({
  authorization: { authorize: async (ctx: ExecutionContext) => ctx },
}));
vi.mock("@repo/platform/engine/lib/self-app-routing", () => ({
  canRouteSelfApp: async () => false,
}));
vi.mock("@repo/platform/engine/lib/domain-claims", () => ({
  routableWithoutOwnership: async () => false,
}));
vi.mock("@repo/platform/engine/lib/audit-emitter", () => ({
  audit: { recordAsync: vi.fn() },
  operationAuditContext: (ctx: unknown) => ctx,
}));
vi.mock("@repo/platform/engine/lib/notification-dispatcher", () => ({
  notification: { emit: vi.fn() },
}));
vi.mock("@repo/platform/engine/lib/edge-reconcile", () => ({
  reconcileServerEdge: async () => ({ converted: false, updated: false, edgeDown: false }),
}));
vi.mock("@repo/platform/engine/lib/ssh-manager", () => ({
  sshManager: {
    probeReachable: async () => true,
    withExecutor: async (_id: string, work: (exec: unknown) => unknown) =>
      work(h.resolved.platform.executor),
  },
}));
vi.mock("@repo/platform/engine/lib/deployment-runtime", async (original) => ({
  ...(await original<typeof import("@repo/platform/engine/lib/deployment-runtime")>()),
  disposePlatform: () => {},
  resolveDeploymentPlatform: async (meta: { serverId?: string }) => {
    if (meta.serverId !== "remote-server")
      throw new Error("Certificate/route work reached the wrong server");
    if (h.resolutionError) throw h.resolutionError;
    return h.resolved;
  },
  withDeploymentPlatform: async (_dep: unknown, work: (target: unknown) => unknown) =>
    work({
      ...h.resolved.platform,
      effectiveTarget: "server",
      serverId: "remote-server",
    }),
}));
vi.mock("@repo/adapters", async (original) => ({
  ...(await original<typeof import("@repo/adapters")>()),
  edgeProxy: async () => ({}),
  edgeProxyFor: () => ({}),
  checkEdge: async () => ({ name: "edge", healthy: true }),
}));
vi.mock("@repo/platform/engine/modules/route-rules/route-rule.service", () => ({
  pushProjectRules: async () => {},
}));
vi.mock("@repo/platform/engine/modules/analytics/analytics-config.service", () => ({
  pushProjectAnalyticsConfig: async () => {},
}));

import { retryProjectRoutingOperation } from "@repo/platform/engine/modules/projects/project-routing-retry.operations";
import { manageDomainSsl } from "@repo/platform/engine/lib/domain-ssl";
import {
  getDomain,
  verifyDomain,
  verifyPendingDomains,
} from "@repo/platform/engine/modules/domains/domain.service";

const routes = [
  { name: "api", hostname: "api.example.com", port: 4010, ip: "10.0.0.2" },
  { name: "dashboard", hostname: "app.example.com", port: 3021, ip: "10.0.0.3" },
  { name: "web", hostname: "example.com", port: 3022, ip: "10.0.0.4" },
];
const context = {
  organizationId: "org",
  userId: "operator",
  scopeMode: "fixed",
} as ExecutionContext;
let client: PGlite;
let nginx: NginxProvider;
let writes: ReturnType<typeof vi.spyOn<NginxProvider, "registerRoute">>;
let issues: ReturnType<typeof vi.spyOn<NginxProvider, "provisionCert">>;

beforeAll(async () => {
  client = new PGlite("memory://");
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../../packages/db/drizzle",
    ),
  });
  Object.assign(h.repos, createRepositories(db, createEncryption("routing-integration-test-key")));
  // Keep FK enforcement enabled, including the project/domain ownership chain.
  await db
    .insert(schema.organization)
    .values({ id: "org", name: "Test", slug: "routing-test", createdAt: new Date() });
  await db
    .insert(schema.projectGroup)
    .values({ id: "group", organizationId: "org", name: "Stack", slug: "stack" });
  await db
    .insert(schema.servers)
    .values({ id: "remote-server", organizationId: "org", sshHost: "192.0.2.5", isLocal: false });
  await db.insert(schema.project).values({
    id: "project",
    organizationId: "org",
    groupId: "group",
    name: "Stack",
    slug: "stack",
    serverId: "remote-server",
    routeStrategy: "container-ip",
  });
  await db.insert(schema.deployment).values({
    id: "deployment",
    projectId: "project",
    organizationId: "org",
    branch: "main",
    status: "ready",
    containerId: "compose",
    meta: {
      serverId: "remote-server",
      deployTarget: "server",
      runtimeMode: "docker",
      edgeUnsynced: true,
      deployWarning: "Previous routing failure",
    },
  });
  await db
    .update(schema.project)
    .set({ activeDeploymentId: "deployment" })
    .where(eq(schema.project.id, "project"));
  for (const route of routes) {
    const serviceId = `service-${route.name}`;
    await db.insert(schema.service).values({
      id: serviceId,
      projectId: "project",
      name: route.name,
      kind: "compose",
      enabled: true,
      exposed: true,
      exposedPort: String(route.port),
      ports: [String(route.port)],
      domainType: "custom",
      customDomain: route.hostname,
    });
    await db.insert(schema.serviceDeployment).values({
      id: `live-${route.name}`,
      deploymentId: "deployment",
      serviceId,
      containerId: `container-${route.name}`,
      ip: route.ip,
      status: "running",
    });
    await db.insert(schema.orphanedResource).values({
      id: `checkpoint-${route.name}`,
      projectId: "project",
      organizationId: "org",
      serverId: "remote-server",
      resourceType: "route",
      ref: route.hostname,
      runtimeMode: "docker",
    });
    const cert = makeTestCert([route.hostname], { issuerCN: "R11", issuerO: "Let's Encrypt" });
    h.files.set(`/etc/letsencrypt/live/${route.hostname}/fullchain.pem`, cert.certPem);
    h.files.set(`/etc/letsencrypt/live/${route.hostname}/privkey.pem`, cert.keyPem);
  }
  const executor = {
    exec: async (command: string) => {
      const move = command.match(/^mv '([^']+)' '([^']+)'$/);
      if (move && h.files.has(move[1]!)) {
        h.files.set(move[2]!, h.files.get(move[1]!)!);
        h.files.delete(move[1]!);
      }
      return "";
    },
    exists: async (path: string) => h.files.has(path),
    readFile: async (path: string) => {
      const data = h.files.get(path);
      if (data === undefined) throw new Error(`ENOENT: ${path}`);
      return data;
    },
    writeFile: async (path: string, data: string) => {
      h.files.set(path, data);
    },
    mkdir: async () => {},
    rm: async (path: string) => {
      h.files.delete(path);
    },
  } as unknown as RootChecked;
  nginx = new NginxProvider({
    executor,
    paths: OPENRESTY_DEFAULT_PATHS,
    pinPaths: true,
    containerEdge: true,
  });
  writes = vi.spyOn(nginx, "registerRoute");
  issues = vi
    .spyOn(nginx, "provisionCert")
    .mockRejectedValue(new Error("Existing certificates must be reused"));
  h.resolved = {
    platform: {
      target: "selfhosted",
      routing: nginx,
      ssl: nginx,
      executor,
      runtime: {
        name: "docker",
        supports: () => true,
        getContainerInfo: async (id: string) => {
          const route = routes.find((r) => `container-${r.name}` === id);
          return route
            ? { containerId: id, status: "running", ip: route.ip }
            : { containerId: id, status: "missing" };
        },
        getContainerIp: async (id: string) =>
          routes.find((r) => `container-${r.name}` === id)?.ip ?? null,
      },
    },
    effectiveTarget: "server",
    serverId: "remote-server",
    runtimeMode: "docker",
    usesManagedRouting: false,
  } as unknown as ResolvedDeploymentPlatform;
}, 30_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await client?.close();
});

it("repairs all three missing service domain records, reuses their real certificates, and remains repeatable", async () => {
  expect(await h.repos.domain.listByProject("project")).toEqual([]);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const logs: string[] = [];
    expect(
      await retryProjectRoutingOperation(context, "project", (line) => logs.push(line)),
    ).toEqual({ ok: true });
    const domains = await h.repos.domain.listByProject("project");
    expect(domains).toHaveLength(3);
    for (const route of routes) {
      expect(domains.find((row) => row.hostname === route.hostname)).toMatchObject({
        projectId: "project",
        serviceId: `service-${route.name}`,
        targetPort: route.port,
        status: "active",
        verified: true,
        sslStatus: "active",
        sslExpiresAt: expect.any(Date),
      });
      expect(writes.mock.calls.filter(([config]) => config.domain === route.hostname)).toHaveLength(
        attempt,
      );
      const config = [...h.files.entries()].find(
        ([path, data]) => path.endsWith(".conf") && data.includes(`server_name ${route.hostname};`),
      )?.[1];
      expect(config).toContain(`proxy_pass http://${route.ip}:${route.port};`);
      expect(config).toContain(
        `ssl_certificate /etc/letsencrypt/live/${route.hostname}/fullchain.pem;`,
      );
    }
    expect((await h.repos.deployment.findById("deployment"))?.meta).not.toHaveProperty(
      "edgeUnsynced",
    );
    expect((await h.repos.deployment.findById("deployment"))?.meta).not.toHaveProperty(
      "deployWarning",
    );
    expect(logs.join("\n")).not.toContain("being cleaned up");
  }
  expect(issues).not.toHaveBeenCalled();
  // The repair preserves cleanup intent and does not destroy any certificate.
  expect(await h.repos.orphanedResource.listByProject("project")).toHaveLength(3);
  for (const route of routes) expect((await nginx.verifyCert(route.hostname)).verified).toBe(true);
  // A later SSH failure cannot redirect SSL inspection to the control plane
  // and report its empty certificate store as the remote domain's state.
  h.resolutionError = new Error("Cannot reach the deployment server over SSH");
  try {
    await expect(
      manageDomainSsl(routes[0]!.hostname, { action: "verify", projectId: "project" }),
    ).rejects.toThrow(h.resolutionError.message);
    expect(await h.repos.domain.findByHostname(routes[0]!.hostname)).toMatchObject({
      sslStatus: "active",
    });
  } finally {
    h.resolutionError = null;
  }
});

it("persists a failed check, honors backoff, and automatically recovers from the existing certificate", async () => {
  await retryProjectRoutingOperation(context, "project");
  const row = (await h.repos.domain.findByHostname(routes[0]!.hostname))!;
  await h.repos.domain.update(row.id, {
    status: "pending",
    verified: false,
    sslStatus: "none",
    verifyAttempts: 0,
    lastVerifyError: null,
    createdAt: new Date(Date.now() - 30 * 60_000),
    lastCheckedAt: null,
  });
  await h.repos.job.upsertSystem({
    key: "domains:verify-pending",
    label: "Domain verification",
    defaultCron: "*/13 * * * *",
  });

  h.resolutionError = new Error("Cannot reach the deployment server over SSH");
  try {
    expect(await verifyDomain(context, row.id)).toMatchObject({ verified: false, attempts: 1 });
    // Reads also repair the label for records saved by releases that kept
    // completed failures pending, without resetting their existing backoff.
    await h.repos.domain.update(row.id, { status: "pending" });
    const failed = await getDomain(context, row.id);
    expect(failed).toMatchObject({
      status: "failed",
      verifyAttempts: 1,
      lastVerifyError: h.resolutionError.message,
      diagnostics: {
        state: "failed",
        reason: "verification",
        automaticRetry: "scheduled",
        retryAction: "verify",
      },
    });
    expect(new Date(failed.diagnostics!.nextRetryAt!).getTime()).toBeGreaterThan(
      failed.lastCheckedAt!.getTime() + 15 * 60_000 - 1,
    );
    expect(await verifyPendingDomains()).toMatchObject({ total: 0 });
    expect((await h.repos.domain.findById(row.id))?.verifyAttempts).toBe(1);
  } finally {
    h.resolutionError = null;
  }

  await h.repos.domain.update(row.id, { lastCheckedAt: new Date(Date.now() - 16 * 60_000) });
  expect(await verifyPendingDomains()).toMatchObject({ verified: 1, failed: 0, total: 1 });
  expect(await getDomain(context, row.id)).toMatchObject({
    status: "active",
    verified: true,
    sslStatus: "active",
    verifyAttempts: 0,
    lastVerifyError: null,
    diagnostics: null,
  });
  expect(issues).not.toHaveBeenCalled();
  expect((await nginx.verifyCert(row.hostname)).verified).toBe(true);
});
