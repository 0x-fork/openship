"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DatabaseBackup, HardDrive, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { servicesApi, type Service, type ServiceVolumeSizes } from "@/lib/api/services";
import { getApiErrorMessage } from "@/lib/api/client";
import { formatBytes } from "@/lib/formatBytes";

export function ServiceVolumesPanel({ service, projectId, deployTarget, onSave, onBackups }: {
  service: Service;
  projectId: string;
  deployTarget?: string | null;
  onSave: (volumes: string[]) => Promise<void>;
  onBackups?: () => void;
}) {
  const { t } = useI18n();
  const copy = t.projectDetail.services.detail.storage;
  const mounts = service.volumes ?? [];
  const volumeKey = JSON.stringify(mounts);
  const [sizes, setSizes] = useState<ServiceVolumeSizes | null>(null);
  const [loading, setLoading] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Mounted only in Volumes. A failed measurement waits for an explicit retry;
  // request state is deliberately not an effect dependency.
  useEffect(() => {
    setSizes(null);
    setSizeError(false);
    setLoading(false);
    if (!JSON.parse(volumeKey).length || deployTarget === "cloud") return;
    let active = true;
    setLoading(true);
    servicesApi.volumeSizes(projectId, service.id)
      .then((result) => { if (active) setSizes(result); })
      .catch(() => { if (active) setSizeError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, service.id, volumeKey, deployTarget, revision]);

  const startEditing = () => {
    setDraft(mounts.length ? [...mounts] : [""]);
    setSaveError(null);
    setEditing(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draft.map((mount) => mount.trim()).filter(Boolean));
      setEditing(false);
      setRevision((value) => value + 1);
    } catch (error) {
      setSaveError(getApiErrorMessage(error, t.projectDetail.services.detail.toast.updateFailed));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border/50 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
            <HardDrive className="size-4 text-muted-foreground" />
            {t.projectDetail.services.detail.volumes}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onBackups && <Button variant="outline" size="sm" onClick={onBackups}><DatabaseBackup className="size-4" />{copy.backups}</Button>}
          {!editing && <Button variant="outline" size="sm" onClick={startEditing}>
            {mounts.length ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            {mounts.length ? copy.edit : copy.add}
          </Button>}
        </div>
      </div>

      {editing ? (
        <form onSubmit={save} className="space-y-4 border-t border-border/40 p-5">
          <fieldset disabled={saving} className="space-y-3">
            {draft.map((mount, index) => (
              <div key={index} className="flex items-center gap-2">
                <input value={mount} maxLength={500}
                  aria-label={interpolate(copy.mountLabel, { n: String(index + 1) })}
                  placeholder="data:/app/data"
                  onChange={(event) => setDraft((current) => current.map((value, i) => i === index ? event.target.value : value))}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-border/50 bg-muted/20 px-3 font-mono text-sm text-foreground outline-none focus:border-primary/40" />
                <Button type="button" variant="ghost" size="icon" aria-label={interpolate(copy.removeMount, { n: String(index + 1) })}
                  onClick={() => setDraft((current) => current.filter((_, i) => i !== index))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" disabled={draft.length >= 50}
              onClick={() => setDraft((current) => [...current, ""])}><Plus className="size-4" />{copy.add}</Button>
          </fieldset>
          <p className="text-xs leading-relaxed text-muted-foreground">{copy.editHint}</p>
          {saveError && <p role="alert" className="text-sm text-danger">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setEditing(false)}>{copy.cancel}</Button>
            <Button type="submit" size="sm" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}{copy.save}</Button>
          </div>
        </form>
      ) : mounts.length ? (
        <>
          <div className="flex items-center justify-between gap-3 border-y border-border/40 bg-muted/10 px-5 py-2.5">
            <span className="text-xs text-muted-foreground">{interpolate(copy.mountCount, { count: String(mounts.length) })}</span>
            <div className="flex items-center gap-2">
              <span aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
                {loading ? copy.measuring : sizes?.measurable && sizes.totalBytes != null
                  ? `${sizes.partial ? "≥ " : ""}${formatBytes(sizes.totalBytes)}` : copy.usageUnavailable}
              </span>
              {deployTarget !== "cloud" && <Button variant="ghost" size="icon" className="size-7" disabled={loading}
                aria-label={copy.refresh} onClick={() => setRevision((value) => value + 1)}>
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>}
            </div>
          </div>
          {sizeError && <p role="alert" className="px-5 pt-3 text-xs text-muted-foreground">{copy.measureFailed}</p>}
          <ul className="divide-y divide-border/40">
            {mounts.map((mount, index) => {
              const measured = sizes?.measurable ? sizes.volumes.find((volume) => volume.raw === mount) : undefined;
              return (
                <li key={`${mount}-${index}`} className="flex items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm text-foreground">{mount}</p>
                    {measured && <p className="mt-1 text-xs text-muted-foreground">
                      {copy.kinds[measured.kind]}{measured.readOnly ? ` · ${copy.readOnly}` : ""}
                    </p>}
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {loading ? <Loader2 className="size-4 animate-spin" aria-label={copy.measuring} /> : measured?.bytes != null ? formatBytes(measured.bytes) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="border-t border-border/40 px-5 py-10 text-center">
          <HardDrive className="mx-auto mb-3 size-6 text-muted-foreground/60" />
          <p className="text-sm font-medium text-foreground">{copy.emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{copy.emptyDescription}</p>
        </div>
      )}
    </section>
  );
}
