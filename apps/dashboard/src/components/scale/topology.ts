export const RESOURCE_KINDS = ["edge", "service", "postgres", "redis"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const CLUSTER_KINDS = ["postgres", "redis"] as const;
export type ClusterKind = (typeof CLUSTER_KINDS)[number];
export const CLUSTER_ENGINES: Record<ClusterKind, string> = {
  postgres: "PostgreSQL",
  redis: "Redis",
};
export function isClusterKind(kind: ResourceKind): kind is ClusterKind {
  return kind === "postgres" || kind === "redis";
}
export const APPLICATION_TYPES = {
  api: "API",
  website: "Website",
  service: "HTTP service",
} as const;
export const ALGORITHMS = {
  "round-robin": "Round robin",
  "least-connections": "Least connections",
  "ip-hash": "IP hash",
} as const;

export const REGIONS = [
  { id: "us-east-1", name: "Virginia, US", short: "US East" },
  { id: "us-west-2", name: "Oregon, US", short: "US West" },
  { id: "eu-west-1", name: "Dublin, Ireland", short: "EU West" },
  { id: "ap-southeast-1", name: "Singapore", short: "Asia Pacific" },
] as const;

export const RESOURCE_META: Record<ResourceKind, { title: string; description: string }> = {
  edge: { title: "OpenShip Edge", description: "OpenResty + Lua gateway and load balancing" },
  service: {
    title: "Application",
    description: "Horizontal instances of an API, website, or service",
  },
  postgres: { title: "PostgreSQL cluster", description: "One primary with read replicas" },
  redis: { title: "Redis cluster", description: "Primary shards with automatic replica planning" },
};

type ResourceBase = {
  id: string;
  name: string;
  region: string;
  position: { x: number; y: number };
};
export type ScaleResource = ResourceBase &
  (
    | {
        kind: "edge";
        tls: boolean;
        algorithm: keyof typeof ALGORITHMS;
        healthPath: string;
        healthInterval: number;
      }
    | { kind: "service"; serviceId: string; ordinal: number }
    | { kind: "postgres"; replicas: number; failover: boolean }
    | { kind: "redis"; shards: number; replicasPerShard: number }
  );
export type ScaleService = {
  id: string;
  name: string;
  applicationType: keyof typeof APPLICATION_TYPES;
  port: number;
  cpu: number;
  memory: number;
  autoscale: boolean;
  minReplicas: number;
  maxReplicas: number;
  targetCpu: number;
};
export type ScaleConnection = { id: string; source: string; target: string };
export type ScaleDraft = {
  version: 2;
  services: ScaleService[];
  nodes: ScaleResource[];
  edges: ScaleConnection[];
};
export type ScaleSelection = { type: "node" | "edge"; id: string } | null;
export type PlanIssue = { nodeId?: string; message: string; severity: "warning" | "info" };
export const MAX_RESOURCES = 60;
export const MAX_CONNECTIONS = 180;
export const MAX_INSTANCES = 24;

export function createResource(
  kind: Exclude<ResourceKind, "service">,
  id: string,
  ordinal = 1,
): ScaleResource {
  const base = {
    id,
    name: `${kind}-${ordinal}`,
    region: "us-east-1",
    position: { x: kind === "edge" ? 0 : 680, y: (ordinal - 1) * 240 },
  };
  switch (kind) {
    case "edge":
      return {
        ...base,
        kind,
        tls: true,
        algorithm: "round-robin",
        healthPath: "/health",
        healthInterval: 10,
      };
    case "postgres":
      return { ...base, kind, replicas: 2, failover: true };
    case "redis":
      return { ...base, kind, shards: 3, replicasPerShard: 1 };
  }
}

export function createService(id: string, name = "application"): ScaleService {
  return {
    id,
    name,
    applicationType: "api",
    port: 3000,
    cpu: 1,
    memory: 1024,
    autoscale: false,
    minReplicas: 1,
    maxReplicas: 8,
    targetCpu: 70,
  };
}

export function serviceInstances(draft: ScaleDraft, serviceId: string) {
  return draft.nodes
    .filter(
      (node): node is Extract<ScaleResource, { kind: "service" }> =>
        node.kind === "service" && node.serviceId === serviceId,
    )
    .sort((first, second) => first.ordinal - second.ordinal);
}

function createInstance(
  service: ScaleService,
  ordinal: number,
  position: ResourceBase["position"],
  region = "us-east-1",
): ScaleResource {
  return {
    id: `${service.id}-instance-${ordinal}`,
    kind: "service",
    name: `${service.name}-${ordinal}`,
    serviceId: service.id,
    ordinal,
    region,
    position,
  };
}

export function addService(draft: ScaleDraft, service: ScaleService, count = 3): ScaleDraft {
  if (!isService(service)) throw new Error("Check the application configuration.");
  if (draft.services.some((entry) => entry.id === service.id))
    throw new Error("This application already exists.");
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_INSTANCES ||
    draft.nodes.length + count > MAX_RESOURCES
  )
    throw new Error("This draft has reached its instance limit.");
  if (service.autoscale && (count < service.minReplicas || count > service.maxReplicas))
    throw new Error("The instance count must stay within the autoscaling bounds.");
  const bottom = Math.max(
    -180,
    ...draft.nodes.filter((node) => node.kind === "service").map((node) => node.position.y),
  );
  const nodes = Array.from({ length: count }, (_entry, index) =>
    createInstance(service, index + 1, { x: 340, y: bottom + 180 * (index + 1) }),
  );
  if (nodes.some((instance) => draft.nodes.some((node) => node.id === instance.id)))
    throw new Error("An instance identifier is already in use.");
  return { ...draft, services: [...draft.services, service], nodes: [...draft.nodes, ...nodes] };
}

export function instanceCount(resource: ScaleResource): number {
  if (resource.kind === "postgres") return 1 + resource.replicas;
  if (resource.kind === "redis") return resource.shards * (1 + resource.replicasPerShard);
  return 1;
}

export function summarizeDraft(draft: ScaleDraft) {
  return {
    gateways: draft.nodes.filter((node) => node.kind === "edge").length,
    applications: draft.services.length,
    instances: draft.nodes.filter((node) => node.kind === "service").length,
    databases: draft.nodes.filter((node) => node.kind === "postgres" || node.kind === "redis")
      .length,
    total: draft.nodes.reduce((total, node) => total + instanceCount(node), 0),
  };
}

export function redisSlotRanges(shards: number) {
  return Array.from({ length: shards }, (_entry, index) => ({
    shard: index + 1,
    start: Math.floor((index * 16384) / shards),
    end: Math.floor(((index + 1) * 16384) / shards) - 1,
  }));
}

function pairError(draft: ScaleDraft, sourceId: string, targetId: string): string | null {
  const source = draft.nodes.find((node) => node.id === sourceId);
  const target = draft.nodes.find((node) => node.id === targetId);
  if (!source || !target) return "Both resources must exist in the topology.";
  if (sourceId === targetId) return "A resource cannot connect to itself.";
  const allowed =
    source.kind === "edge"
      ? target.kind === "edge" || target.kind === "service"
      : source.kind === "service" && (target.kind === "postgres" || target.kind === "redis");
  if (!allowed)
    return "Connect OpenShip Edge to gateways or application instances, and applications to data stores.";
  if (draft.edges.some((edge) => edge.source === sourceId && edge.target === targetId))
    return "These resources are already connected.";
  const pending = [targetId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === sourceId) return "This connection would create a routing loop.";
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of draft.edges) if (edge.source === current) pending.push(edge.target);
  }
  return null;
}

function routePairs(draft: ScaleDraft, sourceId: string, targetId: string) {
  const source = draft.nodes.find((node) => node.id === sourceId);
  const target = draft.nodes.find((node) => node.id === targetId);
  const sources =
    source?.kind === "service"
      ? serviceInstances(draft, source.serviceId).map((node) => node.id)
      : [sourceId];
  const targets =
    target?.kind === "service"
      ? serviceInstances(draft, target.serviceId).map((node) => node.id)
      : [targetId];
  return sources.flatMap((source) => targets.map((target) => ({ source, target })));
}

function makeConnection(source: string, target: string): ScaleConnection {
  return {
    id: `route:${encodeURIComponent(source)}:${encodeURIComponent(target)}`,
    source,
    target,
  };
}

export function connectionError(draft: ScaleDraft, source: string, target: string): string | null {
  const error = pairError(draft, source, target);
  if (error) return error;
  const pairs = routePairs(draft, source, target);
  if (draft.edges.length + pairs.length > MAX_CONNECTIONS)
    return "This route would exceed the draft connection limit.";
  for (const pair of pairs) {
    const error = pairError(draft, pair.source, pair.target);
    if (error) return error;
  }
  return null;
}

export function connectResources(draft: ScaleDraft, source: string, target: string): ScaleDraft {
  const error = connectionError(draft, source, target);
  if (error) throw new Error(error);
  return {
    ...draft,
    edges: [
      ...draft.edges,
      ...routePairs(draft, source, target).map((pair) => makeConnection(pair.source, pair.target)),
    ],
  };
}

export function removeConnections(draft: ScaleDraft, ids: string[]): ScaleDraft {
  const removed = new Set(ids);
  const pairs = draft.edges
    .filter((edge) => removed.has(edge.id))
    .flatMap((edge) => routePairs(draft, edge.source, edge.target));
  return {
    ...draft,
    edges: draft.edges.filter(
      (edge) => !pairs.some((pair) => pair.source === edge.source && pair.target === edge.target),
    ),
  };
}

export function connectionLabel(draft: ScaleDraft, target: ScaleResource): string {
  if (target.kind === "edge") return target.tls ? "HTTPS · Edge route" : "HTTP · Edge route";
  if (target.kind === "postgres") return "PostgreSQL · 5432";
  if (target.kind === "redis") return "Redis · 6379";
  return `HTTP · ${draft.services.find((service) => service.id === target.serviceId)?.port ?? ""}`;
}

export function configureService(
  draft: ScaleDraft,
  service: ScaleService,
  count = serviceInstances(draft, service.id).length,
): ScaleDraft {
  if (!isService(service)) throw new Error("Check the application configuration.");
  const previous = serviceInstances(draft, service.id);
  if (!previous.length) throw new Error("This application no longer exists.");
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTANCES)
    throw new Error(`Choose between 1 and ${MAX_INSTANCES} instances.`);
  if (draft.nodes.length - previous.length + count > MAX_RESOURCES)
    throw new Error("This draft has reached its instance limit.");
  if (service.autoscale && (count < service.minReplicas || count > service.maxReplicas))
    throw new Error("The instance count must stay within the autoscaling bounds.");
  const kept = new Set(previous.slice(0, count).map((node) => node.id));
  const nodes = draft.nodes
    .filter((node) => node.kind !== "service" || node.serviceId !== service.id || kept.has(node.id))
    .map((node) =>
      node.kind === "service" && node.serviceId === service.id
        ? { ...node, name: `${service.name}-${node.ordinal}` }
        : node,
    );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = draft.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const template = previous[0];
  const incoming = draft.edges.filter((edge) => edge.target === template.id);
  const outgoing = draft.edges.filter((edge) => edge.source === template.id);
  const last = previous.at(-1)!;
  const addedCount = Math.max(0, count - previous.length);
  if (edges.length + addedCount * (incoming.length + outgoing.length) > MAX_CONNECTIONS)
    throw new Error("Scaling this application would exceed the draft connection limit.");
  for (let index = 0; index < addedCount; index += 1) {
    const instance = createInstance(
      service,
      last.ordinal + index + 1,
      { x: last.position.x, y: last.position.y + (index + 1) * 180 },
      last.region,
    );
    if (nodeIds.has(instance.id)) throw new Error("An instance identifier is already in use.");
    nodes.push(instance);
    edges.push(
      ...incoming.map((edge) => makeConnection(edge.source, instance.id)),
      ...outgoing.map((edge) => makeConnection(instance.id, edge.target)),
    );
  }
  return {
    ...draft,
    services: draft.services.map((entry) => (entry.id === service.id ? service : entry)),
    nodes,
    edges,
  };
}

export function removeResources(draft: ScaleDraft, ids: string[]): ScaleDraft {
  const removed = new Set(ids);
  const nodes = draft.nodes.filter((node) => !removed.has(node.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const services = draft.services.flatMap((service) => {
    const remaining = nodes.filter(
      (node) => node.kind === "service" && node.serviceId === service.id,
    ).length;
    return remaining ? [{ ...service, minReplicas: Math.min(service.minReplicas, remaining) }] : [];
  });
  return {
    ...draft,
    nodes,
    services,
    edges: draft.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
  };
}

export function layoutDraft(draft: ScaleDraft): ScaleDraft {
  const layers = [
    draft.nodes.filter((node) => node.kind === "edge"),
    draft.nodes.filter((node) => node.kind === "service"),
    draft.nodes.filter((node) => node.kind === "postgres" || node.kind === "redis"),
  ];
  const heights = layers.map((layer, index) => layer.length * (index === 1 ? 180 : 250));
  const height = Math.max(...heights);
  const positions = new Map(
    layers.flatMap((layer, layerIndex) =>
      layer.map(
        (node, index) =>
          [
            node.id,
            {
              x: layerIndex * 340,
              y: (height - heights[layerIndex]) / 2 + index * (layerIndex === 1 ? 180 : 250),
            },
          ] as const,
      ),
    ),
  );
  return {
    ...draft,
    nodes: draft.nodes.map((node) => ({ ...node, position: positions.get(node.id)! })),
  };
}

export function createExampleDraft(): ScaleDraft {
  let draft: ScaleDraft = {
    version: 2,
    services: [],
    edges: [],
    nodes: [
      { ...createResource("edge", "edge-us"), name: "edge-us" },
      { ...createResource("edge", "edge-eu", 2), name: "edge-eu", region: "eu-west-1" },
      { ...createResource("postgres", "postgres"), name: "postgres" },
      { ...createResource("redis", "redis"), name: "redis" },
    ],
  };
  draft = addService(draft, createService("api", "api"));
  draft = connectResources(draft, "edge-us", "api-instance-1");
  draft = connectResources(draft, "edge-eu", "api-instance-1");
  draft = connectResources(draft, "api-instance-1", "postgres");
  draft = connectResources(draft, "api-instance-1", "redis");
  return layoutDraft(draft);
}

export function reviewDraft(draft: ScaleDraft): PlanIssue[] {
  if (!draft.nodes.length)
    return [
      {
        message: "Add OpenShip Edge or an application to start the topology.",
        severity: "warning",
      },
    ];
  const issues: PlanIssue[] = [];
  const reachable = new Set(
    draft.nodes.filter((node) => node.kind === "edge").map((node) => node.id),
  );
  for (let pass = 0; pass < draft.nodes.length; pass += 1) {
    let changed = false;
    for (const edge of draft.edges)
      if (reachable.has(edge.source) && !reachable.has(edge.target)) {
        reachable.add(edge.target);
        changed = true;
      }
    if (!changed) break;
  }
  for (const node of draft.nodes) {
    if (node.kind !== "edge" && !reachable.has(node.id))
      issues.push({
        nodeId: node.id,
        message: `${node.name} has no route from OpenShip Edge.`,
        severity: "warning",
      });
    if (node.kind === "edge" && !draft.edges.some((edge) => edge.source === node.id))
      issues.push({
        nodeId: node.id,
        message: `${node.name} has no upstream application or gateway.`,
        severity: "warning",
      });
    if (node.kind === "edge" && !node.tls)
      issues.push({
        nodeId: node.id,
        message: `${node.name} needs external TLS termination.`,
        severity: "warning",
      });
    if (node.kind === "postgres" && !node.replicas)
      issues.push({
        nodeId: node.id,
        message: `${node.name} has no read replica or failover target.`,
        severity: "warning",
      });
  }
  if (draft.nodes.filter((node) => node.kind === "edge").length === 1)
    issues.push({
      message:
        "One OpenShip Edge gateway is a single point of failure. Add a second gateway for redundancy.",
      severity: "info",
    });
  return issues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function integer(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
  );
}
function name(value: unknown, maximum = 120): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= maximum;
}

function isService(value: unknown): value is ScaleService {
  return (
    isRecord(value) &&
    name(value.id) &&
    name(value.name, 60) &&
    typeof value.applicationType === "string" &&
    Object.hasOwn(APPLICATION_TYPES, value.applicationType) &&
    integer(value.port, 1, 65535) &&
    typeof value.cpu === "number" &&
    [0.5, 1, 2, 4].includes(value.cpu) &&
    typeof value.memory === "number" &&
    [512, 1024, 2048, 4096, 8192].includes(value.memory) &&
    typeof value.autoscale === "boolean" &&
    integer(value.minReplicas, 1, MAX_INSTANCES) &&
    integer(value.maxReplicas, value.minReplicas, MAX_INSTANCES) &&
    integer(value.targetCpu, 20, 90)
  );
}

function isResource(value: unknown): value is ScaleResource {
  if (
    !isRecord(value) ||
    !name(value.id, 160) ||
    !name(value.name, 70) ||
    !REGIONS.some((region) => region.id === value.region) ||
    !isRecord(value.position) ||
    ![value.position.x, value.position.y].every(
      (coordinate) =>
        typeof coordinate === "number" &&
        Number.isFinite(coordinate) &&
        Math.abs(coordinate) <= 100000,
    )
  )
    return false;
  switch (value.kind) {
    case "edge":
      return (
        typeof value.tls === "boolean" &&
        typeof value.algorithm === "string" &&
        Object.hasOwn(ALGORITHMS, value.algorithm) &&
        typeof value.healthPath === "string" &&
        value.healthPath.startsWith("/") &&
        value.healthPath.length <= 200 &&
        integer(value.healthInterval, 5, 120)
      );
    case "service":
      return name(value.serviceId) && integer(value.ordinal, 1, 100000);
    case "postgres":
      return (
        integer(value.replicas, 0, 8) &&
        typeof value.failover === "boolean" &&
        (!value.failover || value.replicas > 0)
      );
    case "redis":
      return integer(value.shards, 3, 12) && integer(value.replicasPerShard, 1, 2);
    default:
      return false;
  }
}

export function parseDraft(serialized: string): ScaleDraft | null {
  if (serialized.length > 250000) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (
      !isRecord(value) ||
      value.version !== 2 ||
      !Array.isArray(value.nodes) ||
      !Array.isArray(value.services) ||
      !Array.isArray(value.edges) ||
      value.nodes.length > MAX_RESOURCES ||
      value.services.length > MAX_RESOURCES ||
      value.edges.length > MAX_CONNECTIONS ||
      !value.nodes.every(isResource) ||
      !value.services.every(isService)
    )
      return null;
    const draft: ScaleDraft = {
      version: 2,
      nodes: value.nodes,
      services: value.services,
      edges: [],
    };
    if (
      new Set(draft.nodes.map((node) => node.id)).size !== draft.nodes.length ||
      new Set(draft.services.map((service) => service.id)).size !== draft.services.length
    )
      return null;
    for (const service of draft.services) {
      const instances = serviceInstances(draft, service.id);
      if (
        !instances.length ||
        instances.length > MAX_INSTANCES ||
        new Set(instances.map((node) => node.ordinal)).size !== instances.length ||
        (service.autoscale &&
          (instances.length < service.minReplicas || instances.length > service.maxReplicas))
      )
        return null;
    }
    for (const node of draft.nodes) {
      if (
        node.kind === "service" &&
        !draft.services.some(
          (service) =>
            service.id === node.serviceId && node.name === `${service.name}-${node.ordinal}`,
        )
      )
        return null;
    }
    const ids = new Set<string>();
    for (const edge of value.edges) {
      if (
        !isRecord(edge) ||
        !name(edge.id, 1000) ||
        ids.has(edge.id) ||
        typeof edge.source !== "string" ||
        typeof edge.target !== "string" ||
        pairError(draft, edge.source, edge.target)
      )
        return null;
      ids.add(edge.id);
      draft.edges.push({ id: edge.id, source: edge.source, target: edge.target });
    }
    for (const edge of draft.edges) {
      if (
        routePairs(draft, edge.source, edge.target).some(
          (pair) =>
            !draft.edges.some(
              (candidate) => candidate.source === pair.source && candidate.target === pair.target,
            ),
        )
      )
        return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export type DraftHistory = { present: ScaleDraft; past: ScaleDraft[]; future: ScaleDraft[] };
export type DraftAction =
  | { type: "change"; draft: ScaleDraft | ((current: ScaleDraft) => ScaleDraft) }
  | { type: "restore"; draft: ScaleDraft }
  | { type: "undo" }
  | { type: "redo" };
export function draftReducer(state: DraftHistory, action: DraftAction): DraftHistory {
  if (action.type === "restore") return { present: action.draft, past: [], future: [] };
  if (action.type === "change") {
    const draft = typeof action.draft === "function" ? action.draft(state.present) : action.draft;
    return JSON.stringify(draft) === JSON.stringify(state.present)
      ? state
      : { present: draft, past: [...state.past.slice(-39), state.present], future: [] };
  }
  if (action.type === "undo" && state.past.length)
    return {
      present: state.past.at(-1)!,
      past: state.past.slice(0, -1),
      future: [state.present, ...state.future],
    };
  if (action.type === "redo" && state.future.length)
    return {
      present: state.future[0],
      past: [...state.past, state.present],
      future: state.future.slice(1),
    };
  return state;
}

export function draftStorageKey(userId: string, organizationId?: string | null): string {
  return `openship:scale:v1:${encodeURIComponent(userId)}:${encodeURIComponent(organizationId ?? "personal")}`;
}
