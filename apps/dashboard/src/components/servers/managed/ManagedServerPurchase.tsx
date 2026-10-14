"use client";

import { useEffect, useRef, useState } from "react";
import type { CloudWorkspaceSummary } from "@repo/contracts";
import { useI18n } from "@/components/i18n-provider";
import { CloudPlanPicker } from "@/components/billing/CloudPlanPicker";
import { BillingWorkspaceProvider } from "@/components/billing/BillingWorkspaceContext";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { systemApi } from "@/lib/api/system";
import { getApiErrorMessage } from "@/lib/api/client";
import { useCloudResourceKey } from "@/context/CloudResourceContext";
import { randomUUID } from "@/lib/random-uuid";
import { isCloudPurchaseIntent } from "@/lib/cloud-purchase-intent";

interface PurchaseProps {
  /** Marketing requests only an offer ID; the API supplies its actual terms. */
  requestedPlanId?: string;
  autoCheckout?: boolean;
  checkoutIntent?: string;
  preserveProject?: boolean;
  billingEnabled?: boolean;
  onCheckoutStarted?: (server: CloudWorkspaceSummary, checkoutUrl: string) => void | Promise<void>;
  onCancel?: () => void;
}

/** Billing, server setup and destination dialogs share this plan-first purchase.
 * Browsing does not create a server; retries reuse the identity just created. */
export function ManagedServerPurchase(props: PurchaseProps) {
  const { data: session, isPending } = useSession();
  const cloudKey = useCloudResourceKey();
  const contextKey = `${cloudKey}:${session?.user.id ?? "local"}:${session?.session.activeOrganizationId ?? ""}`;
  const [automatic, setAutomatic] = useState<{ owner: string; key: string } | null>(null);
  useEffect(() => {
    if (!props.autoCheckout || automatic || isPending || !session?.user.id || !session.session.activeOrganizationId) return;
    const url = new URL(window.location.href);
    const saved = props.checkoutIntent ?? url.searchParams.get("checkoutIntent");
    if (saved && !isCloudPurchaseIntent(saved)) return;
    const key = saved || randomUUID();
    url.searchParams.set("checkoutIntent", key);
    url.searchParams.set("organizationId", session.session.activeOrganizationId);
    window.history.replaceState(window.history.state, "", url);
    setAutomatic({ owner: contextKey, key });
  }, [props.autoCheckout, props.checkoutIntent, automatic, isPending, session, contextKey]);
  const owned = automatic?.owner === contextKey;
  return (
    <BillingWorkspaceProvider>
      <Purchase key={`${contextKey}:${owned ? automatic?.key : "manual"}`} {...props} sessionPending={isPending}
        autoCheckout={Boolean(props.autoCheckout && owned)} checkoutIntent={owned ? automatic?.key : undefined} />
    </BillingWorkspaceProvider>
  );
}

function Purchase({
  preserveProject = false,
  billingEnabled = true,
  onCheckoutStarted,
  onCancel,
  sessionPending,
  requestedPlanId,
  autoCheckout,
  checkoutIntent,
}: PurchaseProps & { sessionPending?: boolean }) {
  const { t } = useI18n();
  const created = useRef<CloudWorkspaceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function prepareWorkspace() {
    created.current ??= await systemApi.createManagedServer({
      name: t.billing.workspaces.defaultName,
      ...(checkoutIntent ? { idempotencyKey: checkoutIntent } : {}),
    });
    return created.current.id;
  }

  return (
    <div className="space-y-4">
      <CloudPlanPicker
        currentPlan="free"
        requestedPlanId={requestedPlanId}
        autoCheckout={autoCheckout}
        checkoutKey={checkoutIntent}
        subscription={null}
        billingEnabled={billingEnabled}
        prepareWorkspace={prepareWorkspace}
        onWorkspaceRemoved={id => { if (created.current?.id === id) created.current = null; }}
        purchaseDisabled={sessionPending}
        preserveProject={preserveProject}
        onCheckoutStarted={(checkoutUrl) => {
          if (created.current && checkoutUrl && onCheckoutStarted) {
            const server = created.current;
            void Promise.resolve()
              .then(() => onCheckoutStarted(server, checkoutUrl))
              .catch((error) => setError(getApiErrorMessage(error)));
          }
        }}
        purchaseDetails={
          onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t.billing.capacityEditor.cancel}
            </Button>
          )
        }
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
