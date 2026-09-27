"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { PLANS } from "@repo/core";
import { Icon } from "@repo/ui/icons";
import { interpolate, useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/context/AuthContext";
import { usePlatform } from "@/context/PlatformContext";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type { BillingState } from "@/lib/api/billing";
import { PlanResources } from "./PlanResources";

function readAcknowledged(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string").slice(-20)
      : [];
  } catch {
    return [];
  }
}

/** Mounted only after the existing checkout verifier confirms payment and access. */
export function CloudSubscriptionWelcome({
  state,
  checkoutId,
}: {
  state: BillingState;
  checkoutId: string;
}) {
  const { selfHosted, deployMode } = usePlatform();
  const { user } = useAuth();
  if (selfHosted || deployMode === "desktop" || !user) return null;
  return (
    <CheckoutWelcome
      key={`${user.id}:${checkoutId}`}
      state={state}
      checkoutId={checkoutId}
      userId={user.id}
    />
  );
}

function CheckoutWelcome({
  state,
  checkoutId,
  userId,
}: {
  state: BillingState;
  checkoutId: string;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const storageKey = `openship:subscription-welcome:${userId}`;

  useEffect(() => {
    setOpen(!readAcknowledged(storageKey).includes(checkoutId));
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey && readAcknowledged(storageKey).includes(checkoutId))
        setOpen(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [checkoutId, storageKey]);

  function dismiss() {
    setOpen(false);
    try {
      const acknowledged = readAcknowledged(storageKey).filter((id) => id !== checkoutId);
      localStorage.setItem(storageKey, JSON.stringify([...acknowledged, checkoutId].slice(-20)));
    } catch {
      // Storage is optional; dismissing must work in restricted browsers too.
    }
  }

  return (
    <Modal isOpen={open} onClose={dismiss} showCloseButton={false} width="100%" maxWidth="520px">
      <WelcomeContent state={state} onClose={dismiss} />
    </Modal>
  );
}

function WelcomeContent({ state, onClose }: { state: BillingState; onClose: () => void }) {
  const { t } = useI18n();
  const copy = t.billing.welcome;
  const titleId = useId();
  const descriptionId = useId();
  const { dialog, onKeyDown } = useDialogFocus(onClose);
  const plan = state.plan?.id === state.tier ? state.plan : null;
  const hasNoProjects = state.capacity?.projects?.used === 0;

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="relative p-6 outline-none sm:p-8"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={copy.dismiss}
        onClick={onClose}
        className="absolute end-4 top-4"
      >
        <Icon name="close" className="size-4" aria-hidden="true" />
      </Button>
      <div
        className="relative mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <Icon name="rocket" className="size-7" />
        <span className="absolute -bottom-1 -end-1 flex size-6 items-center justify-center rounded-full bg-card text-success">
          <Icon name="check-circle" className="size-5" />
        </span>
      </div>
      <p className="text-sm font-medium text-success">{copy.eyebrow}</p>
      <h2 id={titleId} className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
        {interpolate(copy.title, { name: plan?.name ?? PLANS[state.tier].name })}
      </h2>
      <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {copy.description}
      </p>
      {plan && (
        <div className="mt-6">
          <PlanResources plan={plan} interval={state.subscription?.interval} compact />
        </div>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button asChild className="sm:flex-1">
          <Link href={hasNoProjects ? "/library" : "/projects"} onClick={onClose}>
            {hasNoProjects ? t.billing.onboarding.stepDeploy : copy.openProjects}
            <Icon name="arrow-right" className="size-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="secondary" className="sm:flex-1">
          <Link href="/billing/overview" onClick={onClose}>
            {copy.viewPlan}
          </Link>
        </Button>
      </div>
    </div>
  );
}
