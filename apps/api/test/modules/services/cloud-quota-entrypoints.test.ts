import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ tier: "starter", readRuntime: vi.fn() }));
vi.mock("@repo/platform/engine/config/env", async original => {
  const actual = await original<{ env: Record<string, unknown> }>();
  return { ...actual, env: { ...actual.env, CLOUD_MODE: true } };
});
vi.mock("@repo/platform/engine/modules/billing/billing-oblien-quota", async original => ({
  ...await original<typeof import("@repo/platform/engine/modules/billing/billing-oblien-quota")>(),
  syncOblienEntitlement: async () => ({ tier: h.tier }),
}));
vi.mock("@repo/platform/engine/lib/deployment-runtime", async original => ({
  ...await original<typeof import("@repo/platform/engine/lib/deployment-runtime")>(),
  resolveDeploymentRuntimeForRead: h.readRuntime,
}));
import { db, schema, repos, seedOwner } from "../jobs/_harness";
import { eq } from "@repo/db";
import { createService, updateService, startServiceContainer, restartServiceContainer } from "@repo/platform/engine/modules/services/service.service";
import { createQueuedDeployment, type DeploymentConfigSnapshot } from "@repo/platform/engine/modules/deployments/build.service";
import { createServicesProjectWithId } from "@repo/platform/engine/modules/projects/project-crud.service";
import { enableProject } from "@repo/platform/engine/modules/projects/project-runtime.service";
import type { ExecutionContext as RequestContext } from "@repo/platform";

let organizationId: string, projectId: string;
let sequence = 0;
const id = (prefix: string) => `${prefix}-cloud-quota-${++sequence}`;
const resources = { cpuCores: 1, memoryMb: 1024, diskMb: 8192 };
const snapshot = (): DeploymentConfigSnapshot => ({
  repoUrl: "", branch: "main", framework: "node", buildImage: "", runtimeImage: "", packageManager: "",
  installCommand: "", buildCommand: "", outputDirectory: "", productionPaths: [], volumes: [], rootDirectory: "",
  port: 3000, startCommand: "node app.js", resources, buildResources: null, hasServer: true, hasBuild: false,
  deployTarget: "cloud", serviceDeploymentMode: "single",
});
async function project() {
  const projectId = id("project");
  const groupId = id("group");
  await db.insert(schema.projectGroup).values({ id: groupId, organizationId, name: groupId, slug: groupId });
  await db.insert(schema.project).values({ id: projectId, groupId, organizationId, name: projectId, slug: projectId, resources });
  return projectId;
}
async function definition(enabled = true, advanced: Record<string, unknown> = {}) {
  const serviceId = id("service");
  await db.insert(schema.service).values({ id: serviceId, projectId, name: serviceId, enabled, image: "alpine:3", advanced });
  return serviceId;
}
function queue(target: string, meta = snapshot()) {
  return createQueuedDeployment({ projectId: target, organizationId, branch: "main", environment: "production", framework: "node", meta, envVars: {} });
}
const context = () => ({ organizationId } as RequestContext);
beforeEach(async () => {
  vi.clearAllMocks(); h.tier = "starter";
  const owner = await seedOwner(); organizationId = owner.orgId;
  await db.update(schema.organization).set({ oblienNamespace: `namespace-${organizationId}` }).where(eq(schema.organization.id, organizationId));
  projectId = await project();
  h.readRuntime.mockRejectedValue(new Error("Unexpected provider access"));
});

describe("Cloud quotas at real application mutation boundaries", () => {
  it("serializes service creation so only one request can reserve the final slot", async () => {
    await definition(); await definition();
    const results = await Promise.allSettled([
      createService(context(), projectId, { name: "last-a", image: "alpine:3" }),
      createService(context(), projectId, { name: "last-b", image: "alpine:3" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "PLAN_UPGRADE_REQUIRED", reason: "running-services" } });
    expect(await repos.service.countRunningForOrg(organizationId)).toBe(3);
  });
  it("serializes re-enabling disabled definitions at the same limit", async () => {
    await definition(); await definition();
    const a = await definition(false), b = await definition(false);
    const results = await Promise.allSettled([
      updateService(context(), projectId, a, { enabled: true }),
      updateService(context(), projectId, b, { enabled: true }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await repos.service.countRunningForOrg(organizationId)).toBe(3);
  });
  it("reserves native app slots atomically when two projects deploy together", async () => {
    await definition(); await definition();
    const a = await project(), b = await project();
    const results = await Promise.allSettled([queue(a), queue(b)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { reason: "running-services" } });
    expect(await repos.service.countRunningForOrg(organizationId)).toBe(3);
    const winner = results.find(result => result.status === "fulfilled");
    if (winner?.status === "fulfilled") expect(winner.value.meta).toMatchObject({ cloudApplicationSlot: true });
  });
  it("permits an existing native app to redeploy at the allowance without counting it twice", async () => {
    await definition(); await definition();
    const target = await project();
    const activeId = id("deployment");
    await db.insert(schema.deployment).values({ id: activeId, projectId: target, organizationId, branch: "main", status: "ready", containerId: "native-vm", meta: snapshot() });
    await db.update(schema.project).set({ activeDeploymentId: activeId }).where(eq(schema.project.id, target));
    await expect(queue(target)).resolves.toMatchObject({ status: "queued" });
    expect(await repos.service.countRunningForOrg(organizationId)).toBe(3);
  });
  it("refuses an oversized saved update before creating a queued deployment", async () => {
    await expect(queue(projectId, { ...snapshot(), resources: { ...resources, memoryMb: 16384 } }))
      .rejects.toMatchObject({ reason: "resource-tier" });
    expect(await db.query.deployment.findMany({ where: eq(schema.deployment.projectId, projectId) })).toHaveLength(0);
  });
  it.each(["start", "restart"])("checks actual resources before %s, including forced restarts", async action => {
    const serviceId = await definition(true, { resources: { cpuCores: 32, memoryMb: 32768 } });
    const operation = action === "start"
      ? startServiceContainer(context(), projectId, serviceId)
      : restartServiceContainer(context(), projectId, serviceId, { force: true });
    await expect(operation).rejects.toMatchObject({ reason: "resource-tier" });
    expect(h.readRuntime).not.toHaveBeenCalled();
  });
  it("does not enable a stopped definition when Start is over quota", async () => {
    await definition(); await definition(); await definition();
    const target = await definition(false);
    await expect(startServiceContainer(context(), projectId, target)).rejects.toMatchObject({ reason: "running-services" });
    expect((await repos.service.findById(target))?.enabled).toBe(false);
    expect(h.readRuntime).not.toHaveBeenCalled();
  });
  it("refuses resuming a paused native project after other services fill its slot", async () => {
    await definition(); await definition(); await definition();
    const target = await project(), activeId = id("deployment");
    await db.insert(schema.deployment).values({ id: activeId, projectId: target, organizationId, branch: "main", status: "ready", containerId: "native-vm", meta: { ...snapshot(), cloudApplicationSlot: true } });
    await db.update(schema.project).set({ activeDeploymentId: activeId, disabledAt: new Date() }).where(eq(schema.project.id, target));
    await expect(enableProject(target, organizationId)).rejects.toMatchObject({ reason: "running-services" });
    expect((await repos.project.findById(target))?.disabledAt).not.toBeNull();
    expect(h.readRuntime).not.toHaveBeenCalled();
  });
  it("serializes project creation so two imports cannot claim the final project slot", async () => {
    h.tier = "free";
    await project();
    const create = () => { const name = id("import"); return createServicesProjectWithId({ id: name, name, slug: name, organizationId }); };
    const results = await Promise.allSettled([create(), create()]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { reason: "project-limit" } });
    expect((await repos.projectGroup.listByOrganization(organizationId, { page: 1, perPage: 1 })).total).toBe(3);
  });
  it("honors a paid unlimited-project plan instead of falling back to the installation default", async () => {
    h.tier = "team";
    await project(); await project(); await project();
    const name = id("uncapped");
    await expect(createServicesProjectWithId({ id: name, name, slug: name, organizationId })).resolves.toMatchObject({ id: name });
  });
});
