/**
 * Updates routes — mounted at /api/updates.
 *
 * Org-singleton `updates` resource (see route-permission.ts) — any org member
 * can read the update list and trigger a rescan.
 */
import { Hono } from "hono";
import { Type } from "@sinclair/typebox";
import { UpdateCollectionSchemas, UpdateProjectSchemas } from "@repo/contracts";
import { secureRouter } from "../../lib/secure-router";
import * as ctrl from "./updates.controller";

const r = secureRouter(new Hono(), {
  module: "updates",
  basePath: "/api/updates",
});

r.get(
  "/",
  {
    tag: "updates:read",
    mcp: {
      description:
        "List update statuses for the org (apps, projects, self-app, webmail). ?behind=1 filters to those with an update available.",
    },
    query: Type.Object({ behind: UpdateCollectionSchemas.list.input.properties.behindOnly }),
  },
  ctrl.listUpdates,
);
r.post(
  "/scan",
  {
    tag: "updates:write",
    auditHandledByOperation: true,
    mcp: { description: "Trigger a fresh update scan across the org's projects/apps." },
  },
  ctrl.triggerScan,
);
r.post(
  "/:projectId/apply",
  {
    tag: "project:write",
    auditHandledByOperation: true,
    ids: { project: "projectId" },
    mcp: {
      description:
        "Apply the available update to a project/app (force-pulls image tags, redeploys, pre-deploy backup).",
    },
  },
  ctrl.applyUpdate,
);
r.post(
  "/:projectId/runtime",
  {
    tag: "project:write",
    auditHandledByOperation: true,
    ids: { project: "projectId" },
    body: UpdateProjectSchemas.updateRuntime.input,
    mcp: {
      description:
        "Refresh published runtime images and rebuild selected services at the active commit, without upgrading application code. Omit serviceIds to update the project.",
    },
  },
  ctrl.updateRuntime,
);

r.post(
  "/:projectId/runtime/check",
  {
    tag: "project:read",
    readOnly: true,
    ids: { project: "projectId" },
    body: UpdateProjectSchemas.checkRuntime.input,
    mcp: {
      description:
        "Check configured image tags and recorded build bases against their current registry digests. Does not deploy.",
    },
  },
  ctrl.checkRuntime,
);

export const updatesRoutes = r.hono;
