import { AppError, BuildAccessBody, PrepareDeployBody, ResourceIdSchema, parseInput, isCreateDeploymentResult,
  type BuildOperations, type PrepareDeploymentInput, type BuildAccessInput, type PreparedProject, type CreateDeploymentResult } from "@repo/contracts";
import type { ExecutionContext } from "./context";
import type { Authorization } from "./authorization";
import type { DeploymentExecutionOptions, OperationResult } from "./deployments";

export type PlatformBuildOperations = {
  [K in keyof BuildOperations]: (ctx: ExecutionContext, ...args: Parameters<BuildOperations[K]>) => Promise<OperationResult<Awaited<ReturnType<BuildOperations[K]>>>>;
};
export interface BuildDependencies {
  prepare(ctx: ExecutionContext, input: PrepareDeploymentInput): Promise<PreparedProject>;
  access(ctx: ExecutionContext, input: BuildAccessInput, options?: DeploymentExecutionOptions): Promise<CreateDeploymentResult>;
  start(ctx: ExecutionContext, id: string): Promise<CreateDeploymentResult>;
  recordAudit(ctx: ExecutionContext, id: string): void;
}
export function createBuildOperations(authorization: Authorization, dependencies?: BuildDependencies): PlatformBuildOperations {
  const resources = () => {
    if (!dependencies) throw new AppError("Build operations are not configured", 501, "CAPABILITY_UNAVAILABLE");
    return dependencies;
  };
  function result(context: ExecutionContext, value: unknown) {
    const data: unknown = JSON.parse(JSON.stringify(value));
    if (!isCreateDeploymentResult(data)) throw new AppError("Invalid build response", 500, "INVALID_DEPLOYMENT_RESPONSE");
    resources().recordAudit(context, data.deployment_id);
    return { context, data };
  }
  return Object.freeze({
    async prepare(ctx, value) {
      const input = parseInput(PrepareDeployBody, value);
      // Preserve the API's deployment collection rule. A grant on existing
      // projects does not authorize preparation of an arbitrary source.
      const context = await authorization.authorize(ctx, { resourceType: "deployment", resourceId: "*", action: "write", scope: "list" });
      const data = await resources().prepare(context, input);
      resources().recordAudit(context, "*");
      return { context, data };
    },
    async buildAccess(ctx, value) {
      const input = parseInput(BuildAccessBody, value);
      const context = await authorization.authorize(ctx, { resourceType: "project", resourceId: input.projectId, action: "write" });
      return result(context, await resources().access(context, input));
    },
    async start(ctx, value) {
      const id = parseInput(ResourceIdSchema, value);
      const context = await authorization.authorize(ctx, { resourceType: "deployment", resourceId: id, action: "write" });
      return result(context, await resources().start(context, id));
    },
  } satisfies PlatformBuildOperations);
}
