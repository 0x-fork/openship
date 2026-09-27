import { Icon } from "@repo/ui/icons";
import { cn } from "@/lib/utils";

/** Shared Cloud artwork; catalog glyphs over a quiet infrastructure diagram. */
export function CloudPlanIllustration({
  subscribed = false,
  className,
}: {
  subscribed?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none relative isolate aspect-[3/2] w-60 max-w-full select-none", className)}
    >
      <div
        className="absolute -inset-x-8 -top-6 bottom-0 -z-10 rounded-full"
        style={{ background: "radial-gradient(ellipse, color-mix(in oklab, var(--th-btn-accent-from) 12%, transparent), transparent 68%)" }}
      />
      <svg viewBox="0 0 240 160" className="absolute inset-0 size-full text-foreground" fill="none" focusable="false">
        <g stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.14">
          <path d="M120 92v33M56 125v-6a7 7 0 0 1 7-7h114a7 7 0 0 1 7 7v6" />
        </g>
        <g fill="currentColor" opacity="0.05">
          <rect x="38" y="125" width="36" height="18" rx="6" />
          <rect x="102" y="125" width="36" height="18" rx="6" />
          <rect x="166" y="125" width="36" height="18" rx="6" />
        </g>
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.25">
          <path d="M49 134h2m6 0h6M113 134h2m6 0h6M177 134h2m6 0h6" />
        </g>
      </svg>
      <div className="absolute left-1/2 top-[8%] aspect-square w-[44%] -translate-x-1/2 text-foreground/85">
        <Icon name="cloud" className="size-full" />
        {subscribed && (
          <span className="absolute bottom-[10%] right-0 flex size-9 items-center justify-center rounded-full bg-[var(--th-card-bg-solid)] p-1">
            <span className="flex size-full items-center justify-center rounded-full bg-success/15 text-success">
              <Icon name="check" className="size-4" />
            </span>
          </span>
        )}
      </div>
      <Icon name="sparkles" className="absolute right-[21%] top-[12%] size-[8%] text-[var(--th-btn-accent-from)]" />
    </div>
  );
}
