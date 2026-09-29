"use client";

import { useId } from "react";
import type { AppEndpoint } from "@repo/core";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { useDialogFocus } from "@/hooks/useDialogFocus";

export function AppDomainConfirmation({
  endpoints,
  cloud,
  onClose,
  onAddDomains,
  onConfirm,
}: {
  endpoints: readonly AppEndpoint[];
  cloud: boolean;
  onClose: () => void;
  onAddDomains: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const copy = t.projectSettings.appInstall;
  const titleId = useId();
  const descriptionId = useId();
  const { dialog, onKeyDown } = useDialogFocus(onClose);

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={onKeyDown}
      className="space-y-5 p-6 outline-none"
    >
      <div className="space-y-2">
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          {copy.withoutDomainsTitle}
        </h2>
        <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
          {cloud ? copy.withoutDomainsCloudBody : copy.withoutDomainsBody}
        </p>
      </div>
      <ul className="max-h-48 space-y-2 overflow-y-auto rounded-xl bg-muted/40 p-3">
        {endpoints.map((endpoint) => (
          <li
            key={`${endpoint.service}:${endpoint.port}`}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="min-w-0 break-words text-foreground">{endpoint.label}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {endpoint.port}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onAddDomains}>
          {copy.addDomains}
        </Button>
        <Button onClick={onConfirm}>{copy.continueWithoutDomains}</Button>
      </div>
    </div>
  );
}
