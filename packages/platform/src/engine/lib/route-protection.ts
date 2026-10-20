import { AppError, NotFoundError, normalizeCustomHostname, isWildcardHostname } from "@repo/core";
import {
  createRouteProtection,
  revokeRouteSessions,
  assertRouteProtection,
  type RouteProtection,
  type RouteConfig,
  type RoutingProvider,
} from "@repo/adapters";
import { repos, type Project } from "@repo/db";
import { randomBytes } from "node:crypto";
import { assertResourceInOrg } from "./resource-access";
import { withProjectRuntimeLock } from "./project-runtime-lock";
import { findActiveDeployment } from "./active-deployment";
import {
  disposePlatform,
  resolveDeploymentPlatform,
  type DeploymentMeta,
} from "./deployment-runtime";
import { resolveProjectDeployTarget } from "../modules/projects/project-deploy-target";
import { domainExecution } from "../modules/domains/domain-execution";
import { env } from "../config";
import type { ExecutionContext } from "../../context";
import type { RouteProtectionInput, RouteProtectionStatus } from "@repo/contracts";

function hostnameOf(input: string): string {
  const hostname = normalizeCustomHostname(input);
  if (!hostname || hostname !== input.trim().toLowerCase() || isWildcardHostname(hostname))
    throw new AppError(
      "Choose an exact hostname, without a URL or wildcard.",
      400,
      "INVALID_DOMAIN",
    );
  return hostname;
}

async function selfHostedProject(ctx: ExecutionContext, id: string): Promise<Project> {
  const project = await repos.project.findById(id);
  assertResourceInOrg(project, "Project", ctx.organizationId, id);
  const target = await resolveProjectDeployTarget(project);
  if (
    env.CLOUD_MODE ||
    project.workspaceId ||
    target.deployTarget === "cloud" ||
    project.clusterId ||
    (project.serverId &&
      !(await repos.server.getInOrganization(project.serverId, ctx.organizationId)))
  ) {
    throw new AppError(
      "Password protection requires a self-hosted HTTPS edge. Cloud and cluster edges are not supported yet.",
      400,
      "ROUTE_PROTECTION_UNSUPPORTED",
    );
  }
  if (project.deletionInProgress)
    throw new AppError("Project cleanup is pending.", 409, "PROJECT_DELETION_PENDING");
  return project;
}

export async function listRouteProtection(
  ctx: ExecutionContext,
  projectId: string,
): Promise<RouteProtectionStatus[]> {
  await selfHostedProject(ctx, projectId);
  return (await repos.routeProtection.list(projectId)).map((row) => ({
    hostname: row.hostname,
    enabled: row.enabled,
    status:
      (!row.enabled || row.hasSecret) && row.revision === row.appliedRevision
        ? "applied"
        : "pending",
  }));
}

function privatePolicy(row: { enabled: boolean; secret: string | null }): RouteProtection | null {
  if (!row.enabled) return null;
  if (!row.secret)
    throw new AppError(
      "This private route has no restored password. Save a new password before publishing it.",
      409,
      "ROUTE_PROTECTION_SECRET_MISSING",
    );
  try {
    const policy: unknown = JSON.parse(row.secret);
    assertRouteProtection(policy);
    return policy;
  } catch {
    // Never include the serialized verifier or signing key in an error.
    throw new AppError(
      "The saved route protection is invalid. Save a new password before publishing it.",
      409,
      "ROUTE_PROTECTION_SECRET_INVALID",
    );
  }
}

/** The same registration entry point serves deploy, retry, and live route edits. */
export async function registerProtectedProjectRoute(
  project: Pick<Project, "id">,
  routing: Pick<RoutingProvider, "registerRoute">,
  route: RouteConfig,
): Promise<void> {
  const projectId = project.id;
  const row = await repos.routeProtection.readPrivate(projectId, route.domain.toLowerCase());
  // The database owns the policy for managed project routes. Do not inherit a
  // sidecar password left by a previous project that used this hostname.
  if (!row) return routing.registerRoute({ ...route, protection: null });
  const owner = await repos.domain.findByHostname(route.domain);
  if (owner?.projectId !== projectId)
    throw new AppError(
      "Route protection requires this project to own the hostname.",
      409,
      "ROUTE_OWNER_CHANGED",
    );
  const protection = privatePolicy(row);
  await routing.registerRoute({
    ...route,
    protection,
    ...(protection
      ? { terminatesTlsLocally: !owner.externalIngress && owner.domainType !== "free" }
      : {}),
  });
  if (row.appliedRevision !== row.revision)
    await repos.routeProtection.markApplied(projectId, row.hostname, row.revision);
}

export function protectedProjectRouting(
  project: Pick<Project, "id">,
  routing: Pick<RoutingProvider, "registerRoute"> | undefined,
): Pick<RoutingProvider, "registerRoute"> | undefined {
  return routing
    ? { registerRoute: (route) => registerProtectedProjectRoute(project, routing, route) }
    : undefined;
}

/** A durable intent precedes edge publication. Only an acknowledged, validated
 * reload is reported applied. A crash/error keeps an explicit retryable pending
 * state; an old protected vhost remains protected on a failed update. */
export async function changeRouteProtection(
  ctx: ExecutionContext,
  projectId: string,
  input: RouteProtectionInput,
): Promise<RouteProtectionStatus> {
  const hostname = hostnameOf(input.hostname);
  // Expensive derivation happens after authorization, before acquiring the route lock.
  await selfHostedProject(ctx, projectId);
  const prepared =
    input.action === "protect" ? await createRouteProtection(input.password) : undefined;
  return withProjectRuntimeLock(projectId, async () => {
    const project = await selfHostedProject(ctx, projectId);
    const domain = await repos.domain.findByHostname(hostname);
    if (domain && domain.projectId !== projectId)
      throw new NotFoundError("Project domain", hostname);
    if (domain && (domain.externalIngress || domain.domainType === "free"))
      throw new AppError(
        "This hostname must terminate HTTPS on your own edge to use a password.",
        400,
        "ROUTE_PROTECTION_HTTPS_REQUIRED",
      );
    if (domain) await domainExecution(ctx, domain.id);
    const prior = await repos.routeProtection.readPrivate(projectId, hostname);
    if (input.action === "revoke" && !prior?.secret)
      throw new AppError("This route has no saved password.", 400, "ROUTE_PROTECTION_NOT_ENABLED");
    if (input.action === "retry" && !prior) throw new NotFoundError("Route protection", hostname);
    const policy =
      prepared ??
      (input.action === "unlock"
        ? null
        : input.action === "revoke"
          ? revokeRouteSessions(privatePolicy(prior!)!)
          : privatePolicy(prior!));
    const revision = input.action === "retry" ? prior!.revision : randomBytes(16).toString("hex");
    if (input.action !== "retry")
      await repos.routeProtection.save(
        projectId,
        hostname,
        revision,
        policy === null ? null : JSON.stringify(policy),
      );
    const result: RouteProtectionStatus = { hostname, enabled: policy !== null, status: "pending" };
    const deployment = await findActiveDeployment(project);
    if (!domain || !deployment) return result;
    const resolved = await resolveDeploymentPlatform((deployment.meta ?? {}) as DeploymentMeta, {
      organizationId: ctx.organizationId,
    });
    try {
      const routing = resolved.platform.routing;
      if (!routing?.setRouteProtection)
        throw new AppError(
          "This edge does not support password protection.",
          400,
          "ROUTE_PROTECTION_UNSUPPORTED",
        );
      if (await routing.setRouteProtection(hostname, policy)) {
        await repos.routeProtection.markApplied(projectId, hostname, revision);
        return { ...result, status: "applied" };
      }
      return result;
    } finally {
      await disposePlatform(resolved);
    }
  });
}

/** Admission guard for target changes: never move a private site to an edge that
 * cannot enforce its policy. Unlock first, or keep it on a self-hosted target. */
export async function assertRouteProtectionTarget(
  project: Pick<Project, "id">,
  target: string | undefined | null,
) {
  if (
    (target === "cloud" || target === "cluster") &&
    (await repos.routeProtection.list(project.id)).some((row) => row.enabled)
  ) {
    throw new AppError(
      "This project has password-protected routes. Keep it on a self-hosted HTTPS edge, or remove protection before changing targets.",
      409,
      "ROUTE_PROTECTION_UNSUPPORTED",
    );
  }
}
