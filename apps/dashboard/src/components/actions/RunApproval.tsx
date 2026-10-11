"use client";
import { Icon } from "@repo/ui/icons";
import type { ActionRunView } from "@repo/contracts";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { actionsApi } from "@/lib/api/actions";
import { useActionResource } from "./useActions";
import { ActionError } from "./ActionStatus";
import Link from "next/link";

export function RunApproval({
  run,
  busy,
  onApprove,
}: {
  run: ActionRunView;
  busy: boolean;
  onApprove: () => void;
}) {
  const { t } = useI18n();
  const c = t.actions.access;
  const runners = useActionResource(actionsApi.runners);
  const blocked = run.admission?.state === "blocked";
  const destinations = runners.data?.filter((runner) => run.runnerIds?.includes(runner.id)) ?? [];
  const loaded =
    !!runners.data && !!run.runnerIds?.length && destinations.length === run.runnerIds.length;
  const destinationError =
    runners.error ?? (runners.data && !loaded ? c.destinationsUnavailable : null);
  return (
    <section
      className="space-y-3 rounded-xl bg-card p-4"
      aria-label={blocked ? c.blocked : c.waiting}
    >
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Icon name="shield" className="size-4 text-muted-foreground" />
        {blocked ? c.blocked : c.waiting}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {blocked
          ? (c.reasons[run.admission!.reason as keyof typeof c.reasons] ?? c.blocked)
          : interpolate(c.reviewHint, {
              commit: run.revision.slice(0, 12),
              attempt: String(run.attempt),
              actor:
                run.triggeringActor && run.triggeringActor !== run.actor
                  ? `${run.actor} / ${run.triggeringActor}`
                  : run.actor,
            })}
      </p>
      <ActionError message={destinationError} onRetry={runners.refresh} />
      {runners.loading && !runners.data && (
        <div className="h-9 animate-pulse rounded-lg bg-background" aria-busy="true" />
      )}
      {!!destinations.length && (
        <div className="flex flex-wrap gap-2" aria-label={c.destinations}>
          {destinations.map((runner) => (
            <span
              key={runner.id}
              className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs"
            >
              <Icon
                name={runner.kind === "cloud" ? "cloud" : "server"}
                className="size-3.5 text-muted-foreground"
              />
              {runner.name}
            </span>
          ))}
        </div>
      )}
      {destinations.some((runner) => runner.kind === "cloud") && (
        <p className="text-xs text-muted-foreground">{c.budget}</p>
      )}
      {blocked ? (
        <Button asChild size="sm" variant="secondary">
          <Link href={`/actions/workflows/${run.workflowId}`}>{c.settings}</Link>
        </Button>
      ) : run.canApprove === true ? (
        <Button size="sm" disabled={busy || !loaded || !!destinationError} onClick={onApprove}>
          {c.approve}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{c.reviewerRequired}</p>
      )}
    </section>
  );
}
