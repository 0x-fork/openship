import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { db, eq, repos, schema } from "@repo/db";
import { seedOwner } from "../jobs/_harness";
import { createShip } from "@repo/sdk/native";
import { OpenshipClient } from "@repo/sdk/client";
import { getPlatformKernel } from "@repo/platform/engine/lib/platform";
import { projectRoutes } from "../../../src/modules/projects/project.routes";
import { healthRoutes } from "../../../src/modules/health/health.routes";
import { handleApiError } from "../../../src/middleware/error-handler";

const app = new Hono()
  .onError(handleApiError)
  .route("/api/health", healthRoutes)
  .route("/api/projects", projectRoutes);
async function clients() {
  const owner = await seedOwner();
  const user = (await repos.user.findById(owner.userId))!;
  const ship = createShip({
    platform: getPlatformKernel(),
    identity: {
      resolve: async () => ({
        user: { id: user.id, email: user.email, name: user.name },
        sessionId: "env-override-test",
      }),
    },
  });
  const native = await ship.scope({ identity: "verified", organizationId: owner.orgId });
  const remote = new OpenshipClient({
    baseUrl: "http://openship.test",
    token: owner.token,
    organizationId: owner.orgId,
    fetch: ((url, init) => app.request(url as string, init)) as typeof fetch,
  });
  return { owner, targets: [native, remote] };
}

import { seedProject } from "../../helpers/seed";
import { encrypt, decrypt } from "@repo/platform/engine/lib/encryption";

describe("project env override diagnostics through SDK/HTTP (#844)", () => {
  it("warns for literal and service-scoped overrides without returning their values", async () => {
    const { owner, targets } = await clients();
    const project = await seedProject(owner.orgId);
    const service = await repos.service.create({
      projectId: project.id,
      name: "worker",
      environment: { AUTH_SECRET: "old-private-value" },
    });
    await repos.project.setEnvVar({
      projectId: project.id,
      serviceId: service.id,
      key: "TOKEN",
      value: encrypt("service-secret"),
      isSecret: true,
      environment: "production",
    });
    for (const client of targets) {
      const result = await client.projects.mergeEnvVars(project.id, {
        environment: "production",
        upserts: [
          { key: "AUTH_SECRET", value: "new-private-value", isSecret: true },
          { key: "TOKEN", value: "project-secret", isSecret: true },
          { key: "PUBLIC_VALUE", value: "updated", isSecret: false },
        ],
        deletes: [],
      });
      expect(result.warnings).toEqual([expect.stringContaining('Service "worker"')]);
      expect(result.warnings![0]).toContain("AUTH_SECRET, TOKEN");
      expect(JSON.stringify(result)).not.toMatch(
        /private-value|project-secret|service-secret|PUBLIC_VALUE/,
      );
      const saved = await repos.project.getEnvMap(project.id, "production", null);
      expect(decrypt(saved.AUTH_SECRET!)).toBe("new-private-value");
    }
  });

  it("reports deletions that retain a pinned value, but leaves passthrough and preview values alone", async () => {
    const { owner, targets } = await clients();
    const project = await seedProject(owner.orgId);
    const service = await repos.service.create({
      projectId: project.id,
      name: "web",
      environment: { PINNED: "kept", PASSTHROUGH: "${PASSTHROUGH}" },
      advanced: { environmentTemplateKeys: ["PASSTHROUGH"] },
    });
    await repos.project.setEnvVar({
      projectId: project.id,
      serviceId: service.id,
      key: "PREVIEW",
      value: encrypt("preview-only"),
      isSecret: true,
      environment: "preview",
    });
    for (const client of targets) {
      const result = await client.projects.mergeEnvVars(project.id, {
        environment: "production",
        upserts: [
          { key: "PASSTHROUGH", value: "current", isSecret: true },
          { key: "PREVIEW", value: "prod", isSecret: false },
        ],
        deletes: ["PINNED"],
      });
      expect(result.warnings).toEqual([expect.stringContaining("PINNED")]);
      expect(result.warnings![0]).not.toMatch(/PASSTHROUGH|PREVIEW/);
    }
  });

  it("rejects cross-organization writes before returning service metadata", async () => {
    const { owner, targets } = await clients();
    const other = await seedOwner();
    const foreign = await seedProject(other.orgId);
    await repos.service.create({
      projectId: foreign.id,
      name: "private-service",
      environment: { TOKEN: "secret" },
    });
    for (const client of targets) {
      await expect(
        client.projects.mergeEnvVars(foreign.id, {
          environment: "production",
          upserts: [{ key: "TOKEN", value: "value", isSecret: true }],
          deletes: [],
        }),
      ).rejects.toThrow(/not found/i);
    }
    expect(await repos.project.listEnvVars(foreign.id)).toEqual([]);
  });
});
