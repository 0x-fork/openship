import { Type, type Static } from "@sinclair/typebox";
const CloudAllocationSchema = Type.Object({
  cpuCores: Type.Number({ minimum: 0.25, maximum: 1024 }),
  memoryMb: Type.Integer({ minimum: 128, maximum: 1048576 }),
  diskMb: Type.Integer({ minimum: 0, maximum: 1073741824 }),
});

const nullableString = Type.Union([Type.String(), Type.Null()]);
const nullableNumber = Type.Union([Type.Number({ minimum: 0 }), Type.Null()]);
const resourceSize = Type.Union([CloudAllocationSchema, Type.Null()]);
export const CloudWorkspaceSchema = Type.Object({
  id: Type.String(),
  serverId: Type.String(),
  name: Type.String(),
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
export const CreateManagedServerInputSchema = Type.Object(
  {
    name,
  },
  { additionalProperties: false },
);
export const ResizeManagedServerInputSchema = Type.Object(
  {
    revision: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    confirmRestart: Type.Literal(true),
    idempotencyKey: operationKey,
  },
  { additionalProperties: false },
);
export const RemoveManagedServerInputSchema = Type.Object(
  { confirmDelete: Type.Literal(true), idempotencyKey: operationKey },
  { additionalProperties: false },
);
export type CloudWorkspaceSummary = Static<typeof CloudWorkspaceSchema>;
export type CloudWorkspaceUsage = Static<typeof CloudWorkspaceUsageSchema>;
export type CloudWorkspaceResizePreview = Static<typeof CloudWorkspaceResizePreviewSchema>;
export type CreateManagedServerInput = Static<typeof CreateManagedServerInputSchema>;
export type ResizeManagedServerInput = Static<typeof ResizeManagedServerInputSchema>;
export type RemoveManagedServerInput = Static<typeof RemoveManagedServerInputSchema>;
