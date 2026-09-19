"use client";

import { BillingSubscriptionControls } from "./BillingSubscriptionControls";
import { BillingCapacity } from "./BillingCapacity";
import { CloudUsageGuide } from "./CloudUsageGuide";
import { CloudActivationSteps } from "./CloudActivationSteps";
import { randomUUID } from "@/lib/random-uuid";
import { formatBillingNumber, formatMilliCredits } from "@/lib/billing-usage";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
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
      const res = await api.post<TopupCheckoutResponse>("billing/topup", { packId, idempotencyKey: randomUUID() });
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

export const BillingOverview: React.FC<BillingOverviewProps> = ({ state }) => (
  <div className="flex flex-col gap-5">
    <BillingCapacity state={state} />
    {state.tier === "free" ? <CloudActivationSteps /> : <>
      <BillingSubscriptionControls state={state} />
      <RecentActivityCard />
      {state.topups?.available && <BuyCreditsCard available />}
    </>}
    <CloudUsageGuide collapsible />
  </div>
);
