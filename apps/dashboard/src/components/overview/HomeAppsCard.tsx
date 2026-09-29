"use client";

import { useId } from "react";
import Link from "next/link";
import { Icon } from "@repo/ui/icons";
import type { Project } from "@/constants/mock";
import { AppLogo } from "@/components/AppLogo";
import { useI18n } from "@/components/i18n-provider";
import { ProjectStatusBadge } from "@/components/shared/ProjectStatusBadge";
import { Button } from "@/components/ui/button";
import { projectCardHref } from "@/utils/project-status";
import HomeAppsIllustration from "./HomeAppsIllustration";

/** A focused view of Home's existing projects, with the shared catalog as its install entry. */
export default function HomeAppsCard({
  projects,
  loading,
}: {
  projects: Project[];
  loading: boolean;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const copy = t.dashboard.pages.apps;
  const apps = projects.filter((project) => project.isApp);

  return (
    <section aria-labelledby={headingId} aria-busy={loading} className="rounded-2xl bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {copy.title}
        </h3>
        {!loading && apps.length > 0 && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {apps.length}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{copy.loading}</p>
      ) : apps.length === 0 ? (
        <div className="text-center">
          <HomeAppsIllustration />
          <p className="text-sm font-medium text-foreground">{copy.emptyTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.description}</p>
        </div>
      ) : (
        <ul className="-mx-2 max-h-60 space-y-1 overflow-y-auto px-2">
          {apps.map((project) => (
            <li
              key={project.id}
              className="group relative flex min-w-0 items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/50"
            >
              <Link
                href={projectCardHref(project)}
                aria-label={project.name}
                className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
              <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/50">
                <AppLogo appId={project.appTemplateId ?? undefined} className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground" title={project.name}>
                  {project.name}
                </p>
                <ProjectStatusBadge
                  project={project}
                  className="mt-0.5 max-w-full rounded-md px-1.5 py-0.5 text-xs"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button asChild variant="secondary" size="sm" className="mt-4 w-full text-sm">
        <Link href="/apps/new">
          {copy.browseAll}
          <Icon name="arrow-right" className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}
