import {
  CloudWorkspaceCollectionSchemas,
  CloudWorkspaceResourceSchemas,
  type CloudWorkspaceOperations,
} from "@repo/contracts";
import type { HttpClient } from "./http";
import { createRemoteResourceOperations, createRemoteScopedOperations } from "./resource-client";

export function createRemoteCloudWorkspaceOperations(http: HttpClient): CloudWorkspaceOperations {
  const path = (id: string) => `/workspaces/${encodeURIComponent(id)}`;
  return Object.freeze({
    ...createRemoteScopedOperations(http, CloudWorkspaceCollectionSchemas, {
      list: { method: "GET", path: () => "/workspaces", envelope: "data" },
      create: { method: "POST", path: () => "/workspaces", envelope: "data" },
    }),
    ...createRemoteResourceOperations(http, CloudWorkspaceResourceSchemas, {
      get: { method: "GET", path, envelope: "data" },
      getUsage: { method: "GET", path: (id) => path(id) + "/usage", envelope: "data" },
      rename: { method: "PATCH", path, envelope: "data" },
      ensure: { method: "POST", path: (id) => path(id) + "/ensure", envelope: "data" },
      retry: { method: "POST", path: (id) => path(id) + "/retry", envelope: "data" },
      previewResize: { method: "GET", path: (id) => path(id) + "/resize", envelope: "data" },
      resize: { method: "POST", path: (id) => path(id) + "/resize", envelope: "data" },
      remove: { method: "DELETE", path, envelope: "data" },
    }),
  });
}
