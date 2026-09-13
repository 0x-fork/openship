# Scaling workspace MVP

`/scale` is a client-side design workspace. The example is illustrative; editing does not provision
servers, configure OpenShip Edge, run an autoscaler, or change databases.

## Topology

- **OpenShip Edge** is a single resource type representing the OpenResty + Lua gateway, ingress,
  TLS termination, API routing, health checks, and load balancing. There is no standalone
  load-balancer module. Gateways connect directly to application instances or to other gateways.
- **Applications** are runtime-agnostic APIs, websites, or HTTP services. Shared configuration lives
  in `draft.services`; every stateless instance is its own `draft.nodes` entry, with its own position,
  region, and connection handles. There is no aggregate application node containing replica rows.
- Scaling an application creates/removes actual instance nodes. New instances inherit the shared
  gateway routes and data-store dependencies. Connecting to one instance fans the route out to every
  instance of the same application; removing a route removes it for all those instances. The inspector
  explains this behavior. Removing an individual instance only removes that instance and its edges.
- **Cluster** groups supported database engines in the node palette. Each cluster is configured from
  its own node, with its engine and member count visible on the canvas.
- **PostgreSQL clusters** have one writable primary and zero to eight read replicas. Failover planning requires
  a replica. This is read scaling, not multi-primary or write sharding.
- **Redis clusters** have three to twelve primary shards and one or two replicas per shard. The optional slot
  preview partitions all 16,384 hash slots; a cluster-aware client is required.

Self-connections, routing cycles, duplicates, incompatible node pairs, dangling references, and
incomplete shared application routes are rejected. Autoscaling bounds, graph size, and connection
budgets are validated before scaling. Local validation is not a production-readiness or health check.

## UI and rendering

The canvas is an absolute, full-size layer filling the dashboard workspace. Floating command groups
provide workspace identity, undo/redo, auto-layout, and a primary Add node action; they do not consume
canvas space. There are no summary tiles, save controls, or fixed-height canvas cards. The right-hand
340px node panel is an overlay at **every** breakpoint, never a flex/grid column. Opening, switching,
or closing it does not change the canvas dimensions or its pan/zoom transform.

The initial topology fits once. Subsequent fitting is requested by topology actions (add, scale,
layout, or reset) or the Fit button, not selection, focus, configuration edits, or container resizing.
Users keep control of the viewport while working with node settings.

Surfaces and controls still follow OpenShip: `bg-card` / `rounded-2xl`, `Button`, `Input`, `CustomSelect`,
`Tabs`, and `Switch`. Nodes, palette icons, and panel icons share subtle type colors from the existing
theme tokens: amber gateways, green applications, blue PostgreSQL clusters, and red Redis clusters.
Export and reset live in the canvas options menu, not in permanent page chrome.

The editor is lazy-loaded without SSR and the inspector is a separate on-demand chunk. Custom nodes
and edges are memoized; type registries are stable and viewport culling is enabled. Drag-frame state
stays in the canvas; only completed moves, including keyboard moves, enter draft history. The minimap
and Redis slot details mount only when requested. Routes show protocol labels when selected to avoid
cluttering the graph. Drafts are bounded to 60 canvas nodes, 180 connections, and 24 instances per app.

## Persistence

Completed changes are automatically stored locally after a short debounce, scoped to user and
organization. Pending changes flush on navigation or page exit; dragging does not write storage on
every frame. The serialized model remains **version 2**, with the same storage key as the prototype.
Version 1 combined service nodes and separate load balancers are incompatible: the editor shows a
notice without overwriting old storage until the user explicitly chooses to replace it. Invalid
drafts and storage failures show a recoverable notice. JSON export is not a deployment manifest.

Undo/redo retains 40 edits. Replica creation and all inherited routes are one undoable operation.
Selection, zoom, and minimap visibility are transient. Node positions are saved. UI copy is currently
English; the sidebar entry is localized.

## Backend boundary

A future validation/application API must map applications and instances to real projects and servers,
enforce permissions and placement, and reconcile desired configuration with observed state. Edge
customization belongs in the OpenShip Edge OpenResty/Lua integration, not a separate load-balancer
service. Database replication/failover and Redis rebalancing require backend orchestration and an
explicit review/apply operation; local layout persistence must never apply infrastructure changes.

```sh
bun run --cwd apps/dashboard test src/components/scale src/lib/sidebar-nav.test.ts
bun run --cwd apps/dashboard lint
```
