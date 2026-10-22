import { Type, type Static } from "@sinclair/typebox";
import type { ResourceOperationSchema } from "./resource-operations";

export const ManagementPricingSchema = Type.Object({
  version: Type.Integer(),
  monthlyCents: Type.Integer(),
  includedServers: Type.Integer(),
  extraServerMonthlyCents: Type.Integer(),
  maxServers: Type.Integer(),
  includedWithCloud: Type.Boolean(),
  dedicatedContact: Type.String(),
});
const nullableString = Type.Union([Type.String(), Type.Null()]);
export const ManagementStateSchema = Type.Object({
  pricing: ManagementPricingSchema,
  purchasesAvailable: Type.Boolean(),
  cloudIncluded: Type.Boolean(),
  active: Type.Boolean(),
  serverLimit: Type.Integer(),
  connectedServers: Type.Integer(),
  pendingCheckout: Type.Boolean(),
  subscription: Type.Union([
    Type.Object({
      servers: Type.Integer(),
      baseIncluded: Type.Boolean(),
      priceCents: Type.Integer(),
      periodEnd: nullableString,
      cancelAtPeriodEnd: Type.Boolean(),
      status: Type.String(),
    }),
    Type.Null(),
  ]),
  change: Type.Union([
    Type.Object({ status: Type.String(), effectiveAt: Type.String(), paymentUrl: nullableString }),
    Type.Null(),
  ]),
});
export const ManagementPurchaseSchema = Type.Object(
  {
    servers: Type.Integer({ minimum: 2, maximum: 100 }),
    idempotencyKey: Type.String({ minLength: 16, maxLength: 128, pattern: "^[a-zA-Z0-9_-]+$" }),
  },
  { additionalProperties: false },
);
export const ManagementPurchaseResultSchema = Type.Object({
  kind: Type.Union([Type.Literal("checkout"), Type.Literal("quote")]),
  url: nullableString,
  quoteId: nullableString,
  amountDueNow: Type.Union([Type.Integer(), Type.Null()]),
  monthlyCents: Type.Integer(),
  effectiveAt: nullableString,
});
export const ManagementBillingOperationSchemas = {
  getManagement: { action: "read", output: ManagementStateSchema },
  purchaseManagement: {
    action: "admin",
    input: ManagementPurchaseSchema,
    output: ManagementPurchaseResultSchema,
  },
  confirmManagementChange: {
    action: "admin",
    input: Type.Object(
      { quoteId: Type.String({ minLength: 1, maxLength: 255 }) },
      { additionalProperties: false },
    ),
    output: ManagementStateSchema,
  },
  resumeManagementCheckout: { action: "admin", output: Type.Object({ url: nullableString }) },
  cancelManagementChange: { action: "admin", output: ManagementStateSchema },
  cancelManagementCheckout: { action: "admin", output: ManagementStateSchema },
  cancelManagementSubscription: { action: "admin", output: ManagementStateSchema },
  resumeManagementSubscription: { action: "admin", output: ManagementStateSchema },
  createManagementPortal: { action: "admin", output: Type.Object({ portalUrl: Type.String() }) },
} as const satisfies Record<string, ResourceOperationSchema>;
export type ManagementState = Static<typeof ManagementStateSchema>;
export type ManagementPurchase = Static<typeof ManagementPurchaseSchema>;
