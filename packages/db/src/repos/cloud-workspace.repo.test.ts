import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import * as schema from "../schema";
import { assertCloudWorkspacePlacement, createCloudWorkspaceRepo } from "./cloud-workspace.repo";
import { createCloudDockerWorkspaceRepo } from "./cloud-docker-workspace.repo";

const client = new PGlite("memory://");
const db = drizzle(client, { schema });
const workspaces = createCloudWorkspaceRepo(db);
const hosts = createCloudDockerWorkspaceRepo(db);
const resources = { cpuCores: 2, memoryMb: 8192, diskMb: 25600 };
const intent = (
  kind: schema.CloudWorkspaceOperation["kind"],
  id = `operation-${kind}`,
): schema.CloudWorkspaceOperation => ({
  id,
  kind,
  status: "queued",
  requestedAt: new Date().toISOString(),
  attempts: 0,
  nextAttemptAt: null,
  error: null,
  logs: ["Queued"],
});
beforeAll(async () => {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.delete(schema.cloudDockerWorkspace);
  await db.delete(schema.project);
  await db.delete(schema.cloudWorkspace);
  await db.delete(schema.organization);
  await db.insert(schema.organization).values([
    { id: "org-a", name: "A" },
    { id: "org-b", name: "B" },
  ]);
  await db
    .insert(schema.projectGroup)
    .values({ id: "group", organizationId: "org-a", name: "Apps", slug: "apps" });
});
async function createWorkspace(
  mode: "shared" | "dedicated" = "shared",
  runtime: "docker" | "native" = "docker",
) {
  const workspace = await workspaces.create({
    organizationId: "org-a",
    name: "Production",
    mode,
    runtime,
  });
  return workspaces.setNamespace(workspace.id, "org-a", `ns-${workspace.id}`);
}
async function addProject(id: string, workspaceId: string) {
  return db.transaction(async (tx) => {
    const row = {
      id,
      workspaceId,
      organizationId: "org-a",
      groupId: "group",
      name: id,
      slug: id,
      environmentSlug: id,
    };
    await assertCloudWorkspacePlacement(tx, row);
    await tx.insert(schema.project).values(row);
  });
}
describe("subscription workspace ownership", () => {
  it("concurrent projects share one durable host and deleting either preserves it", async () => {
    const workspace = await createWorkspace();
    await Promise.all([addProject("a", workspace.id), addProject("b", workspace.id)]);
    const [a, b] = await Promise.all(
      ["a", "b"].map((projectId) =>
        hosts.reserve(
          { projectId, namespace: workspace.namespace!, image: "docker", resources },
          "org-a",
        ),
      ),
    );
    expect(a.id).toBe(b.id);
    expect(a.provisionKey).toBe(b.provisionKey);
    expect(a.projectId).toBeNull();
    expect(a.ownerWorkspaceId).toBe(workspace.id);
    await hosts.attach("a", "org-a", workspace.namespace!, "vm-shared");
    expect((await hosts.find("b", "org-a"))?.workspaceId).toBe("vm-shared");
    expect(
      (await db.query.project.findFirst({ where: eq(schema.project.id, "b") }))?.cloudWorkspaceId,
    ).toBeNull();
    await db.delete(schema.project).where(eq(schema.project.id, "a"));
    expect((await hosts.find("b", "org-a"))?.workspaceId).toBe("vm-shared");
    await db.delete(schema.project).where(eq(schema.project.id, "b"));
    expect((await hosts.find({ ownerWorkspaceId: workspace.id }, "org-a"))?.workspaceId).toBe(
      "vm-shared",
    );
    expect(await workspaces.findByIdInOrganization(workspace.id, "org-a")).toBeDefined();
  });
  it("rejects cross-organization membership at the database boundary and host access", async () => {
    const workspace = await createWorkspace();
    await expect(
      db.insert(schema.project).values({
        id: "foreign",
        organizationId: "org-b",
        groupId: "group",
        name: "Foreign",
        slug: "foreign",
        workspaceId: workspace.id,
      }),
    ).rejects.toThrow();
    await expect(
      hosts.reserve(
        {
          ownerWorkspaceId: workspace.id,
          namespace: workspace.namespace!,
          image: "docker",
          resources,
        },
        "org-b",
      ),
    ).rejects.toThrow();
    expect(await hosts.find({ ownerWorkspaceId: workspace.id }, "org-b")).toBeUndefined();
    await expect(workspaces.setNamespace(workspace.id, "org-b", "stolen")).rejects.toThrow();
  });
  it("serializes dedicated placement and never converts the runtime implicitly", async () => {
    const workspace = await createWorkspace("dedicated", "native");
    const results = await Promise.allSettled([
      addProject("a", workspace.id),
      addProject("b", workspace.id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { message: "This dedicated workspace already belongs to a project" },
    });
    await expect(
      hosts.reserve(
        {
          ownerWorkspaceId: workspace.id,
          namespace: workspace.namespace!,
          image: "docker",
          resources,
        },
        "org-a",
      ),
    ).rejects.toThrow();
    expect((await workspaces.findByIdInOrganization(workspace.id, "org-a"))?.runtime).toBe(
      "native",
    );
    await expect(createWorkspace("shared", "native")).rejects.toThrow();
  });
  it("keeps subscriptions independently scoped within the same organization", async () => {
    const first = await createWorkspace();
    const second = await createWorkspace();
    await workspaces.setBillingEntitlement(first.id, "org-a", first.namespace!, {
      planTierId: "pro",
      subscriptionStatus: "active",
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
    expect((await workspaces.findByIdInOrganization(second.id, "org-a"))?.planTierId).toBe("free");
    await expect(
      workspaces.setBillingEntitlement(second.id, "org-a", first.namespace!, {
        planTierId: "pro",
        subscriptionStatus: "active",
        currentPeriodStart: null,
        currentPeriodEnd: null,
      }),
    ).rejects.toThrow();
    await expect(workspaces.setNamespace(second.id, "org-a", first.namespace!)).rejects.toThrow();
  });
  it("can reserve an empty paid workspace before its first project", async () => {
    const workspace = await createWorkspace();
    const owner = { ownerWorkspaceId: workspace.id };
    await hosts.reserve(
      { ...owner, namespace: workspace.namespace!, image: "docker", resources },
      "org-a",
    );
    await hosts.attach(owner, "org-a", workspace.namespace!, "vm-first");
    await addProject("later", workspace.id);
    expect((await hosts.find("later", "org-a"))?.workspaceId).toBe("vm-first");
  });
  it("keeps completed operation logs and treats an HTTP replay as the same result", async () => {
    const workspace = await createWorkspace();
    const op = intent("ensure");
    await workspaces.requestOperation(workspace.id, "org-a", op);
    await workspaces.updateOperation(
      workspace.id,
      { ...op, status: "succeeded", logs: ["Ready"] },
      op.id,
    );
    expect((await workspaces.requestOperation(workspace.id, "org-a", op)).operation).toMatchObject({
      status: "succeeded",
      logs: ["Ready"],
    });
    expect(await workspaces.listPendingOperations()).toEqual([]);
    await expect(
      workspaces.requestOperation(workspace.id, "org-a", { ...op, kind: "delete" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
  });
  it("does not discard a failed resize's running-container checkpoint", async () => {
    const workspace = await createWorkspace();
    await addProject("existing", workspace.id);
    const op = { ...intent("resize"), resources, restartProjectIds: ["existing"] };
    await workspaces.requestOperation(workspace.id, "org-a", op);
    await workspaces.updateOperation(
      workspace.id,
      { ...op, status: "failed", restartContainerIds: ["012345abcdef"] },
      op.id,
    );
    await expect(
      workspaces.requestOperation(workspace.id, "org-a", intent("ensure")),
    ).rejects.toMatchObject({ code: "CLOUD_WORKSPACE_BUSY" });
    await expect(addProject("new", workspace.id)).rejects.toMatchObject({
      code: "CLOUD_WORKSPACE_BUSY",
    });
    const failed = (await workspaces.findById(workspace.id))!.operation!;
    const retried = await workspaces.requestOperation(workspace.id, "org-a", {
      ...failed,
      status: "queued",
    });
    expect(retried.operation?.restartContainerIds).toEqual(["012345abcdef"]);
    await workspaces.updateOperation(
      workspace.id,
      { ...retried.operation!, status: "succeeded" },
      op.id,
    );
    await expect(addProject("new", workspace.id)).resolves.toBeUndefined();
  });
  it("allows a failed preflight to be reviewed again before a resize mutates the host", async () => {
    const workspace = await createWorkspace();
    const op = { ...intent("resize"), resources, restartProjectIds: [] };
    await workspaces.requestOperation(workspace.id, "org-a", op);
    await workspaces.updateOperation(workspace.id, { ...op, status: "failed" }, op.id);
    const next = await workspaces.requestOperation(workspace.id, "org-a", {
      ...op,
      id: "new-reviewed-resize",
      resources: { ...resources, memoryMb: 16384 },
    });
    expect(next.operation?.resources?.memoryMb).toBe(16384);
  });
  it("serializes placement with reviewed membership and empty-workspace deletion", async () => {
    const workspace = await createWorkspace();
    await addProject("member", workspace.id);
    await expect(
      workspaces.requestOperation(workspace.id, "org-a", {
        ...intent("resize"),
        resources,
        restartProjectIds: [],
      }),
    ).rejects.toMatchObject({ code: "CLOUD_WORKSPACE_CHANGED" });
    await expect(
      workspaces.requestOperation(workspace.id, "org-a", intent("delete")),
    ).rejects.toThrow("Delete or migrate");
    await db.delete(schema.project).where(eq(schema.project.id, "member"));
    await workspaces.requestOperation(workspace.id, "org-a", intent("delete"));
    await expect(addProject("late", workspace.id)).rejects.toThrow("unavailable");
    await workspaces.finishDeletion(workspace.id, "org-a");
    expect(await workspaces.findById(workspace.id)).toBeUndefined();
  });
});
