"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePlatform } from "@/context/PlatformContext";
import { useCloud } from "@/context/CloudContext";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { billingApi, type BillingState } from "@/lib/api/billing";
import { getActiveOrganizationId, subscribeActiveOrganization } from "@/lib/api/client";
import { formatMilliCredits } from "@/lib/billing-usage";

type Snapshot = { scope: string; value: BillingState };

/** Read-only warnings. Oblien alone computes the alert and enforces the balance. */
export function CloudCreditAlert() {
  const { user } = useAuth();
  const { selfHosted } = usePlatform();
  const { connected } = useCloud();
  const organizationId = useSyncExternalStore(
    subscribeActiveOrganization,
    getActiveOrganizationId,
    () => null,
  );
  const scope = user && organizationId ? `${user.id}:${organizationId}` : null;
  const enabled = !!scope && (!selfHosted || connected);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    setSnapshot(null);
    if (!enabled || !scope) return;
    let disposed = false,
      pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const value = await billingApi.getBillingState();
        if (!disposed && organizationId === getActiveOrganizationId())
          setSnapshot({ scope, value });
      } catch {
        // Revocation, provider downtime and unknown state never become a warning
        // about some previously selected customer's balance.
        if (!disposed) setSnapshot(null);
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, scope, organizationId]);

  if (!enabled || snapshot?.scope !== scope || !organizationId || !user) return null;
  return (
    <CreditAlertNotice
      key={scope}
      state={snapshot.value}
      organizationId={organizationId}
      userId={user.id}
    />
  );
}

export function CreditAlertNotice({
  state,
  organizationId,
  userId,
}: {
  state: BillingState;
  organizationId: string;
  userId: string;
}) {
  const { t, locale } = useI18n();
  const copy = t.billing.creditAlert;
  const alert = state.creditAlert;
  // Explicit allowances and purchased credits can exist without a hosted plan.
  // Only a fresh, unfunded setup namespace should suppress the zero-credit prompt.
  const hasCreditHistory =
    state.tier !== "free" || (alert?.limit ?? 0) > 0 || (state.balance.quotaUsed ?? 0) > 0;
  const visible = hasCreditHistory && alert && ["low", "grace", "depleted"].includes(alert.state);
  const attention =
    alert?.state === "depleted" ||
    alert?.state === "grace" ||
    (alert?.state === "low" &&
      alert.threshold != null &&
      alert.threshold === alert.thresholds.at(-1));
  const key = visible
    ? JSON.stringify([
        userId,
        organizationId,
        alert.namespace,
        state.currentPeriod.end,
        alert.limit,
        alert.state,
        alert.threshold,
      ])
    : null;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!key || !attention) {
      setOpenKey(null);
      return;
    }
    let dismissed = dismissedKey === key;
    try {
      dismissed ||= sessionStorage.getItem(`openship.creditAlert:${key}`) === "1";
    } catch {
      /* memory fallback */
    }
    if (!dismissed) setOpenKey(key);
  }, [key, attention, dismissedKey]);
  if (!visible || !alert || !key) return null;
  const close = () => {
    setOpenKey(null);
    setDismissedKey(key);
    try {
      sessionStorage.setItem(`openship.creditAlert:${key}`, "1");
    } catch {
      /* memory fallback */
    }
  };
  const title =
    alert.state === "depleted"
      ? copy.exhaustedTitle
      : alert.state === "grace"
        ? copy.graceTitle
        : copy.lowTitle;
  const description =
    alert.state === "depleted"
      ? copy.exhaustedDescription
      : interpolate(alert.state === "grace" ? copy.graceDescription : copy.lowDescription, {
          percent: String(alert.percent ?? ""),
          credits: formatMilliCredits(
            Math.max(0, (alert.state === "grace" ? alert.balance : alert.remaining) ?? 0),
            locale,
          ),
        });
  const canTopUp = state.billing?.enabled && state.topups?.available;
  const href = `/cloud-billing?organizationId=${encodeURIComponent(organizationId)}&tab=${canTopUp ? "topups" : "overview"}`;
  const action = canTopUp ? copy.buyCredits : copy.openBilling;
  return (
    <>
      <div
        role="status"
        className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-sm sm:px-6 ${alert.state === "depleted" ? "border-danger-border bg-danger-bg" : "border-warning-border bg-warning-bg"}`}
      >
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 break-words">{description}</p>
        </div>
        <a href={href} className="shrink-0 rounded-lg border border-current px-3 py-2 font-medium">
          {action}
        </a>
      </div>
      {openKey === key && (
        <AlertDialog
          title={title}
          description={description}
          href={href}
          action={action}
          closeLabel={copy.close}
          onClose={close}
        />
      )}
    </>
  );
}

function AlertDialog({
  title,
  description,
  href,
  action,
  closeLabel,
  onClose,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const { dialog, onKeyDown } = useDialogFocus(onClose);
  const id = useId();
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl outline-none"
      >
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        <p id={`${id}-description`} className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={href}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {action}
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
