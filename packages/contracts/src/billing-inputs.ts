import { Type, type Static } from "@sinclair/typebox";
import { PLAN_IDS, PLANS } from "@repo/core";

/** Derive purchasable tiers from the same catalog used by pricing and Stripe. */
const purchasableTiers = PLAN_IDS.filter(id => (PLANS[id].price.monthly ?? 0) > 0);
export const CreateSubscriptionBody = Type.Object({
  planTierId: Type.Union(purchasableTiers.map(id => Type.Literal(id))),
  interval: Type.Union([Type.Literal("monthly"), Type.Literal("annual")]),
});
export type CreateSubscriptionInput = Static<typeof CreateSubscriptionBody>;
export const CreateTopupBody = Type.Object({ packId: Type.String({ minLength: 1, maxLength: 64 }) });
export type CreateTopupInput = Static<typeof CreateTopupBody>;
