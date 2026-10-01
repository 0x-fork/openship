"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePlatform } from "@/context/PlatformContext";
import { useCloud } from "@/context/CloudContext";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { billingApi, type BillingState, type BillingCreditAlerts } from "@/lib/api/billing";
import { getActiveOrganizationId, subscribeActiveOrganization } from "@/lib/api/client";
import { formatMilliCredits } from "@/lib/billing-usage";

type CreditState = Pick<BillingState, "workspace" | "creditAlert" | "tier" | "currentPeriod" | "balance" | "billing" | "topups">;
type Snapshot = { scope: string; value: BillingCreditAlerts };

function alertPriority(state: CreditState): number {
  const alert = state.creditAlert;
  const funded = state.tier !== "free" || (alert?.limit ?? 0) > 0 || state.balance.quotaUsed > 0;
  if (!funded || !alert) return 0;
  if (alert.state === "depleted") return 4;
  if (alert.state === "grace") return 3;
  if (alert.state !== "low") return 0;
  return alert.threshold != null && alert.threshold === alert.thresholds.at(-1) ? 2 : 1;
}

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
        const value = await billingApi.getCreditAlerts();
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
  const alerts = snapshot.value.items.filter(state => alertPriority(state) > 0)
    .sort((a, b) => alertPriority(b) - alertPriority(a));
  return (
    <>
      {alerts.map((state, index) => (
        <CreditAlertNotice
          key={`${scope}:${state.workspace?.id ?? state.creditAlert?.namespace}`}
          state={state}
          organizationId={organizationId}
          userId={user.id}
          showDialog={index === 0}
        />
      ))}
    </>
  );
}

export function CreditAlertNotice({
  state,
  organizationId,
  userId,
  showDialog = true,
}: {
  state: CreditState;
  organizationId: string;
  userId: string;
  showDialog?: boolean;
}) {
  const { t, locale } = useI18n();
  const copy = t.billing.creditAlert;
  const alert = state.creditAlert;
  const priority = alertPriority(state);
  const visible = priority > 0 && alert;
  const attention = priority >= 2;
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
    if (!key || !attention || !showDialog) {
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
  }, [key, attention, dismissedKey, showDialog]);
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
  const statusTitle =
    alert.state === "depleted"
      ? copy.exhaustedTitle
      : alert.state === "grace"
        ? copy.graceTitle
        : copy.lowTitle;
  const title = state.workspace?.name ? `${state.workspace.name} · ${statusTitle}` : statusTitle;
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
  const query = new URLSearchParams({ organizationId, tab: canTopUp ? "topups" : "overview" });
  if (state.workspace?.id) query.set("workspaceId", state.workspace.id);
  const href = `/cloud-billing?${query}`;
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
        <Button asChild variant="secondary" className="shrink-0">
          <a href={href}>{action}</a>
        </Button>
      </div>
      {showDialog && openKey === key && (
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

interface AlertDialogProps {
  title: string;
  description: string;
  href: string;
  action: string;
  closeLabel: string;
  onClose: () => void;
}

function AlertDialog(props: AlertDialogProps) {
  return (
    <Modal isOpen onClose={props.onClose} width="100%" maxWidth="448px" showCloseButton={false}>
      <AlertDialogContent {...props} />
    </Modal>
  );
}

function AlertDialogContent({
  title,
  description,
  href,
  action,
  closeLabel,
  onClose,
}: AlertDialogProps) {
  const { dialog, onKeyDown } = useDialogFocus(onClose);
  const id = useId();
  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="p-5 outline-none"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {title}
      </h2>
      <p id={`${id}-description`} className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {closeLabel}
        </Button>
        <Button asChild>
          <a href={href}>{action}</a>
        </Button>
      </div>
    </div>
  );
}
