/**
 * Billing controller — Stripe-backed cloud billing endpoints.
 *
 * Every authed route below is org-scoped: the billing customer +
 * subscription rows live on the organization, not the user. The
 * dashboard's active-org context is set by `authMiddleware` and
 * surfaced via `getRequestContext(c).organizationId`.
 *
 * Stub paths from the early scaffold (manual payment-method/invoice
 * CRUD, free-form usage recording) are NOT re-introduced — Stripe
 * Portal owns the invoice/PM list, and the Oblien usage sync is the
 * only writer to `credit_consumption`. The endpoints below cover what
 * the dashboard actually needs.
 */

import type { ExecutionContext } from "../../../context";
import { ValidationError, normalizeBillingCreditPacks, type BillingOperations } from "@repo/contracts";
import { listAuthorizedProjects } from "../../lib/authorized-projects";
import {
  CREDIT_PACKS,
  ANNUAL_ENABLED,
  ANNUAL_MONTHS_FREE,
  FREE_DOMAIN_SUFFIX,
  effectiveMonthlyPrice,
  pricingUi,
  resolvePlans,
  toPricingLocale,
} from "@repo/core";
import { getFreeSubdomainUsage, listFreeSubdomains } from "@repo/platform/engine/lib/plan-guard";
import * as billingService from "@repo/platform/engine/modules/billing/billing.service";
import * as billingRepository from "@repo/platform/engine/modules/billing/billing.repository";
import { getNamespaceUsage } from "@repo/platform/engine/modules/billing/billing-oblien-quota";

/* ---------- Plans (public) ---------- */

/**
 * Serve the pricing catalog in the caller's language.
 *
 * Locale precedence is `?locale=` → `Accept-Language` → English, because the two
 * callers differ: the dashboard knows the reader's chosen locale (a cookie the
 * browser won't send us as a language header) and passes it explicitly, while
 * anything else gets a sensible default from the header. `toPricingLocale`
 * narrows any unsupported value to English rather than 404ing a price list.
 *
 * `features` come back as finished localized strings with the plan's own numbers
 * already interpolated and formatted for the locale — clients render them
 * verbatim. `limits` ships alongside so a client can draw a meter against the
 * exact number enforcement uses. Prices stay integer CENTS; formatting is the
 * client's job. Route is public and mounted in every mode.
 */
export async function listPlans(input: NonNullable<Parameters<BillingOperations["listPlans"]>[0]>) {
  const locale = toPricingLocale(
    input.locale ?? null,
  );

  // Campaign windows are evaluated per REQUEST, never at module load, so an
  // offer starting or expiring takes effect without a redeploy.
  const now = new Date();

  const plans = resolvePlans(locale).map((p) => {
    const { listCents, effectiveCents, campaign } = effectiveMonthlyPrice(p.id, now);
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      popular: p.popular,
      // `price` stays the LIST price so existing clients keep working and the
      // struck-through number is available; `effectivePrice` is what's charged.
      price: p.price, // { monthly: cents|null, annual: cents|null }
      effectivePrice: { monthly: effectiveCents },
      // The coupon env name is deliberately NOT exposed — clients never need it
      // and it is server config.
      campaign: campaign
        ? {
            id: campaign.id,
            percentOff: campaign.percentOff,
            durationMonths: campaign.durationMonths,
            endsAt: campaign.endsAt,
          }
        : null,
      listPrice: { monthly: listCents },
      monthlyCredits: p.monthlyCredits,
      // `oblienLimits` is deliberately NOT published. It is internal provisioning
      // detail (and, since the ceilings are derived to fit the build machine, it
      // also discloses that spec) with zero client consumers — both panels that
      // once read it were removed in favour of the customer-facing `limits`.
      limits: p.limits,
      features: p.features,
      // Published alongside `features`, not folded into it: it is the "Everything in
      // X, plus:" lead-in, and a client that renders the bullet list with a
      // checkmark per item must not put one beside a transition.
      inheritedFrom: p.inheritedFrom ?? null,
      support: p.support,
      contactSales: p.contactSales ?? null,
    };
  });

  // Cacheable: the response is identical for every caller of a given locale, and
  // the handler is pure in-memory catalog resolution (no DB, no Stripe). The only
  // thing that changes it mid-window is a campaign boundary, so the shared TTL is
  // capped at 5 minutes — a campaign can start or end up to that late, the same
  // tradeoff the marketing page's revalidate window makes. `Vary` is required
  // because the payload is localized and a shared cache must not serve Arabic copy
  // to an English reader.

  return {
      locale,
      annual: { enabled: ANNUAL_ENABLED, monthsFree: ANNUAL_MONTHS_FREE },
      ui: pricingUi(locale),
      plans,
    };
}

/* ---------- Billing state (dashboard overview) ---------- */

export async function getState(ctx: ExecutionContext) {
  const state = await billingRepository.getBillingState(ctx.organizationId);
  return state;
}

/* ---------- Subscriptions ---------- */

export async function createSubscription(ctx: ExecutionContext, input: NonNullable<Parameters<BillingOperations["createSubscription"]>[0]>) {
  const { planTierId, interval } = input;

  const { checkoutUrl } = await billingService.createCheckoutSession(
    ctx,
    planTierId,
    interval,
  );

  return { checkoutUrl };
}

export async function cancelSubscription(ctx: ExecutionContext) {
  const result = await billingService.cancelSubscription(ctx.organizationId);
  return result;
}

/* ---------- Top-ups ---------- */

export async function createTopup(ctx: ExecutionContext, input: NonNullable<Parameters<BillingOperations["createTopup"]>[0]>) {
  const { packId } = input;

  const { checkoutUrl } = await billingService.createTopupCheckoutSession(
    ctx,
    packId,
  );

  return { checkoutUrl };
}

/**
 * Active top-up packs surfaced in the dashboard. Reads from the
 * synced `credit_pack` table; falls back to the in-code `CREDIT_PACKS`
 * constant if the sync hasn't run yet (first-boot bootstrap path).
 */
export async function listTopupPacks(ctx: ExecutionContext) {

  // `explains` ("≈ 83 hours of a small app, or 625 build minutes") is a DERIVED
  // display string, not a column — it comes from the catalog's own rates so it
  // can't drift from what a credit actually buys. The synced `credit_pack` rows
  // therefore don't carry it, and it has to be grafted on whichever source wins
  // below, or the DB path silently loses the one line that makes a pack legible.
  const explainsById = new Map(CREDIT_PACKS.map((p) => [p.id, p.explains]));
  const withExplains = <T extends { id: string }>(rows: T[]) =>
    rows.map((row) => ({ ...row, explains: explainsById.get(row.id) ?? null }));

  const packs = await billingService.listActiveCreditPacks();
  if (packs.length > 0) return normalizeBillingCreditPacks(withExplains(packs));
  return normalizeBillingCreditPacks(withExplains([...CREDIT_PACKS]));
}

/* ---------- Allowance detail (what is using my quota) ---------- */

/**
 * ITEMIZE the allowances a user can act on — currently the free `*.opsh.io`
 * subdomains.
 *
 * The capacity meters answer "how much of my quota is gone"; this answers "gone
 * WHERE", which is the only version a user can do anything about. Before this
 * there was no way to find out: the dashboard's domains page is a stub,
 * `GET /api/domains` requires a `projectId`, and `openship domain list` requires
 * `--project` — so a free subdomain created by a CLI deploy into a since-forgotten
 * project silently consumed a slot with nothing to enumerate it.
 *
 * Each row carries its `domainId` so a client can offer Release directly.
 */
export async function listAllowanceDetail(ctx: ExecutionContext) {

  const [usage, slots] = await Promise.all([
    getFreeSubdomainUsage(ctx.organizationId),
    listFreeSubdomains(ctx.organizationId),
  ]);
  const restrictedProjects = ctx.tokenScope || ctx.role === "restricted"
    ? new Set((await listAuthorizedProjects(ctx, ctx.organizationId)).map(project => project.id)) : null;

  return {
      freeSubdomains: {
        used: usage.used,
        limit: usage.limit,
        remaining: usage.remaining,
        suffix: FREE_DOMAIN_SUFFIX,
        items: slots.filter(s => !restrictedProjects || (s.projectId && restrictedProjects.has(s.projectId))).map((s) => ({
          domainId: s.domainId,
          hostname: s.hostname,
          projectId: s.projectId,
          projectName: s.projectName,
          projectSlug: s.projectSlug,
          serviceId: s.serviceId,
          createdAt: s.createdAt,
        })),
      },
    };
}

/* ---------- Portal ---------- */

export async function createPortal(ctx: ExecutionContext) {
  const { portalUrl } = await billingService.createPortalSession(ctx.organizationId);
  return { portalUrl };
}

/* ---------- Raw metered usage (buckets + totals) ---------- */

/**
 * Proxy to Oblien's `namespaces.usageUnits` rollup. Powers the
 * dashboard's usage chart and the credits-spent breakdown.
 *
 * Query params (all optional, ISO8601):
 *   - `from`  default: 30 days ago
 *   - `to`    default: now
 *   - `groupBy` "hour" | "day", default "day"
 *
 * Returns the resolved range echoed back alongside Oblien's payload
 * so the chart doesn't have to re-derive the window when the caller
 * relied on defaults. `usage` is `null` when the org has no namespace
 * yet — the dashboard renders an empty state in that case.
 */
export async function getUsage(ctx: ExecutionContext, input: NonNullable<Parameters<BillingOperations["getUsage"]>[0]>) {

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const fromParam = input.from;
  const toParam = input.to;
  const from = fromParam ? new Date(fromParam) : thirtyDaysAgo;
  const to = toParam ? new Date(toParam) : now;

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return invalidInput("Invalid `from` or `to` — expected ISO8601");
  }

  if (to < from) throw new ValidationError("Range end must not precede its start");
  if (to.getTime() - from.getTime() > 366 * 86_400_000) throw new ValidationError("Billing usage ranges cannot exceed 366 days");
  const groupByParam = input.groupBy;
  if (groupByParam && groupByParam !== "hour" && groupByParam !== "day") {
    return invalidInput("Invalid `groupBy` — expected \"hour\" or \"day\"");
  }
  const groupBy: "hour" | "day" = groupByParam === "hour" ? "hour" : "day";

  const usage = await getNamespaceUsage({
    organizationId: ctx.organizationId,
    from,
    to,
    groupBy,
  });

  return {
      from: from.toISOString(),
      to: to.toISOString(),
      groupBy,
      usage,
    };
}

/* ---------- Subscription getter ---------- */

/**
 * Subscription-only sub-slice of the billing state. Kept separate from
 * `getState` so callers (and the local proxy) can poll just the
 * subscription row without re-fetching the credit balance.
 */
export async function getSubscription(ctx: ExecutionContext) {
  const state = await billingRepository.getBillingState(ctx.organizationId);
  return {
      tier: state.tier,
      status: state.status,
      currentPeriod: state.currentPeriod,
    };
}
function invalidInput(message: string): never { throw new ValidationError(message); }
