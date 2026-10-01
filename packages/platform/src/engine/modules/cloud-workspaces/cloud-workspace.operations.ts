import { CloudWorkspaceCollectionSchemas, CloudWorkspaceResourceSchemas } from "@repo/contracts";
import type { CloudWorkspaceDependencies } from "../../../cloud-workspaces";
import type { ExecutionContext } from "../../../context";
import { audit, operationAuditContext } from "../../lib/audit-emitter";
import * as service from "./cloud-workspace.service";

async function invoke(
  name: keyof typeof service,
  ctx: ExecutionContext,
  id: string | undefined,
  input: unknown,
) {
  const schemas = { ...CloudWorkspaceCollectionSchemas, ...CloudWorkspaceResourceSchemas };
  const run = service[name] as (...args: unknown[]) => Promise<unknown>;
  const result = await run(...(id ? [ctx, id, input] : [ctx, input]));
  const action = schemas[name as keyof typeof schemas].action;
  if (action !== "read")
    audit.recordAsync(operationAuditContext(ctx), {
      eventType: `cloud_workspace:${action}`,
      resourceType: "cloud_workspace",
      resourceId: id,
      after: { operation: name },
    });
  return result;
}
export const cloudWorkspaceDependencies: CloudWorkspaceDependencies = {
  collection: Object.fromEntries(
    Object.keys(CloudWorkspaceCollectionSchemas).map((name) => [
      name,
      (ctx: ExecutionContext, input: unknown) =>
        invoke(name as keyof typeof service, ctx, undefined, input),
    ]),
  ) as CloudWorkspaceDependencies["collection"],
  resources: Object.fromEntries(
    Object.keys(CloudWorkspaceResourceSchemas).map((name) => [
      name,
      (ctx: ExecutionContext, id: string, input: unknown) =>
        invoke(name as keyof typeof service, ctx, id, input),
    ]),
  ) as CloudWorkspaceDependencies["resources"],
};
