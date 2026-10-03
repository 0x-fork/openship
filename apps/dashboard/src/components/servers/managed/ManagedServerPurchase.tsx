"use client";

import { useRef, useState } from "react";
import type { CloudWorkspaceSummary } from "@repo/contracts";
import { useI18n } from "@/components/i18n-provider";
import { CloudPlanPicker } from "@/components/billing/CloudPlanPicker";
import { BillingWorkspaceProvider } from "@/components/billing/BillingWorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-client";
import { systemApi } from "@/lib/api/system";
import { getApiErrorMessage } from "@/lib/api/client";

interface PurchaseProps {
  preserveProject?: boolean;
  billingEnabled?: boolean;
  onCheckoutStarted?: (server: CloudWorkspaceSummary, checkoutUrl: string) => void | Promise<void>;
  onCancel?: () => void;
}

/** Billing, server setup and destination dialogs share this plan-first purchase.
 * Browsing does not create a server; retries reuse the identity just created. */
export function ManagedServerPurchase(props: PurchaseProps) {
  const { data: session, isPending } = useSession();
  const contextKey = `${session?.user.id ?? "local"}:${session?.session.activeOrganizationId ?? ""}`;
  return (
    <BillingWorkspaceProvider>
      <Purchase key={contextKey} {...props} sessionPending={isPending} />
    </BillingWorkspaceProvider>
  );
}

function Purchase({
  preserveProject = false,
  billingEnabled = true,
  onCheckoutStarted,
  onCancel,
  sessionPending,
}: PurchaseProps & { sessionPending?: boolean }) {
  const { t } = useI18n();
  const [name, setName] = useState(t.billing.workspaces.defaultName);
  const created = useRef<CloudWorkspaceSummary | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function prepareWorkspace() {
    setLocked(true);
    try {
      created.current ??= await systemApi.createManagedServer({ name: name.trim() });
      return created.current.id;
    } catch (error) {
      setLocked(false);
      throw error;
    }
  }

  return (
    <div className="space-y-4">
      <CloudPlanPicker
        currentPlan="free"
        subscription={null}
        billingEnabled={billingEnabled}
        prepareWorkspace={prepareWorkspace}
        purchaseDisabled={!name.trim() || sessionPending}
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
          <div className="flex min-w-0 flex-wrap items-end gap-3">
            <label className="block space-y-1.5 text-sm font-medium">
              <span>{t.billing.plansRoute.serverName}</span>
              <Input
                variant="filled"
                value={name}
                maxLength={80}
                required
                disabled={locked}
                onChange={(event) => setName(event.target.value)}
                className="w-full bg-muted/40 sm:w-52"
              />
            </label>
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel}>
                {t.billing.capacityEditor.cancel}
              </Button>
            )}
          </div>
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
