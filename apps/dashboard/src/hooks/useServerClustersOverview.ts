"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerCluster } from "@repo/contracts";
import type { ManagedNetworkPreparation, ManagedNetworkPreparationSummary } from "@repo/core";
import { useRunEvents } from "./useRunEvents";

interface ClusterOverviewSnapshot {
  clusters: ServerCluster[];
  preparations: ManagedNetworkPreparationSummary[];
}

/** One subscription shared by the page header and both infrastructure tabs. */
export function useServerClustersOverview(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<ClusterOverviewSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Discard is terminal. A snapshot already in flight must not restore its card.
  const discarded = useRef(new Set<string>());
  const stream = useRunEvents<ClusterOverviewSnapshot>(
    enabled ? "system/clusters/stream" : null,
    (next) => {
      if (!Array.isArray(next.clusters) || !Array.isArray(next.preparations))
        throw new Error("Invalid cluster overview snapshot");
      setSnapshot({
        clusters: next.clusters,
        preparations: next.preparations.filter((setup) => !discarded.current.has(setup.id)),
      });
      setRefreshing(false);
    },
  );
  const error = stream.error;
  useEffect(() => {
    if (error || !enabled) setRefreshing(false);
    const status = (error as (Error & { status?: number }) | null)?.status;
    if (!enabled || status === 401 || status === 403) {
      setSnapshot(null);
      discarded.current.clear();
    }
  }, [enabled, error]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    setRefreshing(true);
    stream.reconnect();
  }, [enabled, stream.reconnect]);

  const onDiscarded = useCallback((preparation: ManagedNetworkPreparation) => {
    if (preparation.status !== "cancelled") return;
    discarded.current.add(preparation.id);
    setSnapshot((previous) =>
      previous
        ? {
            ...previous,
            preparations: previous.preparations.filter((setup) => setup.id !== preparation.id),
          }
        : previous,
    );
  }, []);

  return {
    clusters: enabled ? (snapshot?.clusters ?? null) : null,
    preparations: enabled ? (snapshot?.preparations ?? []) : [],
    stream,
    refreshing,
    refresh,
    onDiscarded,
  };
}

export type ServerClustersOverview = ReturnType<typeof useServerClustersOverview>;
