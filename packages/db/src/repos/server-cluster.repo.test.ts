import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import type { NativeClusterConfig } from "@repo/core";
import {
  managedOperationFixture,
  managedPlanFixture,
  successfulManagedReport,
} from "../../../contracts/test/managed-network-fixtures";
import * as schema from "../schema";
import { createServerClusterRepo } from "./server-cluster.repo";

const client = new PGlite("memory://");
const db = drizzle(client, { schema });
const repo = createServerClusterRepo(db);
const config = (): NativeClusterConfig => ({
  name: "Production",
  network: { mode: "native", cidrs: ["10.0.0.0/24"], mtu: 1400, probePort: 51821 },
  members: [
    { serverId: "s1", providerId: "custom", privateIp: "10.0.0.1" },
    { serverId: "s2", providerId: "hetzner-cloud", privateIp: "10.0.0.2" },
  ],
});

beforeAll(async () => {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
}, 30_000);
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await db.delete(schema.managedNetworkOperation);
  await db.delete(schema.serverCluster);
  await db.delete(schema.servers);
  await db.delete(schema.organization);
  await db.insert(schema.organization).values([
    { id: "org-a", name: "A" },
    { id: "org-b", name: "B" },
  ]);
  await db
    .insert(schema.servers)
    .values(["s1", "s2", "s3", "s4"].map((id) => ({ id, organizationId: "org-a", sshHost: id })));
  await db
    .insert(schema.servers)
    .values({ id: "foreign", organizationId: "org-b", sshHost: "foreign" });
});

describe("managed network journal and reservations", () => {
  async function plan(
    ids = ["s1", "s2"],
    overrides: Partial<ReturnType<typeof managedPlanFixture>> = {},
  ) {
    const value = { ...managedPlanFixture(ids), ...overrides };
    const operation = managedOperationFixture(ids);
    const id = crypto.randomUUID();
    return repo.savePlan("org-a", id, "user", id, operation.planHash, value);
  }
  function committed(operation: Awaited<ReturnType<typeof plan>>) {
    return operation.hosts.map((host, index) => ({
      ...host,
      stage: "committed" as const,
      publicKey: Buffer.alloc(32, index + 1).toString("base64"),
    }));
  }
  it("planning changes no inventory and applying is idempotent and organization-bound", async () => {
    const operation = await plan();
    expect(await repo.list("org-a")).toEqual([]);
    expect(await repo.membership("s1")).toBeNull();
    await expect(repo.getOperation("org-b", operation.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(repo.claimOperation("org-a", operation.id, "changed", "apply")).rejects.toThrow(
      "reviewed plan",
    );
    const first = await repo.claimOperation("org-a", operation.id, operation.planHash, "apply");
    const retry = await repo.claimOperation("org-a", operation.id, operation.planHash, "apply");
    expect(first.started).toBe(true);
    expect(retry.started).toBe(false);
    expect(first.operation.generation).toBe(1);
    expect(first.operation.sequence).toBe(operation.sequence + 1);
    expect(retry.operation.sequence).toBe(first.operation.sequence);
    await repo.heartbeatOperation(operation.id, 1);
    expect((await repo.getOperation("org-a", operation.id)).sequence).toBe(
      first.operation.sequence,
    );
    expect((await repo.get("org-a", operation.clusterId)).network.ownership).toBe("openship");
    await expect(repo.remove("org-a", operation.clusterId, 1)).rejects.toThrow("reviewed");
    await expect(repo.update("org-a", operation.clusterId, 1, config())).rejects.toThrow(
      "reviewed",
    );
    await expect(repo.startVerification("org-a", operation.clusterId, 1, "user")).rejects.toThrow(
      "current managed",
    );
    await expect(db.delete(schema.servers).where(eq(schema.servers.id, "s1"))).rejects.toThrow();
  });
  it("rejects expired approvals, physical aliases and concurrent subnet allocation", async () => {
    const expired = await plan(["s1", "s2"], { expiresAt: new Date(Date.now() - 1).toISOString() });
    await expect(
      repo.claimOperation("org-a", expired.id, expired.planHash, "apply"),
    ).rejects.toThrow("expired");
    const first = await plan();
    await repo.claimOperation("org-a", first.id, first.planHash, "apply");
    const second = await plan(["s3", "s4"], { clusterId: "other-cluster" });
    await expect(repo.claimOperation("org-a", second.id, second.planHash, "apply")).rejects.toThrow(
      "reserved this range",
    );
    const aliased = await plan(["s3", "s4"], {
      clusterId: "alias",
      hosts: managedPlanFixture(["s3", "s4"]).hosts.map((host, i) => ({
        ...host,
        hostIdentity: i ? host.hostIdentity : "host:s1",
      })),
    });
    await expect(
      repo.claimOperation("org-a", aliased.id, aliased.planHash, "apply"),
    ).rejects.toThrow("another server entry");
    expect(await repo.list("org-a")).toHaveLength(1);
  });
  it("recovers an expired worker with a new generation and rejects late updates", async () => {
    const operation = await plan();
    await repo.claimOperation("org-a", operation.id, operation.planHash, "apply");
    await db
      .update(schema.managedNetworkOperation)
      .set({ leaseExpiresAt: new Date(Date.now() - 1) })
      .where(eq(schema.managedNetworkOperation.id, operation.id));
    expect(await repo.getOperation("org-a", operation.id)).toMatchObject({
      status: "interrupted",
      sequence: 3,
    });
    expect(await repo.heartbeatOperation(operation.id, 1)).toBe(false);
    const recovery = await repo.claimOperation("org-a", operation.id, operation.planHash, "resume");
    expect(recovery.operation.generation).toBe(2);
    expect(recovery.operation.sequence).toBe(4);
    await expect(
      repo.progressOperation(operation.id, 1, "applying", operation.hosts),
    ).rejects.toThrow("no longer owns");
    await expect(
      repo.finishOperation(
        "org-a",
        operation.id,
        1,
        "succeeded",
        committed(operation),
        successfulManagedReport(operation.plan),
        null,
      ),
    ).rejects.toThrow("no longer owns");
    await repo.finishOperation(
      "org-a",
      operation.id,
      2,
      "rolled_back",
      operation.hosts.map((host) => ({ ...host, stage: "rolled_back" })),
      null,
      "Recovered",
    );
    expect(await repo.membership("s1")).toBeNull();
    expect(await repo.list("org-a")).toEqual([]);
    expect((await repo.getOperation("org-a", operation.id)).status).toBe("rolled_back");
  });
  it("requires every host receipt and all directed probes before committing inventory", async () => {
    const operation = await plan();
    await repo.claimOperation("org-a", operation.id, operation.planHash, "apply");
    await expect(
      repo.finishOperation(
        "org-a",
        operation.id,
        1,
        "succeeded",
        committed(operation).slice(0, 1),
        successfulManagedReport(operation.plan),
        null,
      ),
    ).rejects.toThrow("Every server");
    await expect(
      repo.finishOperation(
        "org-a",
        operation.id,
        1,
        "succeeded",
        committed(operation),
        { stage: "complete", hosts: [], peers: [] },
        null,
      ),
    ).rejects.toThrow("connectivity report");
    expect((await repo.get("org-a", operation.clusterId)).verification).toBeNull();
    await repo.finishOperation(
      "org-a",
      operation.id,
      1,
      "succeeded",
      committed(operation),
      successfulManagedReport(operation.plan),
      null,
    );
    const cluster = await repo.get("org-a", operation.clusterId);
    expect(cluster.verification?.status).toBe("succeeded");
    expect(cluster.members.every((member) => member.publicKey)).toBe(true);
    expect(await db.select().from(schema.managedNetworkClaim)).toEqual([]);
  });
  it("reserves both joining and departing members until update/removal is acknowledged", async () => {
    const first = await plan();
    await repo.claimOperation("org-a", first.id, first.planHash, "apply");
    await repo.finishOperation(
      "org-a",
      first.id,
      1,
      "succeeded",
      committed(first),
      successfulManagedReport(first.plan),
      null,
    );
    const next = managedPlanFixture(["s1", "s3"]);
    next.hosts = [...next.hosts, { ...first.plan.hosts[1]!, action: "remove" }];
    const update = await plan(["s1", "s3"], {
      ...next,
      baseRevision: 1,
      previous: first.plan.config,
    });
    await repo.claimOperation("org-a", update.id, update.planHash, "apply");
    expect(await repo.membership("s2")).toBeTruthy();
    expect(await repo.membership("s3")).toBeTruthy();
    await expect(db.delete(schema.servers).where(eq(schema.servers.id, "s3"))).rejects.toThrow();
    await repo.finishOperation(
      "org-a",
      update.id,
      1,
      "succeeded",
      committed(update),
      successfulManagedReport(update.plan),
      null,
    );
    expect(await repo.membership("s2")).toBeNull();
    const cluster = await repo.get("org-a", first.clusterId);
    expect(cluster.revision).toBe(2);
    expect(cluster.members.map((member) => member.serverId)).toEqual(["s1", "s3"]);
    const remove = await plan(["s1", "s3"], {
      baseRevision: 2,
      previous: next.config,
      config: next.config,
      intent: "remove",
      hosts: next.hosts
        .filter((host) => host.serverId !== "s2")
        .map((host) => ({ ...host, action: "remove" })),
    });
    await repo.claimOperation("org-a", remove.id, remove.planHash, "apply");
    await repo.finishOperation("org-a", remove.id, 1, "succeeded", committed(remove), null, null);
    expect(await repo.list("org-a")).toEqual([]);
    expect(await repo.membership("s1")).toBeNull();
    expect((await repo.getOperation("org-a", remove.id)).status).toBe("succeeded");
  });
  it("keeps claims during uncertain recovery and cascades only with its organization", async () => {
    const operation = await plan();
    await repo.claimOperation("org-a", operation.id, operation.planHash, "apply");
    await repo.progressOperation(
      operation.id,
      1,
      "needs_attention",
      operation.hosts,
      null,
      "SSH disconnected",
    );
    expect(await repo.membership("s1")).toBeTruthy();
    expect((await repo.getOperation("org-a", operation.id)).leaseExpiresAt).toBeNull();
    await db.delete(schema.organization).where(eq(schema.organization.id, "org-a"));
    expect(await db.select().from(schema.managedNetworkOperation)).toEqual([]);
    expect(await db.select().from(schema.managedNetworkClaim)).toEqual([]);
  });
});

describe("cluster persistence", () => {
  it("creates atomically and reuses a retried creation request", async () => {
    const first = await repo.create("org-a", config(), "request-a", "hash-a");
    const retry = await repo.create("org-a", config(), "request-a", "hash-a");
    expect(retry.id).toBe(first.id);
    expect(retry.members).toHaveLength(2);
    expect(retry.network.ownership).toBe("external");
    await expect(repo.create("org-a", config(), "request-a", "different")).rejects.toMatchObject({
      code: "CLUSTER_CONFLICT",
    });
    expect(await repo.list("org-a")).toHaveLength(1);
  });
  it("keeps references inside the organization and rolls back failed enrollment", async () => {
    const value = config();
    value.members[1]!.serverId = "foreign";
    await expect(repo.create("org-a", value, "request-a", "hash-a")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await repo.list("org-a")).toHaveLength(0);
    const cluster = await repo.create("org-a", config(), "request-a", "hash-a");
    await expect(repo.get("org-b", cluster.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repo.remove("org-b", cluster.id, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await repo.list("org-b")).toHaveLength(0);
  });
  it("allows only one active cluster per server and protects enrolled servers from deletion", async () => {
    await repo.create("org-a", config(), "request-a", "hash-a");
    await expect(repo.create("org-a", config(), "request-b", "hash-b")).rejects.toMatchObject({
      code: "CLUSTER_CONFLICT",
    });
    await expect(db.delete(schema.servers).where(eq(schema.servers.id, "s1"))).rejects.toThrow();
    expect(await repo.list("org-a")).toHaveLength(1);
  });
  it("rejects stale edits and invalidates verification when membership changes", async () => {
    const cluster = await repo.create("org-a", config(), "request-a", "hash-a");
    const { run } = await repo.startVerification("org-a", cluster.id, 1, "user");
    await expect(repo.update("org-a", cluster.id, 1, config())).rejects.toThrow("running");
    await repo.finish(run.id, { stage: "complete", hosts: [], peers: [] }, false, "Failed");
    const value = config();
    value.members[1]!.serverId = "s3";
    const updated = await repo.update("org-a", cluster.id, 1, value);
    expect(updated.revision).toBe(2);
    expect(updated.verification).toBeNull();
    expect(await repo.membership("s2")).toBeNull();
    await expect(repo.update("org-a", cluster.id, 1, config())).rejects.toThrow("changed");
  });
  it("deduplicates active verification and recovers an interrupted worker without accepting its late result", async () => {
    const cluster = await repo.create("org-a", config(), "request-a", "hash-a");
    const first = await repo.startVerification("org-a", cluster.id, 1, "user");
    const duplicate = await repo.startVerification("org-a", cluster.id, 1, "user");
    expect(duplicate.created).toBe(false);
    expect(duplicate.run.id).toBe(first.run.id);
    await db
      .update(schema.clusterVerification)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(schema.clusterVerification.id, first.run.id));
    expect((await repo.get("org-a", cluster.id)).verification?.status).toBe("interrupted");
    expect(await repo.progress(first.run.id, first.run.report)).toBe(false);
    await repo.finish(first.run.id, first.run.report, true, null);
    const retry = await repo.startVerification("org-a", cluster.id, 1, "user");
    expect(retry.created).toBe(true);
    expect(retry.run.id).not.toBe(first.run.id);
    expect((await repo.get("org-a", cluster.id)).verification?.status).toBe("running");
  });
  it("persists an explicit speed pair and deduplicates it without turning a normal check into a speed test", async () => {
    const cluster = await repo.create("org-a", config(), "request-a", "hash-a");
    const speedTest = { sourceServerId: "s1", targetServerId: "s2" };
    const first = await repo.startVerification("org-a", cluster.id, 1, "user", speedTest);
    expect(first.run.report).toMatchObject({ speedTest, throughput: [] });
    const again = await repo.startVerification("org-a", cluster.id, 1, "user", {
      sourceServerId: "s2",
      targetServerId: "s1",
    });
    expect(again).toMatchObject({ created: false, run: { id: first.run.id } });
    await expect(repo.startVerification("org-a", cluster.id, 1, "user")).rejects.toThrow(
      "different test",
    );
    await repo.finish(first.run.id, first.run.report, false, "Stopped");
    const quick = await repo.startVerification("org-a", cluster.id, 1, "user");
    expect(quick.run.report.speedTest).toBeUndefined();
    await expect(repo.startVerification("org-a", cluster.id, 1, "user", speedTest)).rejects.toThrow(
      "different test",
    );
  });
  it("rejects speed pairs outside the locked cluster membership", async () => {
    const cluster = await repo.create("org-a", config(), "request-a", "hash-a");
    for (const targetServerId of ["s1", "foreign", "s3"])
      await expect(
        repo.startVerification("org-a", cluster.id, 1, "user", {
          sourceServerId: "s1",
          targetServerId,
        }),
      ).rejects.toThrow("different members");
    expect((await repo.get("org-a", cluster.id)).verification).toBeNull();
  });
  it("detects physical-host aliases across clusters and fences identity changes", async () => {
    const a = await repo.create("org-a", config(), "request-a", "hash-a");
    const value = config();
    value.members = value.members.map((m, i) => ({ ...m, serverId: `s${i + 3}` }));
    const b = await repo.create("org-a", value, "request-b", "hash-b");
    const runA = await repo.startVerification("org-a", a.id, 1, "user");
    const runB = await repo.startVerification("org-a", b.id, 1, "user");
    await repo.recordIdentity(a.id, "s1", "host:identity", runA.run.id);
    await expect(repo.recordIdentity(b.id, "s3", "host:identity", runB.run.id)).rejects.toThrow(
      "already enrolled",
    );
    await expect(repo.recordIdentity(a.id, "s1", "host:replaced", runA.run.id)).rejects.toThrow(
      "identity changed",
    );
    await repo.finish(runA.run.id, runA.run.report, false, "Failed");
    await expect(repo.recordIdentity(a.id, "s2", "host:two", runA.run.id)).rejects.toThrow(
      "no longer active",
    );
  });
  it("removes adopted cluster records while keeping customer servers", async () => {
    const cluster = await repo.create("org-a", config(), "request-a", "hash-a");
    await repo.remove("org-a", cluster.id, 1);
    expect(await repo.list("org-a")).toHaveLength(0);
    expect(await repo.membership("s1")).toBeNull();
    expect(await db.select().from(schema.servers)).toHaveLength(5);
  });
  it("removes network attachments on membership changes and cluster removal", async () => {
    const cluster = await repo.create("org-a", config(), "request-a", "hash-a");
    const next = config();
    next.members[1]!.serverId = "s3";
    const updated = await repo.update("org-a", cluster.id, 1, next);
    expect(
      (await db.select().from(schema.serverNetworkAttachment)).map((row) => row.serverId).sort(),
    ).toEqual(["s1", "s3"]);
    expect(updated.members.map((member) => member.serverId).sort()).toEqual(["s1", "s3"]);
    await repo.remove("org-a", cluster.id, updated.revision);
    expect(await db.select().from(schema.serverNetworkAttachment)).toHaveLength(0);
  });
  it("allows organization deletion to cascade through its infrastructure", async () => {
    await repo.create("org-a", config(), "request-a", "hash-a");
    await db.delete(schema.organization).where(eq(schema.organization.id, "org-a"));
    expect(await db.select().from(schema.serverCluster)).toHaveLength(0);
    expect(await db.select().from(schema.serverNetworkAttachment)).toHaveLength(0);
    expect((await db.select().from(schema.servers)).map((row) => row.id)).toEqual(["foreign"]);
  });
});
