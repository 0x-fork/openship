import type { RouteConfig, RoutingProvider } from "@repo/adapters";
import type { Project } from "@repo/db";
import { resolveProjectRouteProtection } from "./route-protection";

/** Project-owned routes apply saved policies on deploy, retry, and live edits. */
export async function registerProjectRoute(
  project: Pick<Project, "id">,
  routing: Pick<RoutingProvider, "registerRoute">,
  route: RouteConfig,
): Promise<void> {
  const { routeOptions, onApplied } = await resolveProjectRouteProtection(project.id, route.domain);
  await routing.registerRoute({ ...route, ...routeOptions });
  await onApplied?.();
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
