"use client";

import { useRouter, usePathname } from "next/navigation";
import { useServerDestinations } from "@/hooks/useServerDestinations";
import { workspaceBillingHref } from "./BillingWorkspaceContext";
import { usePlatform } from "@/context/PlatformContext";
import { useI18n } from "@/components/i18n-provider";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Button } from "@/components/ui/button";

/** Subscription ids stay inside billing; serverId identifies every deploy target. */
export function ServerBillingPicker({ workspaceId }: { workspaceId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
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
  const options = [
    ...(data?.servers.flatMap((server) =>
      server.managed ? [{ value: server.managed.id, label: server.name || server.id }] : [],
    ) ?? []),
  ];
  if (options.length < 2) return null;
  return (
    <CustomSelect
      aria-label={copy.singular}
      value={workspaceId ?? ""}
      options={options}
      placeholder={copy.choose}
      variant="filled"
      className="w-full sm:w-64"
      triggerClassName="bg-muted/60 hover:bg-muted"
      onChange={(id) =>
        router.push(
          workspaceBillingHref(
            pathname || "/billing/overview",
            id,
          ),
        )
      }
    />
  );
}
