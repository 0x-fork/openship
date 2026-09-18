"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Boxes, Loader2, Network, Plus, RefreshCw, Server } from "lucide-react";
import type { ClusterCapabilities, ServerCluster } from "@repo/contracts";
import type { ManagedNetworkPreparationSummary } from "@repo/core";
import { BlurIp } from "@/components/BlurIp";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { useRunEvents } from "@/hooks/useRunEvents";
import { ClusterStatus } from "./ClusterStatus";
import { ClusterEmptyState } from "./ClusterEmptyState";
import { PROVIDER_COLORS } from "./model";
import { NetworkStreamNotice } from "./NetworkStreamNotice";

export function ServerClustersPanel({
  capabilities,
  view = "clusters",
}: {
  capabilities: ClusterCapabilities;
  view?: "clusters" | "networks";
}) {
  const { t } = useI18n();
  const c = t.servers.clusters;
  const isNetworks = view === "networks";
  const [clusters, setClusters] = useState<ServerCluster[] | null>(null);
  const [preparations, setPreparations] = useState<ManagedNetworkPreparationSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const stream = useRunEvents<{
    clusters: ServerCluster[];
    preparations: ManagedNetworkPreparationSummary[];
  }>(capabilities.available ? "system/clusters/stream" : null, (snapshot) => {
    if (!Array.isArray(snapshot.clusters) || !Array.isArray(snapshot.preparations))
      throw new Error("Invalid cluster overview snapshot");
    setClusters(snapshot.clusters);
    setPreparations(snapshot.preparations);
    setRefreshing(false);
  });
  const error = stream.error;
  useEffect(() => {
    if (error) setRefreshing(false);
    const status = (error as (Error & { status?: number }) | null)?.status;
    if (status === 401 || status === 403) {
      setClusters(null);
      setPreparations([]);
    }
  }, [error]);

  if (!capabilities.available) return null;
  return (
    <section>
      <div
        className={`mb-6 flex flex-wrap items-start gap-4 ${isNetworks ? "justify-between" : "justify-end"}`}
      >
        {isNetworks && (
          <div>
            <h2 className="text-lg font-semibold">{c.networksTitle}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {c.networksDescription}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              setRefreshing(true);
              stream.reconnect();
            }}
            disabled={refreshing}
            aria-label={c.refresh}
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          {!isNetworks &&
            capabilities.canManage &&
            (!!clusters?.length || !!preparations.length) && (
              <Button asChild>
                <Link href="/servers/clusters/new">
                  <Plus />
                  {c.createCluster}
                </Link>
              </Button>
            )}
        </div>
      </div>
      <NetworkStreamNotice stream={stream} />
      {!clusters && !error && (
        <Loader2 className="mx-auto my-16 size-5 animate-spin text-muted-foreground" />
      )}
      {!!preparations.length && (
        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {preparations.map((setup) => (
            <Link
              key={setup.id}
              href={`/servers/clusters/preparations/${setup.id}`}
              className="rounded-2xl bg-card p-5 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {setup.status === "preparing" && <Loader2 className="size-3.5 animate-spin" />}
                {c.managed.preparationStatus[setup.status]}
              </div>
              <h3 className="mt-2 font-medium">{setup.name}</h3>
              <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                {c.managed.viewPreparation}
                <ArrowRight className="size-3.5 rtl:rotate-180" />
              </span>
            </Link>
          ))}
        </div>
      )}
      {clusters?.length === 0 && !preparations.length && !error && (
        <ClusterEmptyState view={view} canManage={capabilities.canManage} />
      )}
      {!isNetworks ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clusters?.map((cluster) => (
            <Link
              key={cluster.id}
              href={`/servers/clusters/${cluster.id}`}
              className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/8 text-primary">
                  <Boxes className="size-5" />
                </span>
                <ClusterStatus cluster={cluster} />
              </div>
              <h3 className="mt-4 truncate font-semibold">{cluster.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {cluster.location || c.noLocation}
              </p>
              <div className="my-4 flex items-center gap-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Server className="size-3.5" />
                  {interpolate(c.memberCount, { count: String(cluster.members.length) })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Network className="size-3.5" />
                  {cluster.network.mode === "wireguard" ? c.managed.title : c.nativeNetwork}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...new Set(cluster.members.map((m) => m.providerId))].map((id) => (
                  <span
                    key={id}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium ${PROVIDER_COLORS[id]}`}
                  >
                    {id === "custom"
                      ? c.customProvider
                      : (capabilities.providers.find((p) => p.id === id)?.name ?? id)}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <span className="truncate font-mono">
                  <BlurIp>{cluster.network.cidrs.join(", ")}</BlurIp>
                </span>
                <ArrowRight className="ms-3 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        clusters &&
        clusters.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-start text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  {[c.addressRanges, c.stepCluster, c.members, c.mtu, c.networkStatus].map(
                    (label) => (
                      <th key={label} className="px-4 py-3 text-start font-medium">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clusters.map((cluster) => (
                  <tr key={cluster.id}>
                    <td className="px-4 py-4">
                      <Link
                        className="font-mono text-xs text-primary hover:underline"
                        href={`/servers/clusters/${cluster.id}?tab=network`}
                      >
                        <BlurIp>{cluster.network.cidrs.join(", ")}</BlurIp>
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        className="font-medium hover:text-primary"
                        href={`/servers/clusters/${cluster.id}`}
                      >
                        {cluster.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4">{cluster.members.length}</td>
                    <td className="px-4 py-4 tabular-nums">{cluster.network.mtu}</td>
                    <td className="px-4 py-4">
                      <ClusterStatus cluster={cluster} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}
