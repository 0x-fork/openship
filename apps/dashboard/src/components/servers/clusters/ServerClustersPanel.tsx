"use client";

import Link from "next/link";
import { ArrowRight, Boxes, Loader2, Network, Server } from "lucide-react";
import type { ClusterCapabilities } from "@repo/contracts";
import { BlurIp } from "@/components/BlurIp";
import { useI18n, interpolate } from "@/components/i18n-provider";
import type { ServerClustersOverview } from "@/hooks/useServerClustersOverview";
import { ClusterStatus } from "./ClusterStatus";
import { ClusterEmptyState } from "./ClusterEmptyState";
import { PROVIDER_COLORS } from "./model";
import { NetworkStreamNotice } from "./NetworkStreamNotice";
import { NetworkPreparationActions } from "./NetworkPreparationActions";

export function ServerClustersPanel({
  capabilities,
  overview,
  view = "clusters",
}: {
  capabilities: ClusterCapabilities;
  overview: ServerClustersOverview;
  view?: "clusters" | "networks";
}) {
  const { t } = useI18n();
  const c = t.servers.clusters;
  const isNetworks = view === "networks";
  const { clusters, preparations, stream } = overview;
  const error = stream.error;

  if (!capabilities.available) return null;
  return (
    <section>
      {isNetworks && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold">{c.networksTitle}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {c.networksDescription}
          </p>
        </div>
      )}
      <NetworkStreamNotice stream={stream} />
      {!clusters && !error && (
        <Loader2 className="mx-auto my-16 size-5 animate-spin text-muted-foreground" />
      )}
      {!!preparations.length && (
        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {preparations.map((setup) => (
            <article
              key={setup.id}
              className="relative rounded-2xl bg-card p-5 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center gap-2 pe-8 text-xs text-muted-foreground">
                {setup.status === "preparing" && <Loader2 className="size-3.5 animate-spin" />}
                {c.managed.preparationStatus[setup.status]}
              </div>
              <div className="absolute end-3 top-3 z-10">
                <NetworkPreparationActions
                  preparation={setup}
                  name={setup.name}
                  canManage={capabilities.canManage}
                  onDiscarded={overview.onDiscarded}
                  onRefresh={stream.reconnect}
                />
              </div>
              <h3 id={`setup-${setup.id}-name`} className="mt-2 truncate font-medium">
                {setup.name}
              </h3>
              <Link
                href={`/servers/clusters/preparations/${setup.id}`}
                aria-labelledby={`setup-${setup.id}-name setup-${setup.id}-view`}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                <span id={`setup-${setup.id}-view`}>{c.managed.viewPreparation}</span>
                <ArrowRight className="size-3.5 rtl:rotate-180" />
              </Link>
            </article>
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
