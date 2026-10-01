"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CloudWorkspaceSummary, CloudWorkspaceResizePreview } from "@repo/contracts";
import { formatCpuCores, formatMemoryMb, type CloudAllocation } from "@repo/core";
import { Icon as UiIcon } from "@repo/ui/icons";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { PageContainer } from "@/components/ui/PageContainer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePlatform } from "@/context/PlatformContext";
import { ApiError, getApiErrorMessage } from "@/lib/api/client";
import { cloudWorkspacesApi } from "@/lib/api/cloud-workspaces";
import { randomUUID } from "@/lib/random-uuid";
import { workspaceBillingHref } from "@/components/billing/BillingWorkspaceContext";
import { WorkspaceUsage } from "./WorkspaceUsage";

export function WorkspaceDetail({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const copy = t.billing.workspaces;
  const router = useRouter();
  const { selfHosted } = usePlatform();
  const [row, setRow] = useState<CloudWorkspaceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<CloudWorkspaceResizePreview | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const resizeKey = useRef<string | null>(null);
  const deleteKey = useRef<string | null>(null);
  const deletingRef = useRef(false);
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (selfHosted) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await cloudWorkspacesApi.get(id);
        if (!active) return;
        setRow(value);
        setLoadError(null);
        deletingRef.current = value.state === "deleting";
        if (value.operation && ["queued", "running"].includes(value.operation.status))
          timer = setTimeout(poll, 3_000);
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404 && deletingRef.current) {
          router.replace("/workspaces");
          return;
        }
        setLoadError(getApiErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selfHosted, id, attempt, router]);
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh();
    } catch (error) {
      setError(getApiErrorMessage(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const pending = !!row?.operation && ["queued", "running"].includes(row.operation.status);
  const completed = !row?.operation || row.operation.status === "succeeded";
  const stopped = !!row && ["stopped", "paused", "suspended"].includes(row.state);
  const size = (value: CloudAllocation) =>
    `${formatCpuCores(value.cpuCores)} · ${formatMemoryMb(value.memoryMb)} · ${formatMemoryMb(value.diskMb)} ${t.billing.header.diskCap}`;
  const sameSize =
    preview &&
    ["cpuCores", "memoryMb", "diskMb"].every(
      (key) =>
        preview.before[key as keyof CloudAllocation] ===
        preview.after[key as keyof CloudAllocation],
    );
  if (selfHosted)
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">{copy.cloudOnly}</p>
      </PageContainer>
    );
  return (
    <PageContainer className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <Link href="/workspaces" className="text-sm text-muted-foreground hover:text-foreground">
            {copy.title}
          </Link>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">
            {row?.name ?? copy.singular}
          </h1>
          {row && (
            <p className="mt-1 text-sm text-muted-foreground">
              {row.mode === "shared"
                ? copy.sharedHint
                : row.runtime === "native"
                  ? copy.nativeHint
                  : copy.dedicatedHint}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            disabled={loading || busy}
            aria-label={t.billing.resourceOverview.refresh}
            onClick={refresh}
          >
            <UiIcon name="refresh" className="size-4" aria-hidden />
          </Button>
          <Button asChild variant="secondary">
            <Link href={workspaceBillingHref("/billing/overview", id)}>
              {t.dashboard.nav.billing}
            </Link>
          </Button>
        </div>
      </header>
      {(error || loadError) && (
        <p role="alert" className="rounded-xl bg-danger/5 p-4 text-sm text-danger">
          {error || loadError}
        </p>
      )}
      {loading && !row && (
        <div
          aria-label={copy.loading}
          aria-busy="true"
          className="h-52 animate-pulse rounded-2xl bg-card"
        />
      )}
      {row && (
        <>
          <section className="rounded-2xl bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{copy.provisioned}</h2>
                <p className="mt-2 text-sm">
                  {(copy.states as Record<string, string>)[row.state] ?? row.state}
                </p>
                {row.resources && (
                  <p className="mt-2 text-base font-medium tabular-nums">{size(row.resources)}</p>
                )}
                <p className="mt-2 text-sm text-muted-foreground">
                  {row.runtime === "docker" ? copy.poolHint : copy.nativeHint}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {row.planTierId === "free" ? (
                  <Button asChild>
                    <Link href={workspaceBillingHref("/billing/plans", id)}>
                      {t.billing.onboarding.choosePlan}
                    </Link>
                  </Button>
                ) : (
                  row.runtime === "docker" && (
                    <>
                      {(!row.resources || stopped) && completed && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              setRow(await cloudWorkspacesApi.ensure(id));
                            })
                          }
                        >
                          {stopped ? copy.resume : copy.provision}
                        </Button>
                      )}
                      {row.resources && !pending && (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const value = await cloudWorkspacesApi.previewResize(id);
                              resizeKey.current = randomUUID();
                              setDeleting(false);
                              setPreview(value);
                            })
                          }
                        >
                          {copy.resize}
                        </Button>
                      )}
                    </>
                  )
                )}
              </div>
            </div>
            {row.operation && (
              <div className="mt-5 space-y-3 rounded-xl bg-muted/30 p-4" aria-live="polite">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">{copy.operation}</h3>
                  {row.operation.status === "failed" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          setRow(await cloudWorkspacesApi.retry(id));
                        })
                      }
                    >
                      {t.billing.plansRoute.tryAgain}
                    </Button>
                  )}
                </div>
                {row.operation.error && (
                  <p className="text-sm text-danger">{row.operation.error}</p>
                )}
                {row.operation.nextAttemptAt && (
                  <p className="text-xs text-muted-foreground">
                    {copy.nextAttempt}{" "}
                    {new Date(row.operation.nextAttemptAt).toLocaleString(locale)}
                  </p>
                )}
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                  {row.operation.logs.join("\n")}
                </pre>
              </div>
            )}
            {preview && (
              <div className="mt-5 space-y-4 rounded-xl bg-muted/30 p-4">
                <h3 className="text-base font-semibold">{copy.resizeConfirm}</h3>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">{copy.before}</dt>
                    <dd className="mt-1 font-medium">{size(preview.before)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{copy.after}</dt>
                    <dd className="mt-1 font-medium">{size(preview.after)}</dd>
                  </div>
                </dl>
                <p className="text-sm text-muted-foreground">
                  {sameSize ? copy.noResize : copy.restartHint}
                </p>
                {!sameSize && preview.restartProjects.length > 0 && (
                  <p className="text-sm">
                    {preview.restartProjects.map((project) => project.name).join(", ")}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!sameSize && (
                    <Button
                      disabled={busy || pending}
                      onClick={() =>
                        void run(async () => {
                          setRow(
                            await cloudWorkspacesApi.resize(id, {
                              revision: preview.revision,
                              confirmRestart: true,
                              idempotencyKey: resizeKey.current!,
                            }),
                          );
                          setPreview(null);
                        })
                      }
                    >
                      {copy.confirmResize}
                    </Button>
                  )}
                  <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>
                    {t.billing.deployGate.close}
                  </Button>
                </div>
              </div>
            )}
          </section>
          <WorkspaceUsage
            key={`${id}:${row.resources?.memoryMb}:${row.resources?.diskMb}`}
            workspaceId={id}
            resources={row.resources}
            showProjects
            metrics={row.runtime === "docker"}
          />
          <section className="rounded-2xl bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">{t.dashboard.nav.settings}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {interpolate(copy.projectCount, { count: String(row.projectCount) })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || pending}
                  onClick={() => {
                    setName(row.name);
                    setRenaming((value) => !value);
                  }}
                >
                  {copy.rename}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy || pending || row.projectCount > 0}
                  onClick={() => {
                    setDeleting((value) => !value);
                    setPreview(null);
                    deleteKey.current = randomUUID();
                  }}
                >
                  {copy.delete}
                </Button>
              </div>
            </div>
            {renaming && (
              <form
                className="mt-4 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    setRow(await cloudWorkspacesApi.rename(id, name));
                    setRenaming(false);
                  });
                }}
              >
                <Input
                  aria-label={t.dashboard.pages.apps.nameLabel}
                  value={name}
                  maxLength={80}
                  required
                  variant="filled"
                  onChange={(event) => setName(event.target.value)}
                />
                <Button type="submit" disabled={busy || !name.trim()}>
                  {copy.save}
                </Button>
              </form>
            )}
            {deleting && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">{copy.deleteHint}</p>
                <Button
                  variant="destructive"
                  disabled={busy || pending}
                  onClick={() =>
                    void run(async () => {
                      const value = await cloudWorkspacesApi.remove(id, {
                        confirmDelete: true,
                        idempotencyKey: deleteKey.current!,
                      });
                      deletingRef.current = true;
                      setRow(value);
                      setDeleting(false);
                    })
                  }
                >
                  {copy.confirmDelete}
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </PageContainer>
  );
}
