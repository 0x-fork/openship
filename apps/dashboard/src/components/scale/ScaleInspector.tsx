"use client";

import { memo, useEffect, useId, useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Info,
  Minus,
  Plus,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { ResourceIcon } from "./ResourceIcon";
import {
  ALGORITHMS,
  APPLICATION_TYPES,
  CLUSTER_ENGINES,
  MAX_INSTANCES,
  REGIONS,
  RESOURCE_META,
  connectionError,
  isClusterKind,
  instanceCount,
  redisSlotRanges,
  serviceInstances,
  type ScaleDraft,
  type ScaleResource,
  type ScaleSelection,
  type ScaleService,
} from "./topology";

interface InspectorProps {
  draft: ScaleDraft;
  selection: ScaleSelection;
  onUpdate: (resource: ScaleResource) => void;
  onUpdateService: (service: ScaleService, count?: number) => void;
  onSelect: (selection: ScaleSelection) => void;
  onConnect: (source: string, target: string) => void;
  onRemoveNodes: (ids: string[]) => void;
  onRemoveEdges: (ids: string[]) => void;
  onClose: () => void;
}

function Section({
  title,
  children,
  description,
}: {
  title: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  path = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  path?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const [error, setError] = useState("");
  useEffect(() => setText(value), [value]);
  return (
    <div className="space-y-2">
      <label className="text-sm text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        value={text}
        maxLength={path ? 200 : 60}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setError("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={() => {
          const next = text.trim();
          if (!next || (path && !next.startsWith("/"))) {
            setText(value);
            setError(path ? "Use a path starting with /." : "A name is required.");
          } else {
            setText(next);
            onChange(next);
          }
        }}
      />
      {error && (
        <p className="text-xs text-danger" role="alert" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          <Minus />
        </Button>
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={text}
          className="h-10 min-w-0 text-center tabular-nums"
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const number = Number(next);
            if (next && Number.isInteger(number) && number >= min && number <= max)
              onChange(number);
          }}
          onBlur={() => setText(String(value))}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm text-muted-foreground">{label}</legend>
      <CustomSelect value={value} options={options} onChange={onChange} />
    </fieldset>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-foreground/80">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} ariaLabel={label} />
    </div>
  );
}

function ApplicationSettings({
  service,
  draft,
  onUpdateService,
}: { service: ScaleService } & Pick<InspectorProps, "draft" | "onUpdateService">) {
  const count = serviceInstances(draft, service.id).length;
  return (
    <>
      <Section
        title="Application"
        description="Shared configuration for every instance. No runtime-specific behavior."
      >
        <TextField
          label="Application name"
          value={service.name}
          onChange={(name) => onUpdateService({ ...service, name })}
        />
        <SelectField
          label="Application type"
          value={service.applicationType}
          options={Object.entries(APPLICATION_TYPES).map(([value, label]) => ({ value, label }))}
          onChange={(applicationType) =>
            onUpdateService({
              ...service,
              applicationType: applicationType as ScaleService["applicationType"],
            })
          }
        />
      </Section>
      <Section
        title="Horizontal scaling"
        description="Each instance is a separate node on the canvas. OpenShip Edge balances traffic directly across them."
      >
        <NumberField
          label={service.autoscale ? "Initial instances" : "Instances"}
          value={count}
          min={service.autoscale ? service.minReplicas : 1}
          max={service.autoscale ? service.maxReplicas : MAX_INSTANCES}
          onChange={(replicas) => onUpdateService(service, replicas)}
        />
        <ToggleField
          label="Autoscaling policy"
          description="Plan capacity based on CPU utilization."
          checked={service.autoscale}
          onChange={(autoscale) =>
            onUpdateService(
              { ...service, autoscale },
              autoscale
                ? Math.max(service.minReplicas, Math.min(service.maxReplicas, count))
                : count,
            )
          }
        />
        {service.autoscale && (
          <>
            <NumberField
              label="Minimum instances"
              value={service.minReplicas}
              min={1}
              max={service.maxReplicas}
              onChange={(minReplicas) =>
                onUpdateService({ ...service, minReplicas }, Math.max(count, minReplicas))
              }
            />
            <NumberField
              label="Maximum instances"
              value={service.maxReplicas}
              min={service.minReplicas}
              max={MAX_INSTANCES}
              onChange={(maxReplicas) =>
                onUpdateService({ ...service, maxReplicas }, Math.min(count, maxReplicas))
              }
            />
            <NumberField
              label="Target CPU (%)"
              value={service.targetCpu}
              min={20}
              max={90}
              step={5}
              onChange={(targetCpu) => onUpdateService({ ...service, targetCpu })}
            />
            <Note>Policy preview only. No autoscaler is running.</Note>
          </>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          New instances inherit the application’s gateway routes and database connections. Keep
          application state outside these instances.
        </p>
      </Section>
      <Section title="Per-instance resources">
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="vCPU"
            value={String(service.cpu)}
            options={[0.5, 1, 2, 4].map((cpu) => ({ value: String(cpu), label: `${cpu} vCPU` }))}
            onChange={(cpu) => onUpdateService({ ...service, cpu: Number(cpu) })}
          />
          <SelectField
            label="Memory"
            value={String(service.memory)}
            options={[512, 1024, 2048, 4096, 8192].map((memory) => ({
              value: String(memory),
              label: `${memory / 1024} GB`,
            }))}
            onChange={(memory) => onUpdateService({ ...service, memory: Number(memory) })}
          />
        </div>
        <NumberField
          label="Application port"
          value={service.port}
          min={1}
          max={65535}
          onChange={(port) => onUpdateService({ ...service, port })}
        />
      </Section>
    </>
  );
}

function Configuration({
  resource,
  draft,
  onUpdate,
  onUpdateService,
}: { resource: ScaleResource } & Pick<InspectorProps, "draft" | "onUpdate" | "onUpdateService">) {
  const [showSlots, setShowSlots] = useState(false);
  const service =
    resource.kind === "service"
      ? draft.services.find((entry) => entry.id === resource.serviceId)
      : undefined;
  const cluster = isClusterKind(resource.kind);
  return (
    <>
      {service && (
        <ApplicationSettings service={service} draft={draft} onUpdateService={onUpdateService} />
      )}
      <Section
        title={resource.kind === "service" ? "Instance placement" : cluster ? "Cluster" : "General"}
      >
        {isClusterKind(resource.kind) && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Engine</span>
            <span className="text-foreground/80">{CLUSTER_ENGINES[resource.kind]}</span>
          </div>
        )}
        {resource.kind !== "service" && (
          <TextField
            label={cluster ? "Cluster name" : "Resource name"}
            value={resource.name}
            onChange={(name) => onUpdate({ ...resource, name })}
          />
        )}
        <SelectField
          label="Region"
          value={resource.region}
          options={REGIONS.map((region) => ({ value: region.id, label: region.name }))}
          onChange={(region) => onUpdate({ ...resource, region })}
        />
      </Section>
      {resource.kind === "edge" && (
        <Section
          title="OpenShip Edge"
          description="One OpenResty + Lua gateway handles ingress, TLS, API routing, and load balancing."
        >
          <ToggleField
            label="TLS termination"
            description="Terminate HTTPS at this gateway."
            checked={resource.tls}
            onChange={(tls) => onUpdate({ ...resource, tls })}
          />
          <SelectField
            label="Balancing algorithm"
            value={resource.algorithm}
            options={Object.entries(ALGORITHMS).map(([value, label]) => ({ value, label }))}
            onChange={(algorithm) =>
              onUpdate({ ...resource, algorithm: algorithm as keyof typeof ALGORITHMS })
            }
          />
          <TextField
            label="Health check path"
            value={resource.healthPath}
            path
            onChange={(healthPath) => onUpdate({ ...resource, healthPath })}
          />
          <NumberField
            label="Health check interval (seconds)"
            value={resource.healthInterval}
            min={5}
            max={120}
            step={5}
            onChange={(healthInterval) => onUpdate({ ...resource, healthInterval })}
          />
          <Note>
            Connect this gateway directly to application instances or another OpenShip Edge. There
            is no separate load balancer to provision.
          </Note>
        </Section>
      )}
      {resource.kind === "postgres" && (
        <Section
          title="Replication"
          description="One writable primary with read replicas, not multi-primary or write sharding."
        >
          <div className="flex justify-between rounded-xl bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Primary</span>
            <span className="text-foreground/80">1 read / write</span>
          </div>
          <NumberField
            label="Read replicas"
            value={resource.replicas}
            min={0}
            max={8}
            onChange={(replicas) =>
              onUpdate({ ...resource, replicas, failover: replicas > 0 && resource.failover })
            }
          />
          <ToggleField
            label="Plan automatic failover"
            description={
              resource.replicas
                ? "Promote a replica if the primary fails."
                : "Add a read replica to plan failover."
            }
            checked={resource.failover}
            disabled={!resource.replicas}
            onChange={(failover) => onUpdate({ ...resource, failover })}
          />
          <Note>
            Replication, read/write endpoints, and failover coordination require backend
            orchestration.
          </Note>
        </Section>
      )}
      {resource.kind === "redis" && (
        <Section
          title="Shards & replicas"
          description="Replicas are planned for every primary shard."
        >
          <NumberField
            label="Primary shards"
            value={resource.shards}
            min={3}
            max={12}
            onChange={(shards) => onUpdate({ ...resource, shards })}
          />
          <SelectField
            label="Replicas per shard"
            value={String(resource.replicasPerShard)}
            options={[
              { value: "1", label: "1 replica" },
              { value: "2", label: "2 replicas" },
            ]}
            onChange={(replicas) => onUpdate({ ...resource, replicasPerShard: Number(replicas) })}
          />
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-sm font-medium text-foreground/80">
              {instanceCount(resource)} Redis nodes
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {resource.shards} primaries + {resource.shards * resource.replicasPerShard} replicas
            </p>
          </div>
          <Note>
            At least 3 primary shards. A cluster-aware Redis client is required. The plan splits all
            16,384 hash slots.
          </Note>
          <Button
            variant="ghost"
            className="w-full justify-between px-0"
            aria-expanded={showSlots}
            onClick={() => setShowSlots(!showSlots)}
          >
            Slot allocation
            <ChevronDown className={showSlots ? "rotate-180" : ""} />
          </Button>
          {showSlots && (
            <div className="divide-y divide-border/50">
              {redisSlotRanges(resource.shards).map((range) => (
                <div key={range.shard} className="flex justify-between py-2 text-xs">
                  <span className="text-muted-foreground">Shard {range.shard}</span>
                  <code className="text-foreground/70">
                    {range.start}–{range.end}
                  </code>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </>
  );
}

function Connections({
  resource,
  draft,
  onConnect,
  onSelect,
  onRemoveEdges,
}: { resource: ScaleResource } & Pick<
  InspectorProps,
  "draft" | "onConnect" | "onSelect" | "onRemoveEdges"
>) {
  const [targetId, setTargetId] = useState("");
  const connections = draft.edges.filter(
    (edge) => edge.source === resource.id || edge.target === resource.id,
  );
  const seen = new Set<string>();
  const targets = draft.nodes.filter((target) => {
    if (connectionError(draft, resource.id, target.id)) return false;
    const key = target.kind === "service" ? target.serviceId : target.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const validTarget = targets.some((target) => target.id === targetId);
  return (
    <>
      <Section
        title="Connections"
        description="Application routes are shared by every instance. Adding or removing a route updates them all."
      >
        {connections.length ? (
          <div className="divide-y divide-border/50">
            {connections.map((edge) => {
              const incoming = edge.target === resource.id;
              const other = draft.nodes.find(
                (node) => node.id === (incoming ? edge.source : edge.target),
              );
              if (!other) return null;
              return (
                <div className="flex items-center gap-2 py-3" key={edge.id}>
                  {incoming ? (
                    <ArrowDownLeft className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-start"
                    onClick={() => onSelect({ type: "node", id: other.id })}
                  >
                    <p className="truncate text-sm text-foreground/80">{other.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {incoming ? "Incoming" : "Outgoing"}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remove shared route"
                    aria-label={`Disconnect ${other.name}`}
                    onClick={() => onRemoveEdges([edge.id])}
                  >
                    <Unplug />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">No connections yet.</p>
        )}
      </Section>
      {resource.kind !== "postgres" && resource.kind !== "redis" && (
        <Section title="Add a route">
          <SelectField
            label="Destination"
            value={validTarget ? targetId : ""}
            options={targets.map((target) => ({
              value: target.id,
              label:
                target.kind === "service"
                  ? `${draft.services.find((service) => service.id === target.serviceId)?.name} · All instances`
                  : target.name,
            }))}
            onChange={setTargetId}
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={!validTarget}
            onClick={() => {
              onConnect(resource.id, targetId);
              setTargetId("");
            }}
          >
            <Plus />
            Connect
            {targets.find((target) => target.id === targetId)?.kind === "service"
              ? " application"
              : " resource"}
          </Button>
          {!targets.length && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Add a compatible destination to the canvas first.
            </p>
          )}
        </Section>
      )}
    </>
  );
}

function ResourceInspector({ resource, ...props }: InspectorProps & { resource: ScaleResource }) {
  const [tab, setTab] = useState<"configuration" | "connections">("configuration");
  const connections = props.draft.edges.filter(
    (edge) => edge.source === resource.id || edge.target === resource.id,
  ).length;
  const siblings =
    resource.kind === "service" ? serviceInstances(props.draft, resource.serviceId) : [];
  return (
    <>
      <Tabs
        tabs={[
          { key: "configuration", label: "Configuration" },
          { key: "connections", label: "Connections", count: connections },
        ]}
        value={tab}
        onChange={setTab}
        className="px-1"
      />
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">
        {tab === "configuration" ? (
          <Configuration resource={resource} {...props} />
        ) : (
          <Connections resource={resource} {...props} />
        )}
        <div className="space-y-2 border-t border-border/50 pt-5">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-danger"
            onClick={() => props.onRemoveNodes([resource.id])}
          >
            <Trash2 />
            {resource.kind === "service" ? "Remove this instance" : "Remove resource"}
          </Button>
          {siblings.length > 1 && (
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:text-danger"
              onClick={() => props.onRemoveNodes(siblings.map((node) => node.id))}
            >
              <Trash2 />
              Remove application
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export default memo(function ScaleInspector(props: InspectorProps) {
  const resource =
    props.selection?.type === "node"
      ? props.draft.nodes.find((node) => node.id === props.selection?.id)
      : undefined;
  if (!resource) return null;
  return (
    <aside
      className="scale-resource-tone flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-kind={resource.kind}
      aria-label="Resource configuration"
    >
      <div className="flex shrink-0 items-center gap-3 p-5">
        <div className="scale-resource-icon flex size-10 shrink-0 items-center justify-center rounded-xl">
          <ResourceIcon kind={resource.kind} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium text-foreground">{resource.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {resource.kind === "service"
              ? "Application instance"
              : RESOURCE_META[resource.kind].title}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={props.onClose} aria-label="Close inspector">
          <X />
        </Button>
      </div>
      <ResourceInspector key={resource.id} resource={resource} {...props} />
    </aside>
  );
});
