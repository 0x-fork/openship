"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@repo/ui/icons";
import { useServerDestinations } from "@/hooks/useServerDestinations";
import { useBillingScope } from "./BillingWorkspaceContext";
import { scopedBillingHref } from "@/lib/billing-links";
import { usePlatform } from "@/context/PlatformContext";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Button } from "@/components/ui/button";

/** Subscription ids stay inside billing; serverId identifies every deploy target. */
export function ServerBillingPicker({ workspaceId }: { workspaceId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { organizationId } = useBillingScope();
  const [pending, startTransition] = useTransition();
  const [requestedName, setRequestedName] = useState("");
  const { selfHosted } = usePlatform();
  const { t } = useI18n();
  const copy = t.billing.workspaces;
  const { data, error, loading, refresh } = useServerDestinations(!selfHosted);
  if (selfHosted || loading) return null;
  if (error)
    return (
      <Button variant="secondary" size="sm" onClick={refresh} title={error}>
        {t.billing.plansRoute.tryAgain}
      </Button>
    );
  const options = data?.servers.flatMap(server => {
    if (!server.managed) return [];
    const resources = server.managed.resources;
    return [{
      value: server.managed.id,
      label: server.name || copy.singular,
      icon: <Icon name={pending && server.managed.id === workspaceId ? "spinner" : "cloud"} className={`size-4 text-muted-foreground ${pending && server.managed.id === workspaceId ? "animate-spin" : ""}`} />,
      description: resources ? interpolate(copy.resourceSummary, {
        cpu: String(resources.cpuCores),
        memory: String(resources.memoryMb / 1024),
        disk: String(resources.diskMb / 1024),
      }) : undefined,
    }];
  }) ?? [];
  if (options.length === 0) return null;
  if (options.length === 1 && (!workspaceId || workspaceId === options[0]!.value)) {
    return (
      <div className="inline-flex max-w-full items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm text-foreground">
        <Icon name="cloud" className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{options[0]!.label}</span>
      </div>
    );
  }
  return (
    <div className="max-w-full" aria-busy={pending}>
      <CustomSelect
        aria-label={copy.singular}
        value={workspaceId ?? ""}
        options={options}
        placeholder={copy.choose}
        variant="filled"
        className="w-60 max-w-full"
        triggerClassName="h-9 bg-card px-3 hover:bg-muted/60"
        disabled={pending}
        onChange={id => {
          if (id === workspaceId) return;
          setRequestedName(options.find(option => option.value === id)?.label ?? copy.singular);
          startTransition(() => router.push(scopedBillingHref(pathname || "/billing/overview", { workspaceId: id, organizationId })));
        }}
      />
      <span role="status" className="sr-only">{pending ? interpolate(copy.switchingBilling, { name: requestedName }) : ""}</span>
    </div>
  );
}
