import { Hono, type Context } from "hono";
import {
  CloudWorkspaceCollectionSchemas as collection,
  CloudWorkspaceResourceSchemas as resource,
} from "@repo/contracts";
import { getPlatformKernel } from "@repo/platform/engine/lib/platform";
import { secureRouter } from "../../lib/secure-router";
import { operationContext, operationData } from "../../lib/operation-context";
import { param } from "../../lib/controller-helpers";

const r = secureRouter(new Hono(), { module: "cloud-workspaces", basePath: "/api/workspaces" });
const operations = () => getPlatformKernel().cloudWorkspaces;
const ctx = operationContext;
const id = (c: Context) => param(c, "id");
const read = { authorizationHandledByOperation: true } as const;
const write = { ...read, auditHandledByOperation: true } as const;
r.get(
  "/",
  {
    ...read,
    tag: "cloud_workspace:list",
    mcp: {
      description:
        "List accessible subscription-owned Cloud workspaces, their runtime, provisioned capacity and current operation. Shared workspaces host multiple projects on one Docker host; projects do not reserve another VM.",
    },
  },
  async (c) => c.json({ data: await operationData(c, operations().list(ctx(c))) }),
);
r.post(
  "/",
  {
    ...write,
    tag: "cloud_workspace:admin",
    collection: true,
    body: collection.create.input,
    mcp: {
      description:
        "Create an empty Cloud workspace identity. Shared uses Docker; dedicated permits one project. This does not purchase a subscription or move existing projects. Subscribe in Billing, then provision with ensure.",
    },
  },
  async (c) =>
    c.json({ data: await operationData(c, operations().create(ctx(c), await c.req.json())) }, 201),
);
r.get(
  "/:id",
  {
    ...read,
    tag: "cloud_workspace:read",
    mcp: {
      description:
        "Read a Cloud workspace's live state and any provisioning, resize or deletion progress. Poll this after an asynchronous operation; failed operations include a reason and retry schedule.",
    },
  },
  async (c) => c.json({ data: await operationData(c, operations().get(ctx(c), id(c))) }),
);
r.get(
  "/:id/usage",
  {
    ...read,
    tag: "cloud_workspace:read",
    mcp: {
      description:
        "Measure actual workspace CPU, memory and disk usage, with accessible projects' Docker data and shared image/cache/system storage. Allocated disk is capacity, not used bytes. Unreachable measurements are null.",
    },
  },
  async (c) => c.json({ data: await operationData(c, operations().getUsage(ctx(c), id(c))) }),
);
r.patch(
  "/:id",
  {
    ...write,
    tag: "cloud_workspace:write",
    body: resource.rename.input,
    mcp: {
      description: "Rename a Cloud workspace without changing its subscription or placement.",
    },
  },
  async (c) =>
    c.json({
      data: await operationData(c, operations().rename(ctx(c), id(c), await c.req.json())),
    }),
);
r.post(
  "/:id/ensure",
  {
    ...write,
    tag: "cloud_workspace:write",
    mcp: {
      description:
        "Queue idempotent provisioning or resume of this subscribed Docker workspace. Uses provider-verified entitlement and preserves its existing disk. Poll the workspace for completion. Native resources are created by deploying their project.",
    },
  },
  async (c) => c.json({ data: await operationData(c, operations().ensure(ctx(c), id(c))) }, 202),
);
r.get(
  "/:id/resize",
  {
    ...read,
    tag: "cloud_workspace:read",
    mcp: {
      description:
        "Preview applying this workspace's current purchased capacity. Returns a revision and every project that may restart. Does not resize or change billing; disk shrinking requires migration.",
    },
  },
  async (c) => c.json({ data: await operationData(c, operations().previewResize(ctx(c), id(c))) }),
);
r.post(
  "/:id/resize",
  {
    ...write,
    tag: "cloud_workspace:admin",
    body: resource.resize.input,
    mcp: {
      description:
        "Queue the reviewed workspace resize using preview revision, idempotency key and explicit restart confirmation. Waits for deployments, saves the running containers and restores them after resizing. Poll get for progress.",
    },
  },
  async (c) =>
    c.json(
      { data: await operationData(c, operations().resize(ctx(c), id(c), await c.req.json())) },
      202,
    ),
);
r.post(
  "/:id/retry",
  {
    ...write,
    tag: "cloud_workspace:admin",
    mcp: {
      description:
        "Retry the workspace's saved failed operation without losing its provider identity or container recovery checkpoint. Poll get for the result.",
    },
  },
  async (c) => c.json({ data: await operationData(c, operations().retry(ctx(c), id(c))) }, 202),
);
r.delete(
  "/:id",
  {
    ...write,
    tag: "cloud_workspace:admin",
    body: resource.remove.input,
    mcp: {
      description:
        "Delete an empty workspace after its subscription has ended. Requires billing admin access and explicit deletion confirmation. Refuses while projects remain and confirms provider removal before deleting ownership. Deleting a project never calls this.",
    },
  },
  async (c) =>
    c.json(
      { data: await operationData(c, operations().remove(ctx(c), id(c), await c.req.json())) },
      202,
    ),
);
export const cloudWorkspaceRoutes = r.hono;
