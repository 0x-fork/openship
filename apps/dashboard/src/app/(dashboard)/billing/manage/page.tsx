"use client";
import { useState } from "react";
import Link from "next/link";
import type { BillingOperations, ManagementState } from "@repo/contracts";
import { Icon } from "@repo/ui/icons";
import { managementApi } from "@/lib/api/management";
import {
  useResourceScope,
  useScopedMutation,
  useScopedResource,
} from "@/hooks/use-scoped-resource";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const money = (cents: number) =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
const poll = (state: ManagementState) => (state.pendingCheckout || state.change ? 5_000 : 60_000);
type Quote = Awaited<ReturnType<BillingOperations["purchaseManagement"]>>;
export default function ManagePage() {
  const scope = useResourceScope();
  return <ManagePlan key={scope} />;
}
function ManagePlan() {
  const { data, error, loading, refresh } = useScopedResource(managementApi.get, poll);
  const action = useScopedMutation();
  const [servers, setServers] = useState<number | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [cancel, setCancel] = useState(false);
  // Reuse the original key after uncertain responses; changed selections are
  // refused by the server until the saved checkout has been recovered/canceled.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const run = async <T,>(work: () => Promise<T>, onSuccess?: (result: Awaited<T>) => void) => {
    const result = await action.execute(work);
    if (result !== null) onSuccess?.(result);
    refresh();
  };
  if (loading)
    return (
      <p role="status" className="text-muted-foreground">
        Loading your management plan…
      </p>
    );
  if (!data)
    return (
      <div role="alert" className="space-y-3 rounded-2xl bg-card p-5">
        <p>{error || "Could not load your management plan."}</p>
        <Button onClick={refresh}>Try again</Button>
      </div>
    );
  const count =
    servers ??
    Math.max(data.pricing.includedServers, data.subscription?.servers ?? data.connectedServers);
  const monthly =
    (data.cloudIncluded ? 0 : data.pricing.monthlyCents) +
    Math.max(0, count - data.pricing.includedServers) * data.pricing.extraServerMonthlyCents;
  const selectedMatches =
    !!data.subscription &&
    data.subscription.status !== "canceled" &&
    count === data.subscription.servers &&
    monthly === data.subscription.priceCents;
  const purchase = () =>
    run(
      () => managementApi.purchase({ servers: count, idempotencyKey: requestKey }),
      (result) => {
        if (result.url) window.location.assign(result.url);
        else setQuote(result);
      },
    );
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        {(error || action.error) && (
          <div role="alert" className="rounded-xl bg-danger/10 p-4 text-sm text-danger">
            {action.error || error}
            <Button variant="ghost" onClick={refresh}>
              Refresh
            </Button>
          </div>
        )}
        <section className="space-y-5 rounded-2xl bg-card p-6" aria-labelledby="manage-title">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-muted p-3">
              <Icon name="server" className="size-5" />
            </span>
            <div>
              <h2 id="manage-title" className="text-xl font-medium">
                Openship Manage
              </h2>
              <p className="text-sm text-muted-foreground">
                Your servers. Our hosted control plane.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Deploy apps, manage domains, inspect logs, schedule backups and automate through the
            API, SDK or CLI. Your compute and storage stay with your provider.
          </p>
          <div>
            <span className="text-4xl font-medium">{money(monthly)}</span>
            <span className="ms-2 text-muted-foreground">/ month per workspace</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {data.cloudIncluded
              ? `${data.pricing.includedServers} connected servers are included with your paid Cloud Space.`
              : `${money(data.pricing.monthlyCents)} includes ${data.pricing.includedServers} connected servers.`}{" "}
            Additional servers cost {money(data.pricing.extraServerMonthlyCents)} each per month.
            Cloud Spaces do not use these slots.
          </p>
          <label className="block max-w-56 space-y-2 text-sm">
            <span>Connected-server allowance</span>
            <Input
              variant="filled"
              type="number"
              min={Math.max(data.pricing.includedServers, data.connectedServers)}
              max={data.pricing.maxServers}
              value={count}
              disabled={action.busy || data.pendingCheckout || !!data.change}
              onChange={(event) => {
                setServers(Number(event.target.value));
                setQuote(null);
                setRequestKey(crypto.randomUUID());
              }}
            />
          </label>
          {quote ? (
            <div className="space-y-3 rounded-xl bg-muted/50 p-4">
              <p className="font-medium">Review your change</p>
              <p className="text-sm">
                {money(quote.monthlyCents)} / month · {money(quote.amountDueNow ?? 0)} due now
              </p>
              <p className="text-sm text-muted-foreground">
                Effective{" "}
                {quote.effectiveAt ? new Date(quote.effectiveAt).toLocaleString() : "after payment"}
                . Increased allowances activate after payment is confirmed.
              </p>
              <div className="flex gap-3">
                <Button
                  disabled={action.busy}
                  onClick={() =>
                    void run(
                      () => managementApi.confirm(quote.quoteId!),
                      (result) => {
                        setQuote(null);
                        if (result.change?.paymentUrl)
                          window.location.assign(result.change.paymentUrl);
                      },
                    )
                  }
                >
                  Confirm change
                </Button>
                <Button
                  variant="secondary"
                  disabled={action.busy}
                  onClick={() => {
                    setQuote(null);
                    setRequestKey(crypto.randomUUID());
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            !data.pendingCheckout &&
            !data.change &&
            monthly > 0 && (
              <Button
                disabled={
                  action.busy ||
                  !data.purchasesAvailable ||
                  selectedMatches ||
                  (data.subscription?.status !== "canceled" &&
                    !!data.subscription?.cancelAtPeriodEnd) ||
                  !Number.isInteger(count) ||
                  count < Math.max(data.pricing.includedServers, data.connectedServers) ||
                  count > data.pricing.maxServers
                }
                onClick={() => void purchase()}
              >
                {action.busy
                  ? "Checking…"
                  : selectedMatches
                    ? "Current allowance"
                    : data.subscription && data.subscription.status !== "canceled"
                      ? "Review change"
                      : "Continue to checkout"}
              </Button>
            )
          )}
          {!data.purchasesAvailable && (
            <p className="text-sm text-muted-foreground">
              New purchases are not available yet. Existing paid access and cancellation remain
              available.
            </p>
          )}
        </section>
        {data.pendingCheckout && (
          <section className="space-y-3 rounded-2xl bg-card p-5">
            <h3 className="font-medium">Your checkout is saved</h3>
            <p className="text-sm text-muted-foreground">
              Complete payment or cancel it before choosing another allowance. Payment confirmation
              may take a moment.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={action.busy}
                onClick={() =>
                  void run(managementApi.resumeCheckout, (result) => {
                    if (result.url) window.location.assign(result.url);
                  })
                }
              >
                Resume checkout
              </Button>
              <Button
                variant="secondary"
                disabled={action.busy}
                onClick={() =>
                  void run(managementApi.cancelCheckout, () => {
                    setRequestKey(crypto.randomUUID());
                  })
                }
              >
                Cancel checkout
              </Button>
            </div>
          </section>
        )}
        {data.change && (
          <section className="space-y-3 rounded-2xl bg-card p-5">
            <h3 className="font-medium">
              Subscription change · {data.change.status.replaceAll("_", " ")}
            </h3>
            <p className="text-sm text-muted-foreground">
              Effective {new Date(data.change.effectiveAt).toLocaleString()}. Your current paid
              allowance remains available until the change completes.
            </p>
            <div className="flex gap-3">
              {data.change.paymentUrl && (
                <Button asChild>
                  <a href={data.change.paymentUrl}>Complete payment</a>
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={action.busy}
                onClick={() =>
                  void run(managementApi.cancelChange, () => {
                    setRequestKey(crypto.randomUUID());
                  })
                }
              >
                Cancel change
              </Button>
            </div>
          </section>
        )}
        <section className="space-y-3 rounded-2xl bg-card p-5">
          <h3 className="font-medium">Need dedicated hardware?</h3>
          <p className="text-sm text-muted-foreground">
            Get a quote for a physical server with managed deployment and support. Hardware, region,
            capacity and support terms are confirmed before purchase.
          </p>
          <Button asChild variant="secondary">
            <a
              href={`mailto:${data.pricing.dedicatedContact}?subject=Dedicated%20Openship%20hosting`}
            >
              Request a quote
            </a>
          </Button>
        </section>
      </div>
      <aside className="space-y-4 xl:sticky xl:top-6">
        <section className="space-y-4 rounded-2xl bg-card p-5">
          <h3 className="font-medium">Your infrastructure</h3>
          <p>
            <span className="text-3xl font-medium">{data.connectedServers}</span>
            <span className="ms-2 text-muted-foreground">of {data.serverLimit} servers</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {data.active
              ? "Management is active for your paid allowance."
              : "Connect a server after your management plan activates."}
          </p>
          {data.active && (
            <Button asChild className="w-full">
              <Link href={data.connectedServers < data.serverLimit ? "/servers/new" : "/servers"}>
                {data.connectedServers < data.serverLimit
                  ? "Connect a server"
                  : "View your servers"}
              </Link>
            </Button>
          )}
        </section>
        {data.subscription && (
          <section className="space-y-3 rounded-2xl bg-card p-5">
            <h3 className="font-medium">Subscription</h3>
            <p className="text-sm">
              {money(data.subscription.priceCents)} / month ·{" "}
              {data.subscription.status.replaceAll("_", " ")}
            </p>
            {data.subscription.periodEnd && (
              <p className="text-sm text-muted-foreground">
                {data.subscription.cancelAtPeriodEnd ? "Ends" : "Current period ends"}{" "}
                {new Date(data.subscription.periodEnd).toLocaleDateString()}
              </p>
            )}
            {data.cloudIncluded && !data.subscription.baseIncluded && (
              <p className="text-sm text-muted-foreground">
                Cloud includes the base allowance. Your separate base fee ends at renewal; any
                extra-server charge retains its saved terms.
              </p>
            )}
            {!data.cloudIncluded && data.subscription.baseIncluded && (
              <p className="text-sm text-muted-foreground">
                Your Cloud coverage ended. This paid allowance lasts until the date above and will
                not renew at the discounted price. Choose Manage after it ends; we will not raise
                your charge automatically.
              </p>
            )}
            <Button
              variant="secondary"
              disabled={action.busy}
              onClick={() =>
                void run(managementApi.portal, (result) => {
                  window.location.assign(result.portalUrl);
                })
              }
            >
              Payment details & invoices
            </Button>
            {data.subscription.status !== "canceled" &&
              (data.subscription.cancelAtPeriodEnd ? (
                <Button
                  variant="ghost"
                  disabled={action.busy || data.cloudIncluded !== data.subscription.baseIncluded}
                  onClick={() => void run(managementApi.resume)}
                >
                  Resume renewal
                </Button>
              ) : (
                <Button variant="ghost" disabled={action.busy} onClick={() => setCancel(true)}>
                  Cancel renewal
                </Button>
              ))}
            {cancel && (
              <div className="space-y-3 rounded-xl bg-muted/50 p-4">
                <p className="text-sm">
                  End management after the paid period? Your apps and data keep running on your
                  servers. Openship will no longer manage them after your allowance ends.
                </p>
                <Button
                  disabled={action.busy}
                  onClick={() =>
                    void run(managementApi.cancel, () => {
                      setCancel(false);
                    })
                  }
                >
                  Confirm cancellation
                </Button>
                <Button variant="ghost" disabled={action.busy} onClick={() => setCancel(false)}>
                  Keep subscription
                </Button>
              </div>
            )}
          </section>
        )}
        <section className="space-y-2 rounded-2xl bg-card p-5">
          <h3 className="font-medium">Prefer to self-host?</h3>
          <p className="text-sm text-muted-foreground">
            Run the full Openship control plane yourself for free. Manage pays for our hosted
            control plane and product support; it does not include compute, storage or a dedicated
            operations team.
          </p>
          <a href="https://openship.io/docs" className="text-sm underline underline-offset-4">
            Self-hosting guide
          </a>
        </section>
      </aside>
    </div>
  );
}
