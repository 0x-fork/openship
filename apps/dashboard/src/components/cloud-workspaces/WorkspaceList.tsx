"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon as UiIcon } from "@repo/ui/icons";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { PageContainer } from "@/components/ui/PageContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { usePlatform } from "@/context/PlatformContext";
import { cloudWorkspacesApi } from "@/lib/api/cloud-workspaces";
import { getApiErrorMessage } from "@/lib/api/client";
import { useCloudWorkspaces } from "./useCloudWorkspaces";

export function WorkspaceList() {
  const { t } = useI18n();
  const copy = t.billing.workspaces;
  const { selfHosted } = usePlatform();
  const router = useRouter();
  const { data, loading, error: loadError, refresh } = useCloudWorkspaces(!selfHosted);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("shared");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const row = await cloudWorkspacesApi.create({
        name: name.trim(),
        mode: kind === "shared" ? "shared" : "dedicated",
        runtime: kind === "native" ? "native" : "docker",
      });
      router.push(`/workspaces/${encodeURIComponent(row.id)}`);
    } catch (error) {
      setError(getApiErrorMessage(error));
      setBusy(false);
    }
  }
  if (selfHosted)
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">{copy.cloudOnly}</p>
      </PageContainer>
    );
  return (
    <PageContainer className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <Button onClick={() => setCreating((value) => !value)}>
          {creating ? t.dashboard.pages.apps.cancel : copy.create}
        </Button>
      </header>
      {creating && (
        <form onSubmit={create} className="space-y-4 rounded-2xl bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              <span>{t.dashboard.pages.apps.nameLabel}</span>
              <Input
                variant="filled"
                value={name}
                autoFocus
                maxLength={80}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="space-y-2">
              <label className="text-sm font-medium">{copy.mode}</label>
              <CustomSelect
                aria-label={copy.mode}
                value={kind}
                onChange={setKind}
                variant="filled"
                triggerClassName="bg-muted/60 hover:bg-muted"
                options={[
                  { value: "shared", label: copy.shared, description: copy.sharedHint },
                  { value: "dedicated", label: copy.dedicated, description: copy.dedicatedHint },
                  { value: "native", label: copy.native, description: copy.nativeHint },
                ]}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{copy.createHint}</p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? copy.loading : copy.create}
          </Button>
        </form>
      )}
      {loadError && (
        <div role="alert" className="space-y-3 rounded-2xl bg-card p-5 text-sm">
          <p>{loadError}</p>
          <Button variant="secondary" onClick={refresh}>
            {t.billing.plansRoute.tryAgain}
          </Button>
        </div>
      )}
      {loading ? (
        <div aria-label={copy.loading} aria-busy="true" className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((id) => (
            <div key={id} className="h-40 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.workspaces.map((row) => (
            <Link
              key={row.id}
              href={`/workspaces/${encodeURIComponent(row.id)}`}
              className="rounded-2xl bg-card p-5 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{row.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.mode === "shared"
                      ? copy.shared
                      : row.runtime === "native"
                        ? copy.native
                        : copy.dedicated}
                  </p>
                </div>
                <UiIcon name="cloud" className="size-5 text-muted-foreground" aria-hidden />
              </div>
              <div className="mt-5 flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {interpolate(copy.projectCount, { count: String(row.projectCount) })}
                </span>
                <span>{(copy.states as Record<string, string>)[row.state] ?? row.state}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      {!loading && !loadError && !data?.workspaces.length && (
        <section className="rounded-2xl bg-card px-6 py-12 text-center">
          <UiIcon name="cloud" className="mx-auto mb-4 size-9 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{copy.empty}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{copy.createHint}</p>
          <Button className="mt-5" onClick={() => setCreating(true)}>
            {copy.create}
          </Button>
        </section>
      )}
      {data?.dedicatedBilling && (
        <Link
          className="inline-flex text-sm font-medium text-primary hover:underline"
          href="/billing/overview"
        >
          {copy.dedicatedProjects}
        </Link>
      )}
    </PageContainer>
  );
}
