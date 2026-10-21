"use client";

import type { RuntimeImageCheckResult } from "@repo/contracts";
import { LANGUAGES, type Language } from "@repo/core";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import WarningCallout from "@/components/shared/WarningCallout";

function runtimeLabel(runtime: string): string {
  if (Object.hasOwn(LANGUAGES, runtime)) return LANGUAGES[runtime as Language].name;
  return (
    ({ node: "Node.js", bun: "Bun", deno: "Deno", dotnet: ".NET" } as Record<string, string>)[
      runtime
    ] ?? runtime
  );
}

/** Image drift shares the existing new-commit notice and redeploy action pattern. */
export function RuntimeImageUpdateNotice({
  result,
  busy,
  onRefresh,
}: {
  result: RuntimeImageCheckResult | null;
  busy: boolean;
  onRefresh: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const copy = t.projectSettings.runtimeUpdates;
  const changed = result?.images.filter((image) => image.status === "update_available") ?? [];
  if (!result) return null;
  const observations = [
    ...(result.verification.app ? [{ id: "app", name: null, value: result.verification.app }] : []),
    ...Object.entries(result.verification.services ?? {}).map(([id, value]) => ({
      id,
      name: result.images.find((image) => image.serviceId === id)?.serviceName ?? id,
      value,
    })),
  ];
  return (
    <div role="status" className="space-y-2">
      {changed.length > 0 && (
        <WarningCallout
          title={copy.available}
          description={
            <span className="space-y-1">
              {changed.map((image) => (
                <span
                  key={`${image.serviceId}:${image.role}:${image.ref}`}
                  className="block break-all"
                >
                  <span>
                    {image.serviceName ? `${image.serviceName}: ` : ""}
                    {image.ref}
                  </span>
                  {image.currentDigest && image.latestDigest && (
                    <code
                      className="ms-2 text-xs"
                      dir="ltr"
                      title={`${image.currentDigest} → ${image.latestDigest}`}
                    >
                      {image.currentDigest.slice(0, 19)} → {image.latestDigest.slice(0, 19)}
                    </code>
                  )}
                </span>
              ))}
            </span>
          }
          actions={
            <Button
              size="sm"
              className="h-auto min-h-8 max-w-full whitespace-normal py-2 text-start"
              disabled={busy}
              onClick={() => void onRefresh()}
            >
              {busy ? copy.refreshing : copy.refresh}
            </Button>
          }
        />
      )}
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{copy.lastObserved}:</span>
        {observations.length === 0 ? (
          <span>{copy.verificationUnavailable}</span>
        ) : (
          observations.map(({ id, name, value }) => (
            <span key={id} title={value.checkedAt}>
              {name ? `${name}: ` : ""}
              {value.status === "verified" && value.runtime && value.version
                ? `${runtimeLabel(value.runtime)} ${value.version}`
                : `${copy.verificationUnavailable}${value.reason ? ` — ${value.reason}` : ""}`}
              {value.imageId && (
                <code className="ms-2" dir="ltr" title={value.imageId}>
                  {value.imageId.slice(0, 19)}
                </code>
              )}
            </span>
          ))
        )}
      </p>
    </div>
  );
}
