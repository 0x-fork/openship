import type { RouteConfig, RoutingProvider } from "@repo/adapters";
import type { Project } from "@repo/db";
import { resolveProjectRouteProtection } from "./route-protection";
import { AppError } from "@repo/core";
import { withLiveProjectRuntimeMutation } from "./project-runtime-lock";

/** Project-owned routes apply saved policies on deploy, retry, and live edits. */
export async function registerProjectRoute(
  project: Pick<Project, "id">,
  routing: Pick<RoutingProvider, "registerRoute">,
  route: RouteConfig,
): Promise<void> {
  const published = await withLiveProjectRuntimeMutation(project.id, async () => {
    // Use the same lock as policy edits and teardown: an older deployment must
    // not publish a policy read before a concurrent rotation or revocation.
    const { routeOptions, onApplied } = await resolveProjectRouteProtection(
      project.id,
      route.domain,
    );
    await routing.registerRoute({ ...route, ...routeOptions });
    await onApplied?.();
    return true;
  });
  if (!published)
    throw new AppError(
      "Project cleanup is pending; its route was not published.",
      409,
      "PROJECT_DELETION_PENDING",
    );
}

/** Adapt project registration to consumers that only need to publish routes. */
export function createProjectRouteRegistrar(
  project: Pick<Project, "id">,
  routing?: Pick<RoutingProvider, "registerRoute">,
): Pick<RoutingProvider, "registerRoute"> | undefined {
  return routing
    ? { registerRoute: (route) => registerProjectRoute(project, routing, route) }
    : undefined;
}
