"use client";

import { useId, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Checkbox } from "@/components/ui/Checkbox";

/** Confirmation belongs to the exact draft/plan and attempt, never to a whole session. */
export function useNetworkFirewallConfirmation(reviewKey: string) {
  const [accepted, setAccepted] = useState<string | null>(null);
  return {
    checked: accepted === reviewKey,
    onCheckedChange: (checked: boolean) => setAccepted(checked ? reviewKey : null),
  };
}

export function NetworkFirewallConfirmation({
  mode,
  checked,
  onCheckedChange,
  disabled,
}: {
  mode: "native" | "wireguard";
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const f = t.servers.clusters.managed.firewallRules;
  const id = useId();
  return (
    <div className="space-y-3 rounded-xl bg-warning/5 p-4">
      <p className="flex items-center gap-2 text-xs font-semibold text-warning">
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        {f.confirmTitle}
      </p>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed"
      >
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          className="mt-0.5"
        />
        <span>{mode === "native" ? f.confirmNative : f.confirmManaged}</span>
      </label>
      <p className="text-xs leading-relaxed text-muted-foreground">{f.confirmHint}</p>
    </div>
  );
}
