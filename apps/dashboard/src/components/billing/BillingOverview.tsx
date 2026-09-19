"use client";

import { BillingSubscriptionControls } from "./BillingSubscriptionControls";
import { BillingCapacity } from "./BillingCapacity";
import { CloudUsageGuide } from "./CloudUsageGuide";
import { formatBillingNumber, formatMilliCredits } from "@/lib/billing-usage";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Sparkles } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { PLAN_IDS, PLANS, type PlanTierId } from "@repo/core";
import { api } from "@/lib/api/client";
import { useI18n, interpolate } from "@/components/i18n-provider";
import type { BillingState } from "@/lib/api/billing";

export type { BillingState };

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * Legacy compatibility — older callers (and the mock data layer) still
 * import `BillingData`. The two shapes diverged when we switched to the
 * credits model; keep the alias so the file's named exports stay stable
 * while the rest of the dashboard migrates.
 */
export type BillingData = BillingState;

interface BillingOverviewProps {
  state: BillingState;
}

interface UsageBucket {
  timestamp: string;
  credits: number;
}

interface UsageResponse {
  data: {
    from: string;
    to: string;
    groupBy: "hour" | "day";
    usage: { buckets: UsageBucket[] } | null;
  };
}

interface TopupPack {
  id: string;
  name: string;
  credits_milli: number;
  price_cents: number;
  stripePriceId: string;
  sortOrder: number;
}

interface TopupPacksResponse {
  data: TopupPack[];
}

interface TopupCheckoutResponse {
  data: { checkoutUrl: string };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function statusPillClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "active") return "bg-success-bg text-success border-success-border";
  if (s === "past_due" || s === "unpaid") return "bg-danger-bg text-danger border-danger-border";
  // `credit_exhausted` means Oblien has STOPPED this org's workloads. It fell through
  // to the neutral pill below, so the state where nothing is running looked no more
  // urgent than a tidy cancellation.
  if (s === "credit_exhausted") return "bg-danger-bg text-danger border-danger-border";
  if (s === "canceled" || s === "cancelled") return "bg-muted text-muted-foreground border-border";
  return "bg-muted text-muted-foreground border-border";
}

/* ------------------------------------------------------------------ */
/*  Upgrade button (kept exported — used elsewhere)                   */
/* ------------------------------------------------------------------ */

export function UpgradeButton({ children, onClick, className = "" }: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-primary-foreground transition-all ${className}`}
    >
      <span className="pointer-events-none absolute -inset-[1px] rounded-xl bg-gradient-to-r from-primary via-blue-500 to-violet-500 opacity-40 blur-[1px] transition-opacity group-hover:opacity-60" />
      <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary to-primary/90" />
      <span className="relative flex items-center gap-1.5">{children}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent-activity sparkline                                          */
/* ------------------------------------------------------------------ */

function RecentActivityCard() {
  const { t, locale } = useI18n();
  const [buckets, setBuckets] = useState<UsageBucket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const to = new Date();
        const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
        const qs = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
          groupBy: "day",
        });
        const res = await api.get<UsageResponse>(`billing/usage?${qs.toString()}`);
        if (cancelled) return;
        setBuckets(res.data.usage?.buckets ?? []);
      } catch {
        if (!cancelled) setError(t.billing.overview.usageError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const data = (buckets ?? []).map((b) => ({
    timestamp: b.timestamp,
    credits: b.credits,
  }));

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t.billing.overview.recentActivity}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.billing.overview.last7Days}{!loading && !error && ` · ${formatBillingNumber(data.reduce((sum, point) => sum + point.credits, 0), locale)} ${t.billing.usage.kpi.credits}`}</p>
        </div>
        <Link
          href="/billing/usage"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {t.billing.overview.viewFullUsage}
          <ArrowUpRight className="size-3" />
        </Link>
      </div>

      <div className="h-20">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {error}
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t.billing.overview.noUsageYet}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="credits"
                stroke="var(--primary)"
                strokeWidth={1.75}
                fill="url(#sparkFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick-buy credit packs                                            */
/* ------------------------------------------------------------------ */

function BuyCreditsCard({ available }: { available: boolean }) {
  const { t, locale } = useI18n();
  const [packs, setPacks] = useState<TopupPack[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get<TopupPacksResponse>("billing/topup-packs");
        if (cancelled) return;
        const sorted = [...res.data].sort((a, b) => a.sortOrder - b.sortOrder);
        setPacks(sorted.slice(0, 2));
      } catch {
        if (!cancelled) setError(t.billing.overview.packsError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleBuy(packId: string) {
    setBuyingPackId(packId);
    try {
      const res = await api.post<TopupCheckoutResponse>("billing/topup", { packId, idempotencyKey: crypto.randomUUID() });
      window.location.href = res.data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : t.billing.overview.checkoutError);
      setBuyingPackId(null);
    }
  }

  // Buy is enabled ONLY when Openship Cloud reports top-ups available; otherwise
  // packs render as a dimmed "coming soon" preview.
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{t.billing.overview.needMoreCredits}</h3>
            {!available && (
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t.billing.pricing.comingSoon}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t.billing.overview.oneTimeTopups}
          </p>
        </div>
        <Link
          href="/billing/topups"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {t.billing.overview.seeAllPacks}
          <ArrowUpRight className="size-3" />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="py-4 text-xs text-muted-foreground">{error}</p>
      ) : !packs || packs.length === 0 ? (
        <p className="py-4 text-xs text-muted-foreground">{t.billing.overview.noPacks}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {packs.map((pack) => {
            const body = (
              <>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {interpolate(t.billing.overview.creditsAmount, { n: formatMilliCredits(pack.credits_milli, locale) })}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {interpolate(t.billing.overview.oneTime, { price: formatDollars(pack.price_cents) })}
                  </p>
                </div>
                <span
                  className={`ms-3 inline-flex shrink-0 items-center gap-1 ${
                    available
                      ? "text-xs font-medium text-primary"
                      : "rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                  }`}
                >
                  {available ? (
                    buyingPackId === pack.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <>
                        {t.billing.overview.buy}
                        <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </>
                    )
                  ) : (
                    t.billing.pricing.comingSoon
                  )}
                </span>
              </>
            );
            return available ? (
              <button
                key={pack.id}
                onClick={() => handleBuy(pack.id)}
                disabled={buyingPackId !== null}
                className="group flex items-center justify-between rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-start transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {body}
              </button>
            ) : (
              <div
                key={pack.id}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-background/40 px-4 py-3 opacity-70"
              >
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Plan card — the primary surface (subscription first)               */
/* ------------------------------------------------------------------ */

/**
 * Subscription-first lead card: the tier the org is on, its status, the
 * included Cloud credit allowance, and the
 * upgrade / manage entry point. Credits balance is the secondary card below —
 * general credits exist but aren't the first thing the user sees.
 */
/**
 * The next tier up the published ladder, or undefined at the top.
 *
 * Read from `PLAN_IDS` so inserting a tier into the catalog cannot skip it, and
 * the negotiated top tier is excluded — its card is a sales conversation, not an
 * upgrade button. Mirrors the derivation the sidebar previously owned; it lives
 * here now because this is the one place that offers an upgrade.
 */
function nextPaidPlan(tier: PlanTierId): PlanTierId | undefined {
  const at = PLAN_IDS.indexOf(tier);
  const next = at < 0 ? undefined : PLAN_IDS[at + 1];
  return next && !PLANS[next].contactSales ? next : undefined;
}

function PlanCard({ state }: { state: BillingState }) {
  const { t, locale } = useI18n();
  const plan = state.plan === undefined ? PLANS[state.tier] : state.plan;
  const planName = plan?.name ?? state.tier;
  const isFree = state.tier === "free";
  const allowance = state.subscription?.interval === "annual" ? state.plan?.annualCredits : state.monthlyCreditLimit;
  // The tier one step up the published ladder — the same derivation the sidebar
  // used to do. Hardcoding "Pro" here was what put two DIFFERENT upgrade offers on
  // one screen, and it would have named the wrong tier the moment a plan was
  // inserted into the ladder.
  const nextTier = nextPaidPlan(state.tier);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              {isFree ? t.billing.resourcesGuide.noPlan : interpolate(t.billing.overview.planLabel, { name: planName })}
            </h2>
            {!isFree && <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusPillClass(state.status)}`}
            >
              {(t.billing.sidebar.statuses as Record<string, string>)[state.status] ?? state.status.replace(/_/g, " ")}
            </span>}
          </div>
          {(isFree || plan?.description) && (
            <p className="mt-1 text-sm text-muted-foreground">{isFree ? t.billing.resourcesGuide.setupHint : plan?.description}</p>
          )}
        </div>

        {isFree && nextTier ? (
          <Link
            href="/billing/plans"
            className="relative inline-flex w-fit items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <span className="pointer-events-none absolute -inset-[1px] rounded-xl bg-gradient-to-r from-primary via-blue-500 to-violet-500 opacity-40 blur-[1px] transition-opacity hover:opacity-60" />
            <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary to-primary/90" />
            <span className="relative flex items-center gap-1.5">
              <Sparkles className="size-3.5" />
              {t.billing.tabs.plans}
            </span>
          </Link>
        ) : (
          <Link
            href="/billing/plans"
            className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            {t.billing.tabs.plans}
            <ArrowUpRight className="size-3" />
          </Link>
        )}
      </div>

      {/* The tier's ALLOWANCE stays — it is the one number this card is about.
          The feature bullets moved to the right column ("What's included"), where
          they read as a list instead of a wrapped hedge of pills, and where they
          no longer compete with this card's status and CTA. */}
      {!isFree && allowance != null && (
        <div className="mt-4">
          <span className="inline-flex items-center rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {interpolate(t.billing.resourcesGuide.creditsPerCycle, { amount: formatMilliCredits(allowance, locale) })}
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export const BillingOverview: React.FC<BillingOverviewProps> = ({ state }) => {
  return (
    <div className="flex flex-col gap-5">
      {/* Subscription/tier leads; credits balance is secondary. */}
      <PlanCard state={state} />
      <BillingSubscriptionControls state={state} />
      <BillingCapacity state={state} />
      <CloudUsageGuide />
      {state.tier !== "free" && <>
        <RecentActivityCard />
        <BuyCreditsCard available={state.topups?.available === true} />
      </>}
    </div>
  );
};
