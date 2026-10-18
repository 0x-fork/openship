import { expect, it } from "vitest";
import { repos } from "@repo/db";
import { seedOrg, seedProject } from "../../helpers/seed";
import { resolveServicePipelineMode } from "@repo/platform/engine/modules/deployments/build-pipeline";
import type { DeploymentConfigSnapshot } from "@repo/platform/engine/modules/deployments/build.service";

it("shares one bounded topology decision across full, service-scoped and explicit single-app deployments", async () => {
  const owner = await seedOrg();
  const project = await seedProject(owner.organizationId, {
    framework: "laravel",
    rootDirectory: ".",
    startCommand: "php artisan serve",
    hasBuild: true,
    hasServer: true,
  });
  const app = await repos.service.create({
    projectId: project.id,
    name: project.slug,
    kind: "monorepo",
    sortOrder: -1,
    rootDirectory: ".",
    enabled: true,
  });
  const database = await repos.service.create({
    projectId: project.id,
    name: "db",
    kind: "compose",
    image: "postgres:16-alpine",
    enabled: true,
    exposed: false,
  });
  const snapshot = {
    framework: "laravel",
    startCommand: project.startCommand,
    rootDirectory: ".",
    runtimeMode: "docker",
    deployTarget: "local",
    workload: "web",
    hasServer: true,
    hasBuild: true,
    serviceDeploymentMode: "services",
  } as DeploymentConfigSnapshot;
  expect(await resolveServicePipelineMode(project, snapshot)).toMatchObject({
    useServicePipeline: false,
    primaryApp: { app: { id: app.id }, infrastructure: [{ id: database.id }] },
  });
  expect(
    await resolveServicePipelineMode(project, { ...snapshot, targetServiceIds: [database.id] }),
  ).toHaveProperty("primaryApp.app.id", app.id);
  expect(
    await resolveServicePipelineMode(project, { ...snapshot, targetServiceIds: [app.id] }),
  ).toMatchObject({ useServicePipeline: true });
  expect(
    await resolveServicePipelineMode(project, { ...snapshot, targetServiceIds: ["foreign"] }),
  ).not.toHaveProperty("primaryApp");
  expect(
    await resolveServicePipelineMode(project, { ...snapshot, serviceDeploymentMode: "single" }),
  ).toMatchObject({
    useSingleAppPipeline: true,
    useServicePipeline: false,
    servicePreflightServices: [],
  });
  for (const unsupported of [
    { deployTarget: "cloud" },
    { clusterId: "cluster" },
    { managedWorkspaceId: "workspace" },
    { source: "image", releaseImageRef: "app:latest" },
    { workload: "static" },
  ]) {
    expect(
      await resolveServicePipelineMode(project, {
        ...snapshot,
        ...unsupported,
      } as DeploymentConfigSnapshot),
    ).not.toHaveProperty("primaryApp");
  }
  expect(
    await resolveServicePipelineMode({ ...project, workspaceId: "managed" }, snapshot),
  ).not.toHaveProperty("primaryApp");
});
