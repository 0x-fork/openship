import { CloudWorkspaceCollectionSchemas, CloudWorkspaceResourceSchemas } from "@repo/contracts";
import type { Authorization } from "./authorization";
import {
  createScopedOperations,
  createResourceOperations,
  type ScopedServices,
  type ResourceServices,
  type PlatformScopedOperations,
  type PlatformResourceOperations,
} from "./resource-operations";

export interface CloudWorkspaceDependencies {
  collection: ScopedServices<typeof CloudWorkspaceCollectionSchemas>;
  resources: ResourceServices<typeof CloudWorkspaceResourceSchemas>;
}
export type PlatformCloudWorkspaceOperations = PlatformScopedOperations<
  typeof CloudWorkspaceCollectionSchemas
> &
  PlatformResourceOperations<typeof CloudWorkspaceResourceSchemas>;
export function createCloudWorkspaceOperations(
  authorization: Authorization,
  deps?: CloudWorkspaceDependencies,
): PlatformCloudWorkspaceOperations {
  return Object.freeze({
    ...createScopedOperations(
      CloudWorkspaceCollectionSchemas,
      authorization,
      "cloud_workspace",
      deps?.collection,
    ),
    ...createResourceOperations(
      CloudWorkspaceResourceSchemas,
      authorization,
      "cloud_workspace",
      deps?.resources,
    ),
  });
}
