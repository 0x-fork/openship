"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon as UiIcon } from "@repo/ui/icons";
import type { CloudWorkspaceUsage } from "@repo/contracts";
import type { CloudAllocation } from "@repo/core";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { cloudWorkspacesApi } from "@/lib/api/cloud-workspaces";
import { getApiErrorMessage } from "@/lib/api/client";
import { formatBillingNumber } from "@/lib/billing-usage";
import { ResourceRing } from "@/components/billing/ResourceMeter";

/** Host measurements are separate from the provider's reserved allocation. */
export function WorkspaceUsage({
  workspaceId,
  resources,
  showProjects = false,
  metrics = true,
}: {
  workspaceId: string;
  resources?: CloudAllocation | null;
  showProjects?: boolean;
  metrics?: boolean;
}) {
  const { t, locale } = useI18n();
  const copy = t.billing.workspaces;
  const [usage, setUsage] = useState<CloudWorkspaceUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setUsage(null);
    void cloudWorkspacesApi
      .usage(workspaceId)
      .then((value) => {
        if (active) setUsage(value);
      })
      .catch((error) => {
        if (active) setError(getApiErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, attempt]);
  const number = (value: number) => formatBillingNumber(value, locale);
  const gb = (value: number | null | undefined) => (value == null ? null : value / 1024);
  const rows = [
    { label: copy.cpuUsage, value: usage?.cpuPercent ?? null, max: 100, unit: "%" },
    {
      label: t.billing.header.ram,
      value: gb(usage?.memoryUsedMb),
      max: gb(resources?.memoryMb),
      unit: "GB",
    },
    {
      label: copy.diskUsage,
      value: gb(usage?.diskUsedMb),
      max: gb(usage?.diskTotalMb),
      unit: "GB",
    },
  ];
  return (
    <section className="rounded-2xl bg-card p-5" aria-busy={loading}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {metrics ? copy.liveUsage : t.billing.resourcesGuide.projects}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {metrics ? copy.usageHint : copy.nativeHint}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={loading}
          aria-label={t.billing.resourceOverview.refresh}
          onClick={() => setAttempt((value) => value + 1)}
        >
          <UiIcon
            name="refresh"
            className={`size-4 ${loading ? "motion-safe:animate-spin" : ""}`}
            aria-hidden
          />
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {metrics && !loading && usage && !usage.available && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {usage.reason}
        </p>
      )}
      {metrics && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 p-4"
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className="mt-2 text-lg font-semibold tabular-nums">
                  {row.value == null ? "—" : number(row.value)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {row.unit}
                    {row.max != null && row.unit !== "%" ? ` / ${number(row.max)} ${row.unit}` : ""}
                  </span>
                </p>
              </div>
              <ResourceRing label={row.label} used={row.value} max={row.max} />
            </div>
          ))}
        </div>
      )}
      {usage?.available && (
        <p className="mt-3 text-xs text-muted-foreground">
          {copy.measuredAt} {new Date(usage.measuredAt).toLocaleString(locale)}
        </p>
      )}
      {showProjects && (
        <div className="mt-6">
          {metrics && (
            <>
              <h3 className="text-sm font-medium">{t.billing.resourcesGuide.projects}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{copy.projectDiskHint}</p>
            </>
          )}
          <div className="mt-3 space-y-2">
            {usage?.projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${encodeURIComponent(project.id)}`}
                className="flex items-center justify-between gap-4 rounded-xl bg-muted/30 px-4 py-3 text-sm hover:bg-muted/50"
              >
                <span className="truncate font-medium">{project.name}</span>
                {metrics && (
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {project.diskMb == null ? "—" : `${number(project.diskMb / 1024)} GB`}
                  </span>
                )}
              </Link>
            ))}
            {usage && usage.projects.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">{copy.noProjects}</p>
            )}
            {usage?.sharedDiskMb != null && (
              <div className="flex justify-between gap-4 px-4 py-2 text-sm text-muted-foreground">
                <span>{copy.sharedDisk}</span>
                <span className="shrink-0 whitespace-nowrap tabular-nums">
                  {number(usage.sharedDiskMb / 1024)} GB
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
