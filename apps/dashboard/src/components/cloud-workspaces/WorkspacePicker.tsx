"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Button } from "@/components/ui/button";
import { useCloudWorkspaces } from "./useCloudWorkspaces";

export function WorkspacePicker({
  value,
  onChange,
  disabled = false,
  purpose = "placement",
  dockerOnly = false,
}: {
  value?: string;
  onChange: (id: string | undefined, serverId?: string) => void;
  disabled?: boolean;
  purpose?: "placement" | "billing";
  dockerOnly?: boolean;
}) {
  const { t } = useI18n();
  const copy = t.billing.workspaces;
  const { data, error, loading, refresh } = useCloudWorkspaces();
  const rows =
    data?.workspaces.filter(
      (row) =>
        (!dockerOnly || row.runtime === "docker") &&
        (row.id === value ||
          purpose === "billing" ||
          (row.state !== "deleting" && (row.mode === "shared" || row.projectCount === 0))),
    ) ?? [];
  useEffect(() => {
    if (!value && data && !data.dedicatedBilling && rows.length === 1 && !disabled)
      onChange(rows[0]!.id, rows[0]!.serverId);
  }, [data, value, disabled, onChange, rows.length]);
  if (loading)
    return (
      <div
        aria-busy="true"
        aria-label={copy.loading}
        className="h-16 animate-pulse rounded-xl bg-muted/50"
      />
    );
  if (error)
    return (
      <div role="alert" className="space-y-2 text-sm text-danger">
        <p>{error}</p>
        <Button variant="secondary" onClick={refresh}>
          {t.billing.plansRoute.tryAgain}
        </Button>
      </div>
    );
  const options = [
    ...(data?.dedicatedBilling
      ? [
          {
            value: "dedicated",
            label: copy.dedicatedProjects,
            description: copy.dedicatedProjectsHint,
          },
        ]
      : []),
    ...rows.map((row) => ({
      value: row.id,
      label: row.name,
      description:
        row.mode === "shared"
          ? copy.shared
          : row.runtime === "native"
            ? copy.native
            : copy.dedicated,
    })),
  ];
  const fresh = !data?.dedicatedBilling && data?.workspaces.length === 0;
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{copy.singular}</label>
      {options.length > 1 ? (
        <CustomSelect
          aria-label={copy.singular}
          value={value ?? (data?.dedicatedBilling ? "dedicated" : "")}
          options={options}
          onChange={(id) => onChange(id === "dedicated" ? undefined : id, rows.find(row => row.id === id)?.serverId)}
          disabled={disabled}
          variant="filled"
          triggerClassName="bg-muted/60 hover:bg-muted"
          placeholder={copy.choose}
        />
      ) : (
        <div className="rounded-xl bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium">
            {options[0]?.label ?? (fresh ? copy.defaultName : copy.empty)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {options[0]?.description ?? (fresh ? copy.defaultHint : copy.noneAvailable)}
          </p>
        </div>
      )}
      {options.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {purpose === "billing" ? copy.subscriptionHint : copy.placementHint}
        </p>
      )}
      {!disabled && (
        <Link
          href="/workspaces"
          className="inline-flex text-sm font-medium text-primary hover:underline"
        >
          {copy.manage}
        </Link>
      )}
    </div>
  );
}
