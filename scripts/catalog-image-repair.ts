import { parseArgs } from "node:util";
import { OpenshipClient } from "../packages/sdk/src/client";
import { buildCatalog } from "../packages/core/scripts/gen-catalog";

type RepairClient = Pick<OpenshipClient, "projects" | "services" | "deployments" | "deployment">;

/** Opt-in operator repair for failed catalog installs. Only retired defaults
 * authored in the catalog are eligible; no image substitution in the engine. */
export async function repairCatalogImage(
  ship: RepairClient,
  projectId: string,
  serviceId: string,
  apply = false,
) {
  const project = await ship.projects.get(projectId);
  const service = await ship.services.get(projectId, serviceId);
  const template = buildCatalog().apps.find((app) => app.id === project.appTemplateId);
  const spec = template?.services?.find((item) => item.name === service.name);
  if (!spec?.image || service.projectId !== projectId)
    throw new Error("This service does not match an installed catalog app");
  const plan = { projectId, serviceId, from: service.image, to: spec.image };
  if (service.image === spec.image) return { ...plan, status: "already_current" };
  if (!service.image || !spec.replacesImages?.includes(service.image))
    throw new Error("This is not a retired catalog default; the configured image was preserved");
  if (!apply)
    return { ...plan, status: "preview", hasActiveDeployment: !!project.activeDeploymentId };
  // Replacement distributions may use a different UID or on-disk format. A
  // running installation needs a storage/upgrade review through the normal flow.
  // Never blindly change ownership or replace a live stateful app from this tool.
  if (project.activeDeploymentId)
    throw new Error(
      "This project has an active deployment. Review image and volume compatibility before using the normal service update flow",
    );
  const siblings = await ship.services.list(projectId);
  if (siblings.length !== 1 || siblings[0]?.id !== serviceId)
    throw new Error(
      "Automatic repair is limited to failed single-service installs. Review a multi-service project through its normal deployment flow",
    );
  const latest = await ship.services.get(projectId, serviceId);
  const currentProject = await ship.projects.get(projectId);
  if (latest.image !== service.image || currentProject.activeDeploymentId)
    throw new Error("The service changed during the preview; no repair was applied");
  const [lastDeployment] = (await ship.deployments.list({ projectId, perPage: 1 })).data;
  if (
    !lastDeployment ||
    lastDeployment.projectId !== projectId ||
    !["failed", "partial_failure"].includes(lastDeployment.status)
  )
    throw new Error("The latest deployment must have failed before an automatic repair can run");
  await ship.services.update(projectId, serviceId, { image: spec.image });
  // This is deliberately an image-only PATCH. Environment, commands, volumes
  // and routing remain owned by the existing service and normal deploy engine.
  const run = await ship.deployments.create({ projectId, serviceIds: [serviceId], forceAll: true });
  const outcome = await ship.deployment(run.deployment_id).wait({ timeoutMs: 600_000 });
  return { ...plan, ...outcome };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      service: { type: "string" },
      apply: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "OPENSHIP_URL=https://api.openship.io OPENSHIP_TOKEN=... bun scripts/catalog-image-repair.ts --project <id> --service <id> [--apply]\nDefaults to preview. --apply repairs a failed install and waits for its targeted deployment. Active installations require a storage compatibility review.",
    );
  } else {
    try {
      if (
        !values.project ||
        !values.service ||
        !process.env.OPENSHIP_URL ||
        !process.env.OPENSHIP_TOKEN
      )
        throw new Error("Set OPENSHIP_URL and OPENSHIP_TOKEN, and pass --project and --service");
      const ship = new OpenshipClient({
        baseUrl: process.env.OPENSHIP_URL,
        token: process.env.OPENSHIP_TOKEN,
      });
      const result = await repairCatalogImage(ship, values.project, values.service, values.apply);
      console.log(JSON.stringify(result, null, 2));
      if ("success" in result && !result.success) process.exitCode = 1;
    } catch (error) {
      // Print a message, never the SDK response body or stored environment.
      console.error(error instanceof Error ? error.message : "Catalog repair failed");
      process.exitCode = 1;
    }
  }
}
