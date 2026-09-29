import { repos, type Project } from "@repo/db";
import type { AppTemplate } from "@repo/core";
import { getTemplateForOrg } from "./catalog-source";

/** Failed installs can be retried directly, without reopening the app installer.
 * Persist defaults before the deployment freezes its service configuration. */
export async function ensureDraftAppResourceDefaults(
  project: Pick<Project, "id" | "organizationId" | "appTemplateId" | "activeDeploymentId">,
  knownTemplate?: AppTemplate,
): Promise<void> {
  if (!project.appTemplateId || project.activeDeploymentId) return;
  const template =
    knownTemplate ?? (await getTemplateForOrg(project.organizationId, project.appTemplateId));
  if (
    !template ||
    template.id !== project.appTemplateId ||
    ("requiresUpdate" in template && template.requiresUpdate)
  )
    return;
  const profiles = (template.services ?? []).flatMap((service) =>
    service.resources ? [{ name: service.name, resources: service.resources }] : [],
  );
  if (profiles.length === 0) return;
  await repos.service.seedDraftAppResourceDefaults({
    projectId: project.id,
    organizationId: project.organizationId,
    appTemplateId: project.appTemplateId,
    profiles,
  });
}
