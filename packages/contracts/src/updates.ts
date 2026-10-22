import { Type, type Static } from "@sinclair/typebox";
import { CreateDeploymentResultSchema, isCreateDeploymentResult } from "./deployments";
import type {
  ResourceOperationSchema,
  ResourceOperations,
  ScopedOperations,
} from "./resource-operations";
const nullableString = Type.Union([Type.String(), Type.Null()]);
const RuntimeScopeSchema = Type.Object(
  {
    serviceIds: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true }),
    ),
  },
  { additionalProperties: false },
);
export const RuntimeImageCheckResultSchema = Type.Object({
  checkedAt: Type.String(),
  images: Type.Array(
    Type.Object({
      serviceId: nullableString,
      serviceName: nullableString,
      role: Type.Union([Type.Literal("image"), Type.Literal("base")]),
      ref: Type.String(),
      currentDigest: nullableString,
      latestDigest: nullableString,
      status: Type.Union([
        Type.Literal("update_available"),
        Type.Literal("current"),
        Type.Literal("pinned"),
        Type.Literal("unknown"),
      ]),
    }),
  ),
});
export const ProjectUpdateSchema = Type.Object({
  projectId: Type.String(),
  name: Type.String(),
  slug: nullableString,
  isApp: Type.Boolean(),
  appTemplateId: nullableString,
  kind: Type.Union([Type.Literal("commit"), Type.Literal("release"), Type.Literal("image")]),
  behind: Type.Boolean(),
  latestInProgress: Type.Boolean(),
  inProgressDeploymentId: Type.Optional(nullableString),
  currentLabel: nullableString,
  latestLabel: nullableString,
  detail: Type.Record(Type.String(), Type.Unknown()),
  checkedAt: Type.String(),
});
export const UpdateCollectionSchemas = {
  list: {
    action: "read",
    input: Type.Object({ behindOnly: Type.Optional(Type.Boolean()) }),
    optionalInput: true,
    output: Type.Array(ProjectUpdateSchema),
  },
  scan: {
    action: "write",
    output: Type.Object({ scanned: Type.Integer(), supported: Type.Integer() }),
  },
} as const satisfies Record<string, ResourceOperationSchema>;
export const UpdateProjectSchemas = {
  apply: {
    action: "write",
    output: CreateDeploymentResultSchema,
    outputCheck: isCreateDeploymentResult,
  },
  updateRuntime: {
    action: "write",
    input: RuntimeScopeSchema,
    optionalInput: true,
    output: CreateDeploymentResultSchema,
    outputCheck: isCreateDeploymentResult,
  },
  checkRuntime: {
    action: "read",
    input: RuntimeScopeSchema,
    optionalInput: true,
    output: RuntimeImageCheckResultSchema,
  },
} as const satisfies Record<string, ResourceOperationSchema>;
export type ProjectUpdate = Static<typeof ProjectUpdateSchema>;
export type UpdateRuntimeInput = Static<typeof UpdateProjectSchemas.updateRuntime.input>;
export type RuntimeImageCheckResult = Static<typeof RuntimeImageCheckResultSchema>;
export interface UpdateOperations
  extends
    ScopedOperations<typeof UpdateCollectionSchemas>,
    ResourceOperations<typeof UpdateProjectSchemas> {}
