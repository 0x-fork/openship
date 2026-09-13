/**
 * Billing-side teardown invoked when an organization is deleted.
 *
 * The auth-side hook (`afterDeleteOrganization` in lib/auth.ts) only
 * deletes the local org row + emits the audit event. Without a
 * follow-up cleanup the org leaks:
 *
 *   - Active Stripe subscriptions keep charging the dead org's card
 *     until manual operator intervention (Stripe doesn't know our
 *     org row was deleted; the FK CASCADE drops billing_subscription
 *     rows, but Stripe still has the live subscription on its side).
 *   - The Oblien namespace keeps running workspaces, accumulating
 *     usage rows that can never be billed against any org.
 *
 * This module is the single helper the auth hook calls. It's
 * deliberately careful to:
 *   - Make all Stripe mutations idempotent (idempotencyKey scoped per
 *     resource, no time bucket because teardown is one-shot per org).
 *   - Tolerate partial failures — each subscription cancel is wrapped
 *     so a single bad row doesn't abort the rest of the teardown.
 *   - Suspend the namespace before deleting so any in-flight workspace
 *     transitions are halted cleanly (Oblien's delete races terminate
 *     uncleanly if workspaces are mid-boot).
 *   - Skip wiped-clean orgs gracefully — calling teardown on an org
 *     with no Stripe customer / no namespace is a no-op.
 *
 * Customer.del() is GATED behind `BILLING_TEARDOWN_DELETE_CUSTOMER`
 * (default off) so forensic teams can still pull the dead org's
 * historical invoices from the Stripe dashboard. Operators can flip
 * the env var to true for full GDPR erasure.
 */

import { and, db, eq, inArray, repos, schema } from "@repo/db";
import { safeErrorMessage } from "@repo/core";
import { stripe } from "../../lib/stripe-client";

/** Local subscription statuses we should attempt to cancel on Stripe. */
const CANCELLABLE_STATUSES = ["active", "trialing", "past_due"] as const;

/* ───────── Pre-delete safety check ─────────────────────────────────────── */

/**
 * Snapshot of an org's outstanding billing obligations. Returned by
 * `getOrgBillingState` and consumed by the auth-side
 * `beforeDeleteOrganization` hook to reject deletion while the org has
 * live subscriptions or unpaid invoices.
 */
export interface OrgBillingState {
  /** Local billing_subscription rows in active/trialing/past_due. */
  activeSubscriptionCount: number;
  /** Stripe invoices currently in `status: "open"`. 0 if no Stripe customer. */
  openInvoiceCount: number;
  /** Sum of `amount_due` cents across open invoices. */
  openInvoiceAmountCents: number;
  /** True when deletion must be refused (subs or invoices outstanding). */
  blocking: boolean;
  /** Human-readable summary suitable for the rejection error message. */
  summary: string;
}

/**
 * Probe whether an org has anything that should block its deletion.
 *
 * Why this exists separately from `teardownBillingForOrg`: teardown
 * runs AFTER Better Auth commits the org delete (the org row is gone
 * by then). Any error teardown collects is forensic, not preventive —
 * Stripe is still charging the card. We need a pre-flight that runs
 * BEFORE the commit so the user gets a clean 4xx and the org survives
 * intact for them to settle billing.
 *
 * "Blocking" is conservative: ANY active sub OR ANY open invoice
 * blocks. We deliberately do NOT auto-cancel here — the operator must
 * intentionally cancel + settle before retrying the delete. Self-
 * service "delete and refund" UX can layer on top by surfacing the
 * counts and exposing the cancel/pay-invoice buttons.
 */
export async function getOrgBillingState(
  organizationId: string,
): Promise<OrgBillingState> {
  // Active local-side subscription rows. Source of truth for "what
  // this org owes us" — Stripe-side cancel may not have reached us
  // yet, but our row is what the UI shows.
  const activeSubs = await db
    .select({ id: schema.billingSubscription.id })
    .from(schema.billingSubscription)
    .where(
      and(
        eq(schema.billingSubscription.organizationId, organizationId),
        inArray(schema.billingSubscription.status, [...CANCELLABLE_STATUSES]),
      ),
    );
  const activeSubscriptionCount = activeSubs.length;

  // Stripe-side open invoices. Only callable when we actually have a
  // customer; an org that was never billed (no customer) cannot have
  // open invoices by definition. limit=100 matches Stripe's max page
  // — orgs with >100 open invoices are pathological and we treat the
  // count as ≥100 (still strictly blocking).
  let openInvoiceCount = 0;
  let openInvoiceAmountCents = 0;
  const org = await repos.organization.findById(organizationId);
  if (org?.stripeCustomerId) {
    const invoices = await stripe().invoices.list({
      customer: org.stripeCustomerId,
      status: "open",
      limit: 100,
    });
    openInvoiceCount = invoices.data.length;
    for (const inv of invoices.data) {
      openInvoiceAmountCents += inv.amount_due ?? 0;
    }
  }

  const blocking = activeSubscriptionCount > 0 || openInvoiceCount > 0;

  const parts: string[] = [];
  if (activeSubscriptionCount > 0) {
    parts.push(
      `${activeSubscriptionCount} active subscription${activeSubscriptionCount === 1 ? "" : "s"}`,
    );
  }
  if (openInvoiceCount > 0) {
    const dollars = (openInvoiceAmountCents / 100).toFixed(2);
    parts.push(
      `${openInvoiceCount} open invoice${openInvoiceCount === 1 ? "" : "s"} totaling $${dollars}`,
    );
  }
  const summary =
    parts.length > 0 ? parts.join(" and ") : "no outstanding billing";

  return {
    activeSubscriptionCount,
    openInvoiceCount,
    openInvoiceAmountCents,
    blocking,
    summary,
  };
}

export interface BillingTeardownResult {
  /** Stripe subscriptions we successfully cancelled (Stripe-side). */
  subscriptionsCancelled: number;
  /** Stripe subscriptions we tried to cancel but Stripe rejected (already gone, etc.). */
  subscriptionsFailed: number;
  /**
   * True when the Oblien namespace was both suspended AND deleted
   * (clean shutdown). False on any failure OR when the org never
   * had a namespace provisioned.
   */
  namespaceDecommissioned: boolean;
  /** True when the Stripe customer was deleted (gated by env flag). */
  customerDeleted: boolean;
  /** Per-step error messages for the audit row. Empty array on full success. */
  errors: string[];
}

/**
 * Resource-scoped idempotency key for one-shot teardown mutations.
 * No time bucket: teardown happens once per org over its lifetime,
 * and a retry days later should still collapse onto the same Stripe
 * cancellation (Stripe will return 404 if the sub is already gone,
 * which we catch below).
 */
function teardownKey(orgId: string, resource: string): string {
  return `teardown:${orgId}:${resource}`;
}

/**
 * Tear down billing-side state for a deleted organization. Safe to
 * call from any path; tolerates orgs without billing state.
 *
 * Order of operations matters:
 *   1. Cancel Stripe subscriptions FIRST so the org stops accruing
 *      charges immediately even if Oblien teardown stalls.
 *   2. Suspend the Oblien namespace BEFORE deleting it — a graceful
 *      stop avoids dangling workspace tasks that Oblien's delete
 *      would otherwise terminate uncleanly.
 *   3. Delete the namespace (with `deleteWorkspaces: true`) to
 *      release storage + scheduled jobs.
 *   4. Optionally delete the Stripe customer (gated, see header).
 *
 * Errors are accumulated into the returned `errors` array — we do
 * NOT throw on partial failure because the auth hook already
 * committed the org deletion. The auth hook is expected to write the
 * returned summary into an audit row.
 */
export async function teardownBillingForOrg(
  organizationId: string,
): Promise<BillingTeardownResult> {
  const result: BillingTeardownResult = {
    subscriptionsCancelled: 0,
    subscriptionsFailed: 0,
    namespaceDecommissioned: false,
    customerDeleted: false,
    errors: [],
  };

  // ── 1. Stripe subscriptions ──────────────────────────────────────
  // We read from local rows rather than Stripe's customer.list because
  // the org may have been hard-deleted before we get here — the local
  // billing_subscription rows are the canonical source of "what was
  // owed to this org".
  const subs = await db
    .select({
      stripeSubscriptionId: schema.billingSubscription.stripeSubscriptionId,
      status: schema.billingSubscription.status,
    })
    .from(schema.billingSubscription)
    .where(
      and(
        eq(schema.billingSubscription.organizationId, organizationId),
        inArray(schema.billingSubscription.status, [...CANCELLABLE_STATUSES]),
      ),
    );

  for (const sub of subs) {
    try {
      await stripe().subscriptions.cancel(
        sub.stripeSubscriptionId,
        // No proration — Stripe defaults to refunding unused time
        // which is the wrong default for "we deleted the org, the
        // user agreed via account-deletion UX". Operators can issue
        // partial refunds manually if needed.
        { prorate: false },
        { idempotencyKey: teardownKey(organizationId, `sub:${sub.stripeSubscriptionId}`) },
      );
      result.subscriptionsCancelled += 1;
    } catch (err) {
      result.subscriptionsFailed += 1;
      result.errors.push(
        `Stripe subscription cancel failed (${sub.stripeSubscriptionId}): ${safeErrorMessage(err)}`,
      );
    }
  }

  // ── 2/3. Oblien namespace decommission ────────────────────────────
  const org = await repos.organization.findById(organizationId);
  if (org?.oblienNamespace) {
    try {
      // Lazy import so non-CLOUD_MODE call sites don't try to construct
      // the cloud client at module load (mirrors billing-oblien-quota).
      const { getOblienClient } = await import("../../lib/openship-cloud");
      const client = getOblienClient();

      // Best-effort suspend first. We swallow + log the error rather
      // than aborting because the subsequent delete is what frees
      // resources — suspend is the "be polite" step.
      try {
        await client.namespaces.suspend(org.oblienNamespace);
      } catch (err) {
        result.errors.push(
          `Oblien namespace suspend failed (${org.oblienNamespace}): ${safeErrorMessage(err)}`,
        );
      }

      // The actual decommission. `deleteWorkspaces: true` because we
      // never want to leave orphan workspaces behind owning the org's
      // storage volumes.
      await client.namespaces.delete(org.oblienNamespace, {
        deleteWorkspaces: true,
      });
      result.namespaceDecommissioned = true;
    } catch (err) {
      result.errors.push(
        `Oblien namespace delete failed (${org.oblienNamespace}): ${safeErrorMessage(err)}`,
      );
    }
  }

  // ── 4. Optional Stripe customer deletion (forensics gate) ────────
  // Default OFF so historical invoices remain accessible to the
  // operator. Flip BILLING_TEARDOWN_DELETE_CUSTOMER=true for hard
  // GDPR erasure flows.
  if (process.env.BILLING_TEARDOWN_DELETE_CUSTOMER === "true" && org?.stripeCustomerId) {
    try {
      await stripe().customers.del(org.stripeCustomerId, {
        idempotencyKey: teardownKey(organizationId, "customer"),
      });
      result.customerDeleted = true;
    } catch (err) {
      result.errors.push(
        `Stripe customer delete failed (${org.stripeCustomerId}): ${safeErrorMessage(err)}`,
      );
    }
  }

  return result;
}
