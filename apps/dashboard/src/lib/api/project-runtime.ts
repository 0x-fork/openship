import type { ProjectRuntimeRoles } from "@repo/contracts";
import { api } from "./client";
import { endpoints } from "./endpoints";

export function loadRuntimeRoles(projectId: string) {
  return api.get<{ data: ProjectRuntimeRoles }>(endpoints.projects.roles(projectId));
}
