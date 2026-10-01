"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { cloudWorkspacesApi } from "@/lib/api/cloud-workspaces";
import { getApiErrorMessage } from "@/lib/api/client";
import type { CloudCapacityRestriction } from "@/lib/cloud-deploy-pricing";
import { CloudCapacityModal } from "@/components/billing/CloudCapacityModal";

export function WorkspaceCapacityRecovery({
  workspaceId,
  restriction,
  message,
  onClose,
  onRetry,
}: {
  workspaceId: string;
  restriction?: CloudCapacityRestriction;
  message?: string;
  onClose: () => void;
  onRetry?: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  const copy = t.billing.workspaces;
  const title = useId();
  const { dialog, onKeyDown } = useDialogFocus(onClose);
  const [runtime, setRuntime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    if (!onRetry || retrying) return;
    setRetrying(true);
    setError(null);
    try {
      await onRetry();
    } catch (error) {
      setError(getApiErrorMessage(error));
    } finally {
      setRetrying(false);
    }
  }
  useEffect(() => {
    let active = true;
    void cloudWorkspacesApi
      .get(workspaceId)
      .then((row) => {
        if (active) setRuntime(row.runtime);
      })
      .catch((error) => {
        if (active) setError(getApiErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);
  if (runtime === "native")
    return (
      <CloudCapacityModal
        workspaceId={workspaceId}
        restriction={restriction}
        onClose={onClose}
        onRetry={onRetry}
      />
    );
  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="space-y-5 p-5 outline-none"
    >
      <h2 id={title} className="text-lg font-semibold">
        {copy.buildCapacityTitle}
      </h2>
      {message && <p className="text-sm">{message}</p>}
      <p className="text-sm text-muted-foreground">{copy.buildCapacityHint}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link
            href={`/workspaces/${encodeURIComponent(workspaceId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.openWorkspace}
          </Link>
        </Button>
        {onRetry && (
          <Button variant="secondary" disabled={retrying} onClick={() => void retry()}>
            {copy.retryDeployment}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          {t.billing.deployGate.close}
        </Button>
      </div>
    </div>
  );
}
