"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { Icon } from "@repo/ui/icons";
import { useI18n, interpolate } from "@/components/i18n-provider";
import {
  TopologyCanvas,
  type TopologyNodeAction,
  type TopologySelection,
} from "@/components/topology/TopologyCanvas";
import { ServiceIcon } from "@/components/services/ServiceIcon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Tabs } from "@/components/ui/Tabs";
import type { DiscoveredGroup, DiscoveredService } from "@/lib/api/server-migration";
import {
  discoveryGraph,
  groupKey,
  isBlocked,
  isProxy,
  selectableServices,
  svcUid,
} from "./discovery-model";
import "@/components/scale/scale.css";
import "@/components/topology/topology.css";

export type DiscoveryView = "topology" | "cards";
interface SelectionProject {
  id: string;
  name: string;
  services: ReadonlySet<string>;
}
interface DiscoveredProjectsProps {
  groups: DiscoveredGroup[];
  activeProject: SelectionProject;
  projects: SelectionProject[];
  claimedBy: ReadonlyMap<string, string>;
  view: DiscoveryView;
  onViewChange: (view: DiscoveryView) => void;
  onToggle: (service: DiscoveredService, group: DiscoveredGroup) => void;
  onToggleGroup: (group: DiscoveredGroup) => void;
}

/** Two presentations of the same selection. Neither writes to the source server. */
export function DiscoveredProjects(props: DiscoveredProjectsProps) {
  const { t } = useI18n();
  const d = t.migration.discover;
  const id = useId();
  return (
    <section className="min-w-0 space-y-4" aria-label={d.chooseProject}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{d.chooseProject}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{d.chooseHint}</p>
        </div>
        <Tabs
          tabs={[
            { key: "topology", label: d.topology, icon: "topology" },
            { key: "cards", label: d.cards, icon: "grid" },
          ]}
          value={props.view}
          onChange={props.onViewChange}
          columns={2}
          idPrefix={id}
          ariaLabel={d.viewLabel}
          className="shrink-0 rounded-xl bg-card p-1"
        />
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel-${props.view}`}
        aria-labelledby={`${id}-tab-${props.view}`}
        className="space-y-4"
      >
        {props.groups.map((group, index) => (
          <DiscoveredProject
            key={groupKey(group)}
            {...props}
            group={group}
            initiallyExpanded={index === 0}
          />
        ))}
      </div>
      {props.view === "topology" && (
        <p className="text-xs text-muted-foreground">{d.topologyHint}</p>
      )}
    </section>
  );
}

function DiscoveredProject({
  group,
  activeProject,
  projects,
  claimedBy,
  view,
  onToggle,
  onToggleGroup,
  initiallyExpanded,
}: DiscoveredProjectsProps & { group: DiscoveredGroup; initiallyExpanded: boolean }) {
  const { t } = useI18n();
  const d = t.migration.discover;
  const graph = useMemo(() => discoveryGraph(group, d.dependsOn), [group, d.dependsOn]);
  const [selection, setSelection] = useState<TopologySelection>(null);
  const [expanded, setExpanded] = useState(
    () =>
      initiallyExpanded ||
      group.services.some((service) => activeProject.services.has(svcUid(service))),
  );
  const graphId = useId();
  const title = group.project ?? d.standaloneGroup;
  const available = selectableServices(group, activeProject.id, claimedBy);
  const pickedCount = available.filter((service) =>
    activeProject.services.has(svcUid(service)),
  ).length;
  const allSelected = available.length > 0 && pickedCount === available.length;
  const actions = useMemo(
    () =>
      Object.fromEntries(
        group.services.map((service) => {
          const uid = svcUid(service);
          const owner = claimedBy.get(uid);
          const claimedElsewhere = owner && owner !== activeProject.id;
          const hint = isBlocked(service)
            ? d.buildBlocked
            : isProxy(service)
              ? interpolate(d.proxyExcluded, {
                  ports: (service.edgePorts ?? []).map((port) => `:${port}`).join("/"),
                })
              : claimedElsewhere
                ? interpolate(d.claimedIn, {
                    project: projects.find((project) => project.id === owner)?.name ?? "",
                  })
                : undefined;
          const selected = activeProject.services.has(uid);
          return [
            uid,
            {
              selected,
              disabled: Boolean(hint),
              hint,
              label: hint ? d.unavailable : selected ? d.selected : d.selectService,
              ariaLabel: interpolate(d.selectNamedService, { name: service.name }),
              statusLabel: service.running ? d.running : d.stopped,
            } satisfies TopologyNodeAction,
          ];
        }),
      ),
    [group, activeProject, projects, claimedBy, d],
  );
  const toggle = useCallback(
    (id: string) => {
      const service = group.services.find((service) => svcUid(service) === id);
      if (service && !actions[id]?.disabled) {
        setExpanded(true);
        onToggle(service, group);
      }
    },
    [group, actions, onToggle],
  );
  const select = useCallback(
    (next: TopologySelection) => {
      if (next?.kind === "node") toggle(next.id);
      else setSelection(next);
    },
    [toggle],
  );
  return (
    <section className="@container overflow-hidden rounded-2xl bg-card" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-foreground">
            {view === "topology" ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                aria-controls={graphId}
                className="inline-flex max-w-full items-center gap-2 rounded-md text-start focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="truncate" title={title}>
                  {title}
                </span>
                <Icon
                  name="chevron-down"
                  className={`size-3.5 shrink-0 text-muted-foreground ${expanded ? "rotate-180" : ""}`}
                />
              </button>
            ) : (
              <span className="block truncate" title={title}>
                {title}
              </span>
            )}
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {group.project && <>{d.composeGroup} · </>}
            {interpolate(t.migration.tab.servicesCount, { n: String(group.services.length) })}
          </p>
        </div>
        {available.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            role="checkbox"
            aria-checked={allSelected ? true : pickedCount ? "mixed" : false}
            aria-label={interpolate(d.selectProject, { name: title })}
            onClick={() => {
              setExpanded(true);
              onToggleGroup(group);
            }}
          >
            <Checkbox
              asButton={false}
              checked={allSelected ? true : pickedCount ? "indeterminate" : false}
            />
            {allSelected ? d.clearSelection : d.selectAll}
          </Button>
        )}
      </div>
      {view === "topology" ? (
        expanded && (
          <div
            id={graphId}
            className="topology-workspace"
            style={{ height: group.services.length > 2 ? 420 : 260, minHeight: 0 }}
          >
            <TopologyCanvas
              graph={graph}
              layoutKey={null}
              selection={selection}
              fullscreen={false}
              inert={false}
              onSelect={select}
              onOpen={toggle}
              nodeActions={actions}
              ariaLabel={`${title} — ${d.topology}`}
              nodeDescription={d.selectionKeyboard}
            />
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-3 p-4 pt-0 @2xl:grid-cols-2">
          {group.services.map((service) => {
            const action = actions[svcUid(service)]!;
            return (
              <button
                key={svcUid(service)}
                type="button"
                role="checkbox"
                aria-checked={action.selected}
                disabled={action.disabled}
                aria-label={action.ariaLabel}
                onClick={() => toggle(svcUid(service))}
                className={`flex min-w-0 items-start gap-3 rounded-xl p-4 text-start transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed ${action.selected ? "bg-primary/10" : "bg-background hover:bg-muted"}`}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                  <ServiceIcon service={service} />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {service.name}
                  </span>
                  <span
                    className="block truncate text-xs text-muted-foreground"
                    title={service.image ?? service.build}
                  >
                    {service.image ?? service.build}
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span
                      className="topology-status"
                      data-state={service.running ? "running" : "stopped"}
                    >
                      {action.statusLabel}
                    </span>
                    {service.volumes.length > 0 && (
                      <span>{interpolate(d.nVolumes, { n: String(service.volumes.length) })}</span>
                    )}
                  </span>
                  {action.hint && (
                    <span className="block text-xs text-muted-foreground">{action.hint}</span>
                  )}
                </span>
                <Checkbox asButton={false} checked={action.selected} />
              </button>
            );
          })}
        </div>
      )}
      {view === "topology" && group.services.some((service) => actions[svcUid(service)]?.hint) && (
        <div className="space-y-1 px-4 pb-4 text-xs text-muted-foreground">
          {group.services
            .filter((service) => actions[svcUid(service)]?.hint)
            .map((service) => (
              <p key={svcUid(service)}>
                <span className="font-medium text-foreground">{service.name}</span> ·{" "}
                {actions[svcUid(service)]!.hint}
              </p>
            ))}
        </div>
      )}
    </section>
  );
}
