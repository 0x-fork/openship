"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Loader2,
  PauseCircle,
  RotateCcw,
} from "lucide-react";
import type { ClusterCapabilities } from "@repo/contracts";
import { PageContainer } from "@/components/ui/PageContainer";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { usePlatform } from "@/context/PlatformContext";
import { getApiErrorMessage } from "@/lib/api";
import { serverClustersApi } from "@/lib/api/server-clusters";
import { NetworkSetupProgress } from "./NetworkSetupProgress";
import { NetworkSetupTopology } from "./NetworkSetupTopology";
import { MANAGED_NETWORK_PORT } from "@repo/core";
import { useNetworkSetup } from "@/hooks/useNetworkSetup";
import { NetworkStreamNotice } from "./NetworkStreamNotice";
import { NetworkPreparationActions } from "./NetworkPreparationActions";
import { RemoveSetupServerButton } from "./RemoveSetupServerButton";
import { NetworkSetupCleanup } from "./NetworkSetupCleanup";
import { ManagedNetworkTransportNotice } from "./ManagedNetworkTransportNotice";

export function ManagedNetworkPreparationPage({ id }: { id: string }) {
  const { t } = useI18n();
  const c = t.servers.clusters;
  const m = c.managed;
  const router = useRouter();
  const { selfHosted, deployMode } = usePlatform();
  const eligible = selfHosted && deployMode !== "cloud";
  const {
    progress: preparation,
    update: setPreparation,
    stream,
  } = useNetworkSetup("preparation", id, eligible);
  const [capabilities, setCapabilities] = useState<ClusterCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [openHost, setOpenHost] = useState<{ serverId: string } | null>(null);
  const running = preparation?.status === "preparing";
  const waiting = preparation?.status === "pending";
  const paused = waiting && !preparation?.cleanupOperationId;
  const members =
    preparation?.input.members.map((member) => {
      const host = preparation.hosts.find((item) => item.serverId === member.serverId);
      return {
        ...member,
        name: host?.name ?? member.serverId,
        privateIp: "",
        // Existing clusters may inherit a different endpoint/port from their saved config.
        // Let the planner resolve those values instead of guessing from SSH/defaults.
        endpoint:
          host?.transport?.endpoint ??
          member.endpoint ??
          (!preparation.input.clusterId ? host?.address : undefined),
        listenPort:
          host?.transport?.listenPort ??
          member.listenPort ??
          (!preparation.input.clusterId ? MANAGED_NETWORK_PORT : undefined),
      };
    }) ?? [];
  const canRemoveMember =
    capabilities?.canManage &&
    preparation &&
    !preparation.input.clusterId &&
    !preparation.replacementPreparationId &&
    (paused || preparation.status === "failed" || preparation.status === "interrupted");
  useEffect(() => {
    if (!eligible) return;
    let active = true;
    void serverClustersApi
      .capabilities()
      .then((caps) => {
        if (active) {
          setCapabilities(caps);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(getApiErrorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [id, eligible, attempt]);
  const retry = useCallback(async () => {
    if (!preparation || actionPending.current || !capabilities?.canManage) return;
    actionPending.current = true;
    setBusy(true);
    setError(null);
    try {
      setPreparation(await serverClustersApi.prepareManaged(preparation.input));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      stream.reconnect();
      actionPending.current = false;
      setBusy(false);
    }
  }, [preparation, busy, capabilities, setPreparation, stream.reconnect]);
  const edit = preparation?.input.clusterId
    ? `/servers/clusters/${encodeURIComponent(preparation.input.clusterId)}/edit`
    : "/servers/clusters/new";
  return (
    <PageContainer>
      <section
        className="@container/network-preparation"
        aria-labelledby="network-preparation-title"
      >
        <Link
          href="/servers?tab=cluster"
          className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
          {c.backToClusters}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 id="network-preparation-title" className="text-2xl font-semibold tracking-tight">
              {m.preparationTitle}
            </h1>
            <p className="mt-2 break-words text-sm text-muted-foreground">
              {preparation?.input.name || m.preparationDescription}
            </p>
          </div>
          {eligible && preparation && (
            <NetworkPreparationActions
              preparation={preparation}
              name={preparation.input.name}
              canManage={!!capabilities?.canManage}
              disabled={busy}
              onBusyChange={(pending) => {
                actionPending.current = pending;
                setBusy(pending);
              }}
              onDiscarded={(next) => {
                setPreparation(next);
                router.replace("/servers?tab=cluster");
              }}
              onRefresh={stream.reconnect}
            />
          )}
        </div>
        {!eligible ? (
          <p className="mt-6 rounded-xl bg-muted/50 p-5 text-sm text-muted-foreground">
            {c.selfHostedOnly}
          </p>
        ) : (
          <>
            <NetworkStreamNotice stream={stream} />
            {error && (
              <div
                role="alert"
                className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-danger/10 p-4 text-sm text-danger"
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="shrink-0 underline"
                >
                  {c.retry}
                </button>
              </div>
            )}
            {!preparation && !error && !stream.error && (
              <Loader2 className="mx-auto my-16 size-5 animate-spin text-muted-foreground" />
            )}
            {preparation && (
              <div className="mt-6 grid items-start gap-6 @4xl/network-preparation:grid-cols-[minmax(0,1fr)_340px]">
                {waiting && preparation.cleanupOperationId ? (
                  <NetworkSetupCleanup
                    operationId={preparation.cleanupOperationId}
                    memberCount={preparation.input.members.length}
                    canManage={!!capabilities?.canManage}
                    disabled={busy}
                    onContinue={() => void retry()}
                  />
                ) : (
                  <div className="min-w-0 space-y-5">
                    <NetworkSetupTopology
                      preparation
                      members={members}
                      hosts={preparation.hosts}
                      running={running}
                      statusLabel={m.preparationStatus[preparation.status]}
                      completeLabel={m.preparationStatus.ready}
                      onHostSelect={(serverId) => setOpenHost({ serverId })}
                    />
                    <ManagedNetworkTransportNotice endpoints={members} />
                    <NetworkSetupProgress
                      initiallyCollapsed
                      openHost={openHost}
                      hosts={preparation.hosts}
                      running={running}
                      renderHostActions={
                        canRemoveMember
                          ? (host) => (
                              <RemoveSetupServerButton
                                source={{ preparationId: id, sequence: preparation.sequence }}
                                serverId={host.serverId}
                                name={host.name}
                                memberCount={preparation.input.members.length}
                                disabled={busy}
                                onRefresh={stream.reconnect}
                              />
                            )
                          : undefined
                      }
                    />
                  </div>
                )}
                <aside className="order-first space-y-5 rounded-2xl bg-card p-5 @4xl/network-preparation:sticky @4xl/network-preparation:top-6 @4xl/network-preparation:order-last">
                  <div role="status" className="flex items-center gap-2 text-sm font-semibold">
                    {running ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                    ) : waiting ? (
                      <PauseCircle className="size-4 shrink-0 text-muted-foreground" />
                    ) : preparation.status === "cancelled" ? (
                      <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" />
                    ) : preparation.status === "ready" ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                    ) : (
                      <CircleAlert className="size-4 shrink-0 text-danger" />
                    )}
                    {m.preparationStatus[preparation.status]}
                  </div>
                  <ol className="space-y-3 text-sm" aria-label={c.setupSteps}>
                    {[m.preparationTitle, c.stepReview, m.apply, m.status.verifying].map(
                      (label, index) => (
                        <li
                          key={index}
                          className={`flex items-center gap-3 ${index ? "text-muted-foreground" : "font-medium"}`}
                          aria-current={index === 0 ? "step" : undefined}
                        >
                          <span
                            className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${index === 0 ? "bg-primary/10 text-primary" : "bg-muted"}`}
                          >
                            {index === 0 && preparation.status === "ready" ? (
                              <CheckCircle2 className="size-3.5" />
                            ) : (
                              index + 1
                            )}
                          </span>
                          {label}
                        </li>
                      ),
                    )}
                  </ol>
                  {preparation.error && (
                    <p role="alert" className="break-words text-sm leading-relaxed text-danger">
                      {preparation.error}
                    </p>
                  )}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {waiting ? m.selectionSavedHint : m.preparationHint}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {preparation.replacementPreparationId
                      ? m.selectionReplacedHint
                      : preparation.status === "cancelled"
                        ? m.setupDiscardedHint
                        : m.progressSaved}
                  </p>
                  {preparation.replacementPreparationId && (
                    <Button asChild className="h-auto min-h-10 w-full whitespace-normal py-2">
                      <Link
                        href={`/servers/clusters/preparations/${preparation.replacementPreparationId}`}
                      >
                        {m.viewUpdatedSetup}
                        <ArrowRight className="size-4 rtl:rotate-180" />
                      </Link>
                    </Button>
                  )}
                  {waiting && !preparation.cleanupOperationId && capabilities?.canManage && (
                    <Button
                      onClick={() => void retry()}
                      disabled={busy}
                      className="h-auto min-h-10 w-full whitespace-normal py-2"
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                      {m.retryPreparation}
                    </Button>
                  )}
                  {preparation.status === "ready" && preparation.operationId && (
                    <Button asChild className="h-auto min-h-10 w-full whitespace-normal py-2">
                      <Link href={`/servers/clusters/operations/${preparation.operationId}`}>
                        {m.reviewNetwork}
                        <ArrowRight className="size-4 rtl:rotate-180" />
                      </Link>
                    </Button>
                  )}
                  {capabilities?.canManage &&
                    (preparation.status === "failed" || preparation.status === "interrupted") && (
                      <div className="space-y-2">
                        <Button
                          onClick={() => void retry()}
                          disabled={busy}
                          className="h-auto min-h-10 w-full whitespace-normal py-2"
                        >
                          {busy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <RotateCcw className="size-4" />
                          )}
                          {m.retryPreparation}
                        </Button>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {m.retryPreparationHint}
                        </p>
                      </div>
                    )}
                  {capabilities?.canManage &&
                    !running &&
                    (!waiting || paused) &&
                    preparation.status !== "cancelled" && (
                      <Button
                        asChild
                        variant="ghost"
                        className="h-auto min-h-10 w-full whitespace-normal py-2"
                      >
                        <Link href={`${edit}?preparation=${encodeURIComponent(id)}`}>
                          {m.editSettings}
                        </Link>
                      </Button>
                    )}
                  {preparation.status === "cancelled" && (
                    <Button
                      asChild
                      className="w-full"
                      variant={preparation.replacementPreparationId ? "ghost" : "default"}
                    >
                      <Link href="/servers?tab=cluster">{m.closeSetup}</Link>
                    </Button>
                  )}
                </aside>
              </div>
            )}
          </>
        )}
      </section>
    </PageContainer>
  );
}
