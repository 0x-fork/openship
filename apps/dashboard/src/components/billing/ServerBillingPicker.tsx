"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { ServerDetail } from "@repo/contracts";
import { Icon } from "@repo/ui/icons";
import { useBillingScope } from "./BillingWorkspaceContext";
import { scopedBillingHref } from "@/lib/billing-links";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { ServerPicker } from "@/components/shared/ServerPicker";
import { Button } from "@/components/ui/button";

/** Subscription ids stay inside billing; serverId identifies every deploy target. */
export function ServerBillingPicker({ workspaceId, servers, loading, error, onRetry }: {
  workspaceId?: string;
  servers: ServerDetail[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { organizationId } = useBillingScope();
  const [pending, startTransition] = useTransition();
  const [requestedName, setRequestedName] = useState("");
  const { t } = useI18n();
  const copy = t.billing.workspaces;
  if (loading) return null;
  if (error)
    return (
      <Button variant="secondary" size="sm" onClick={onRetry} title={error}>
        {t.billing.plansRoute.tryAgain}
      </Button>
    );
  if (servers.length === 0) return null;
  if (servers.length === 1) {
    const server = servers[0]!;
    const label = <><Icon name="cloud" className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{server.name || copy.singular}</span></>;
    const chipClass = "inline-flex min-w-0 items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm text-foreground";
    return (
      <div className="flex max-w-full items-center gap-2">
        {workspaceId && workspaceId !== server.managed?.id ? (
          <Link className={`${chipClass} hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring`}
            href={scopedBillingHref(pathname, { workspaceId: server.managed?.id, organizationId })}>{label}</Link>
        ) : <div className={chipClass}>{label}</div>}
        <Button asChild variant="secondary" size="sm" className="shrink-0">
          <Link href="/servers/new"><Icon name="plus" className="size-4" />{t.servers.setup.addServer}</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="w-64 max-w-full" aria-busy={pending}>
      <ServerPicker
        servers={servers}
        selectedId={servers.find(server => server.managed?.id === workspaceId)?.id}
        label={copy.singular}
        showLabel={false}
        disabled={pending}
        onAddServer={() => router.push("/servers/new")}
        addServerLabel={t.servers.setup.addServer}
        onSelect={server => {
          const id = server.managed?.id;
          if (!id || id === workspaceId) return;
          setRequestedName(server.name || copy.singular);
          startTransition(() => router.push(scopedBillingHref(pathname, { workspaceId: id, organizationId }), { scroll: false }));
        }}
      />
      <span role="status" className="sr-only">{pending ? interpolate(copy.switchingBilling, { name: requestedName }) : ""}</span>
    </div>
  );
}
