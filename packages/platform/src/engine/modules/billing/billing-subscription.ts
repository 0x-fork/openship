import type { BillingSubscription } from "@repo/contracts";
import type { OblienSubscription } from "../../lib/oblien-billing-api";
import { subscriptionPlan } from "./billing-catalog";

/** Extra credits are useful only while a customer's paid plan permits Cloud work. */
export function canTopUpCloudSubscription(subscription: OblienSubscription): boolean {
  return (
    subscription !== null &&
    subscriptionPlan(subscription).tier !== "free" &&
    ["active", "trialing"].includes(subscription.status)
  );
}

/** Keep provider identifiers out of the public application contract. */
export function presentCloudSubscription(subscription: OblienSubscription): BillingSubscription | null {
  if (!subscription) return null;
  return {
    tier: subscriptionPlan(subscription).tier,
    status: subscription.status,
    interval: subscription.billingInterval === "yearly" ? "annual" : "monthly",
    currentPeriod: { start: subscription.periodStart, end: subscription.periodEnd },
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    canceledAt: subscription.canceledAt,
  };
}
