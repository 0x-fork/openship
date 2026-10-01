import { Type, type Static } from "@sinclair/typebox";
import type {
  ResourceOperationSchema,
  ResourceOperations,
  ScopedOperations,
} from "./resource-operations";
import { CloudAllocationSchema } from "./cloud-capacity";

const nullableString = Type.Union([Type.String(), Type.Null()]);
const nullableNumber = Type.Union([Type.Number({ minimum: 0 }), Type.Null()]);
const resourceSize = Type.Union([CloudAllocationSchema, Type.Null()]);
export const CloudWorkspaceSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  mode: Type.Union([Type.Literal("shared"), Type.Literal("dedicated")]),
  runtime: Type.Union([Type.Literal("docker"), Type.Literal("native")]),
  planTierId: Type.String(),
  subscriptionStatus: Type.String(),
  projectCount: Type.Integer({ minimum: 0 }),
  state: Type.String(),
  resources: resourceSize,
  operation: Type.Union([
    Type.Object({
      id: Type.String(),
      kind: Type.String(),
      status: Type.String(),
      requestedAt: Type.String(),
      nextAttemptAt: nullableString,
      error: nullableString,
      logs: Type.Array(Type.String()),
    }),
    Type.Null(),
  ]),
  createdAt: Type.String(),
});
export const CloudWorkspaceUsageSchema = Type.Object({
  measuredAt: Type.String(),
  available: Type.Boolean(),
  reason: nullableString,
  cpuPercent: nullableNumber,
  memoryUsedMb: nullableNumber,
  memoryAvailableMb: nullableNumber,
  diskUsedMb: nullableNumber,
  diskAvailableMb: nullableNumber,
  diskTotalMb: nullableNumber,
  sharedDiskMb: nullableNumber,
  projects: Type.Array(
    Type.Object({ id: Type.String(), name: Type.String(), diskMb: nullableNumber }),
  ),
});
export const CloudWorkspaceResizePreviewSchema = Type.Object({
  revision: Type.String(),
  before: CloudAllocationSchema,
  after: CloudAllocationSchema,
  restartProjects: Type.Array(Type.Object({ id: Type.String(), name: Type.String() })),
});
const operationKey = Type.String({ minLength: 16, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" });
const name = Type.String({ minLength: 1, maxLength: 80, pattern: "\\S" });
export const CloudWorkspaceCollectionSchemas = {
  list: {
    action: "read",
    scope: "list",
    output: Type.Object({
      workspaces: Type.Array(CloudWorkspaceSchema),
      dedicatedBilling: Type.Boolean(),
    }),
  },
  create: {
    action: "admin",
    input: Type.Object(
      {
        name,
        mode: Type.Optional(Type.Union([Type.Literal("shared"), Type.Literal("dedicated")])),
        runtime: Type.Optional(Type.Union([Type.Literal("docker"), Type.Literal("native")])),
      },
      { additionalProperties: false },
    ),
    output: CloudWorkspaceSchema,
  },
} as const satisfies Record<string, ResourceOperationSchema>;
export const CloudWorkspaceResourceSchemas = {
  get: { action: "read", output: CloudWorkspaceSchema },
  getUsage: { action: "read", output: CloudWorkspaceUsageSchema },
  rename: {
    action: "write",
    input: Type.Object({ name }, { additionalProperties: false }),
    output: CloudWorkspaceSchema,
  },
  ensure: { action: "write", output: CloudWorkspaceSchema },
  retry: { action: "admin", output: CloudWorkspaceSchema },
  previewResize: { action: "read", output: CloudWorkspaceResizePreviewSchema },
  resize: {
    action: "admin",
    input: Type.Object(
      {
        revision: Type.String({ pattern: "^[a-f0-9]{64}$" }),
        confirmRestart: Type.Literal(true),
        idempotencyKey: operationKey,
      },
      { additionalProperties: false },
    ),
    output: CloudWorkspaceSchema,
  },
  remove: {
    action: "admin",
    input: Type.Object(
      { confirmDelete: Type.Literal(true), idempotencyKey: operationKey },
      { additionalProperties: false },
    ),
    output: CloudWorkspaceSchema,
  },
} as const satisfies Record<string, ResourceOperationSchema>;
export type CloudWorkspaceSummary = Static<typeof CloudWorkspaceSchema>;
export type CloudWorkspaceUsage = Static<typeof CloudWorkspaceUsageSchema>;
export type CloudWorkspaceResizePreview = Static<typeof CloudWorkspaceResizePreviewSchema>;
export interface CloudWorkspaceOperations
  extends
    ScopedOperations<typeof CloudWorkspaceCollectionSchemas>,
    ResourceOperations<typeof CloudWorkspaceResourceSchemas> {}
