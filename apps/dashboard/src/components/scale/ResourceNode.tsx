"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Layers3, MapPin, ShieldCheck } from "lucide-react";
import { ResourceIcon } from "./ResourceIcon";
import {
  ALGORITHMS,
  APPLICATION_TYPES,
  CLUSTER_ENGINES,
  REGIONS,
  RESOURCE_META,
  isClusterKind,
  instanceCount,
  type ScaleResource,
  type ScaleService,
} from "./topology";

export type ScaleFlowNode = Node<{ resource: ScaleResource; service?: ScaleService }, "resource">;

export const ResourceNode = memo(function ResourceNode({
  data,
  selected,
  isConnectable,
}: NodeProps<ScaleFlowNode>) {
  const { resource, service } = data;
  const cluster = isClusterKind(resource.kind);
  return (
    <div
      className="scale-resource-tone scale-resource-node w-[260px] rounded-2xl border p-4 text-start shadow-sm"
      data-kind={resource.kind}
      data-selected={selected}
    >
      <Handle type="target" position={Position.Left} id="in" isConnectable={isConnectable} />
      <div className="flex items-start gap-3">
        <div className="scale-resource-icon flex size-9 shrink-0 items-center justify-center rounded-xl">
          <ResourceIcon kind={resource.kind} className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground" title={resource.name}>
            {resource.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {resource.kind === "service" && service
              ? `${APPLICATION_TYPES[service.applicationType]} · Instance ${resource.ordinal}`
              : isClusterKind(resource.kind)
                ? CLUSTER_ENGINES[resource.kind]
                : RESOURCE_META[resource.kind].title}
          </p>
        </div>
        {cluster && (
          <span className="scale-cluster-badge inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs">
            <Layers3 className="size-3" />
            Cluster
          </span>
        )}
      </div>
      {resource.kind === "edge" && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">OpenResty + Lua</p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Load balancing</span>
            <span className="text-foreground/80">{ALGORITHMS[resource.algorithm]}</span>
          </div>
        </div>
      )}
      {resource.kind === "service" && service && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {service.cpu} vCPU · {service.memory / 1024} GB
          </span>
          <span className="font-mono">:{service.port}</span>
        </div>
      )}
      {resource.kind === "postgres" && (
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Primary</span>
            <span className="text-foreground/80">1 read / write</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Read replicas</span>
            <span className="tabular-nums text-foreground/80">{resource.replicas}</span>
          </div>
        </div>
      )}
      {resource.kind === "redis" && (
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Primary shards</span>
            <span className="text-foreground/80">{resource.shards}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Replicas per shard</span>
            <span className="text-foreground/80">{resource.replicasPerShard}</span>
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center gap-1.5 border-t border-border/50 pt-3 text-xs text-muted-foreground/70">
        <MapPin className="size-3" />
        <span>{REGIONS.find((region) => region.id === resource.region)?.short}</span>
        {resource.kind === "edge" && (
          <span className="ms-auto inline-flex items-center gap-1">
            <ShieldCheck className="size-3" />
            {resource.tls ? "HTTPS" : "External TLS"}
          </span>
        )}
        {resource.kind === "service" && <span className="ms-auto">Stateless</span>}
        {cluster && <span className="ms-auto tabular-nums">{instanceCount(resource)} nodes</span>}
      </div>
      {resource.kind !== "postgres" && resource.kind !== "redis" && (
        <Handle type="source" position={Position.Right} id="out" isConnectable={isConnectable} />
      )}
    </div>
  );
});
