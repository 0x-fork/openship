import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDatabase, type DatabaseConnection } from "../connection";
import { createEncryption } from "../encryption";
import { createRepositories, type Repositories } from "./factory";
import { organization } from "../schema";

const encryption = createEncryption("build-cache-refresh-tests");
let connection: DatabaseConnection;
let repos: Repositories;
let orgId: string;
let otherOrgId: string;
let projectId: string;

beforeAll(async () => {
  connection = await createDatabase({ driver: "pglite", dataDir: "memory://" });
  repos = createRepositories(connection.db, encryption);
}, 60_000);
afterAll(async () => {
  await connection?.close();
  encryption.close();
});
beforeEach(async () => {
  orgId = randomUUID();
  otherOrgId = randomUUID();
  await connection.db.insert(organization).values(
    [orgId, otherOrgId].map((id) => ({
      id,
      name: "Refresh test",
      slug: id,
      createdAt: new Date(),
    })),
  );
  const group = await repos.projectGroup.create({
    organizationId: orgId,
    name: "App",
    slug: "app",
  });
  const project = await repos.project.create({
    organizationId: orgId,
    groupId: group.id,
    name: "App",
    slug: "app",
    buildImage: "node:22",
    hostPort: 20001,
  });
  projectId = project.id;
});
afterEach(async () => {
  await connection.db.delete(organization).where(eq(organization.id, orgId));
  await connection.db.delete(organization).where(eq(organization.id, otherOrgId));
});

describe("durable next-build refresh requests", () => {
  it("survives repository recreation without modifying the serving project's configuration", async () => {
    const before = await repos.project.findById(projectId);
    const token = await repos.project.requestBuildCacheRefresh(projectId, orgId);
    expect(token).toBeTruthy();
    const reloaded = createRepositories(connection.db, encryption);
    expect(await reloaded.project.findById(projectId)).toEqual({
      ...before,
      buildCacheRefreshToken: token,
    });
  });

  it("acknowledges only the matching clear and leaves a newer request pending", async () => {
    const first = await repos.project.requestBuildCacheRefresh(projectId, orgId);
    const second = await repos.project.requestBuildCacheRefresh(projectId, orgId);
    expect(first).not.toBe(second);
    expect(await repos.project.acknowledgeBuildCacheRefresh(projectId, orgId, first!)).toBe(false);
    expect((await repos.project.findById(projectId))?.buildCacheRefreshToken).toBe(second);
    expect(await repos.project.acknowledgeBuildCacheRefresh(projectId, orgId, second!)).toBe(true);
    expect((await repos.project.findById(projectId))?.buildCacheRefreshToken).toBeNull();
    expect(await repos.project.acknowledgeBuildCacheRefresh(projectId, orgId, second!)).toBe(false);
  });

  it("cannot request or acknowledge another tenant's clear, a missing project or a deleted project", async () => {
    const token = await repos.project.requestBuildCacheRefresh(projectId, orgId);
    expect(await repos.project.requestBuildCacheRefresh(projectId, otherOrgId)).toBeNull();
    expect(await repos.project.acknowledgeBuildCacheRefresh(projectId, otherOrgId, token!)).toBe(
      false,
    );
    expect((await repos.project.findById(projectId))?.buildCacheRefreshToken).toBe(token);
    expect(await repos.project.requestBuildCacheRefresh("missing", orgId)).toBeNull();
    await repos.project.softDelete(projectId);
    expect(await repos.project.requestBuildCacheRefresh(projectId, orgId)).toBeNull();
    expect(await repos.project.acknowledgeBuildCacheRefresh(projectId, orgId, token!)).toBe(false);
  });
});
