import { expect, it } from "vitest";
import { Hono } from "hono";
import { repos, seedOwner } from "../jobs/_harness";
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

it("shares pending protection through real native/HTTP operations without leaking credentials or crossing tenants", async () => {
  const owner = await seedOwner();
  const user = (await repos.user.findById(owner.userId))!;
  const group = await repos.projectGroup.create({
    organizationId: owner.orgId,
    name: "Private site",
    slug: "private-site",
  });
  const project = await repos.project.create({
    organizationId: owner.orgId,
    groupId: group.id,
    name: "Private site",
    slug: "private-site",
  });
  const native = await createShip({
    platform: getPlatformKernel(),
    identity: {
      resolve: async () => ({
        user: { id: user.id, email: user.email, name: user.name },
        sessionId: "route-protection-test",
      }),
    },
  }).scope({ identity: "verified", organizationId: owner.orgId });
  const remote = (token: string, organizationId: string) =>
    new OpenshipClient({
      baseUrl: "http://openship.test",
      token,
      organizationId,
      fetch: ((url, init) => app.request(url as string, init)) as typeof fetch,
    }).projects;
  const client = remote(owner.token, owner.orgId);
  const input = {
    hostname: "private.test",
    action: "protect" as const,
    password: "private-browser-password",
  };

  const pending = await native.projects.changeRouteProtection(project.id, input);
  expect(pending).toEqual({ hostname: input.hostname, enabled: true, status: "pending" });
  expect(await client.listRouteProtection(project.id)).toEqual([pending]);
  expect(JSON.stringify(pending)).not.toContain(input.password);
  expect(
    await client.changeRouteProtection(project.id, { hostname: input.hostname, action: "retry" }),
  ).toEqual(pending);
  const policy = (await repos.routeProtection.readPrivate(project.id, input.hostname))!.secret!;

  const other = await seedOwner();
  const stranger = remote(other.token, other.orgId);
  await expect(stranger.listRouteProtection(project.id)).rejects.toMatchObject({ statusCode: 404 });
  await expect(
    stranger.changeRouteProtection(project.id, { hostname: input.hostname, action: "unlock" }),
  ).rejects.toMatchObject({ statusCode: 404 });
  expect((await repos.routeProtection.readPrivate(project.id, input.hostname))!.secret).toBe(
    policy,
  );

  await expect(
    client.changeRouteProtection(project.id, { ...input, password: "short" }),
  ).rejects.toMatchObject({ statusCode: 400 });
  await client.changeRouteProtection(project.id, { hostname: input.hostname, action: "unlock" });
  expect(await native.projects.listRouteProtection(project.id)).toEqual([
    { hostname: input.hostname, enabled: false, status: "pending" },
  ]);
});
