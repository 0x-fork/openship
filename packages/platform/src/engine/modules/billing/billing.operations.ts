import { BillingOperationSchemas, OperationError, isRecord, normalizeBillingCreditPacks } from "@repo/contracts";
import { createPublicBillingOperations, type BillingDependencies } from "../../../billing";
import type { ExecutionContext } from "../../../context";
import type { ScopedServices } from "../../../resource-operations";
import { env } from "../../config/env";
import { audit, operationAuditContext } from "../../lib/audit-emitter";
import * as service from "./billing-application.service";
import { proxyToCloudBilling } from "./billing-local.service";
import { linkedCloudIdentity, requireLinkedCloudServer } from "../../lib/cloud/server-link";
import { sameCloudIdentity } from "../../lib/cloud/transport";
import { requireWorkspaceServer } from "../../lib/cloud-workspace-scope";
import { authorization } from "../../lib/authorization";
import { repos } from "@repo/db";
import { assertCloudProxyScope } from "../../lib/cloud/scope";

const routes = {
  quoteCustomPlan: ["GET", "/subscription/quote"],
  previewSubscriptionChange: ["POST", "/subscription/change/preview"],
  confirmSubscriptionChange: ["POST", "/subscription/change"],
  getSubscriptionChange: ["GET", "/subscription/change"],
  cancelSubscriptionChange: ["POST", "/subscription/change/cancel"],
  getCheckout: ["GET", "/checkout"],
  getCreditAlerts: ["GET", "/credit-alerts"],
  getState: ["GET", "/state"], getResources: ["GET", "/resources"], getSubscription: ["GET", "/subscription"],
  createSubscription: ["POST", "/subscription"], cancelSubscription: ["POST", "/cancel"],
  resumeSubscription: ["POST", "/resume"],
  createTopup: ["POST", "/topup"], listTopupPacks: ["GET", "/topup-packs"],
  createPortal: ["POST", "/portal"], getUsage: ["GET", "/usage"], listAllowanceDetail: ["GET", "/allowances"],
} as const satisfies Record<keyof typeof BillingOperationSchemas, readonly [string, string]>;

async function invoke(name: keyof typeof BillingOperationSchemas, ctx: ExecutionContext, input: unknown) {
  let data: unknown;
  if (env.CLOUD_MODE) {
    const run = service[name] as (ctx: ExecutionContext, input: unknown) => Promise<unknown>;
    data = await run(ctx, input);
  } else {
    const workspaceId = isRecord(input) && typeof input.workspaceId === "string" ? input.workspaceId : undefined;
    // An inventory-only Cloud server has no local workspace record. Its billing
    // stays upstream; an existing local record still requires its verified link.
    const local = workspaceId ? await repos.cloudWorkspace.findById(workspaceId) : null;
    let linked = local ? await requireLinkedCloudServer(ctx.organizationId, workspaceId!) : null;
    if (workspaceId && !local) {
      assertCloudProxyScope(ctx);
      const identity = await linkedCloudIdentity(ctx.organizationId);
      const links = await repos.cloudWorkspace.listByOrganization(ctx.organizationId);
      const match = links.find(row => row.remote?.workspaceId === workspaceId && sameCloudIdentity(identity, row.remote));
      if (match) linked = await requireLinkedCloudServer(ctx.organizationId, match.id);
    }
    if (linked && (name === "previewSubscriptionChange" || name === "confirmSubscriptionChange")) {
      const server = await requireWorkspaceServer(ctx.organizationId, linked.id);
      await authorization.authorize(ctx, { resourceType: "server", resourceId: server.id, action: "write" });
      for (const project of await repos.project.listByWorkspace(linked.id, ctx.organizationId))
        await authorization.authorize(ctx, { resourceType: "project", resourceId: project.id, action: "write" });
    }
    const remoteInput = linked && isRecord(input) ? { ...input, workspaceId: linked.remote.workspaceId } : input;
    const [method, route] = routes[name];
    const query = new URLSearchParams();
    if (method === "GET" && isRecord(remoteInput)) for (const [key, value] of Object.entries(remoteInput)) if (value !== undefined) query.set(key, String(value));
    const path = query.size ? `${route}?${query}` : route;
    const result = await proxyToCloudBilling(ctx, path, method, method === "POST" && remoteInput !== undefined ? JSON.stringify(remoteInput) : undefined, linked?.remote);
    if (result.status < 200 || result.status >= 300) {
      const body = isRecord(result.payload) ? result.payload : {};
      throw new OperationError(typeof body.error === "string" ? body.error : "Cloud billing request failed", result.status,
        typeof body.code === "string" ? body.code : undefined, body);
    }
    data = isRecord(result.payload) ? result.payload.data : undefined;
    if (linked && isRecord(data) && isRecord(data.workspace)) {
      if (data.workspace.id !== linked.remote.workspaceId)
        throw new OperationError("Cloud billing returned a different server", 502, "CLOUD_SERVER_IDENTITY_MISMATCH");
      if (local) {
        const server = await requireWorkspaceServer(ctx.organizationId, linked.id);
        data = { ...data, workspace: { ...data.workspace, id: linked.id, serverId: server.id } };
      }
    }
    if (name === "listTopupPacks") data = normalizeBillingCreditPacks(data);
  }
  const action = BillingOperationSchemas[name].action;
  if (action !== "read") audit.recordAsync(operationAuditContext(ctx), {
    eventType: `billing:${action}`, resourceType: "billing", resourceId: ctx.organizationId,
    // Checkout and portal URLs contain session credentials: never audit the result.
    after: { operation: name, ...(isRecord(input) ? input : {}) },
  });
  return data;
}

export const billingDependencies: BillingDependencies = {
  public: { listPlans: service.listPlans },
  collection: Object.fromEntries(Object.keys(BillingOperationSchemas).map(name => [name,
    (ctx: ExecutionContext, input: unknown) => invoke(name as keyof typeof BillingOperationSchemas, ctx, input),
  ])) as ScopedServices<typeof BillingOperationSchemas>,
};
export const publicBillingOperations = createPublicBillingOperations(billingDependencies.public);
