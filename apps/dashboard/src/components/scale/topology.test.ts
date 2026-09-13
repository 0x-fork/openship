import { describe, expect, it } from "vitest";
import {
  ALGORITHMS,
  CLUSTER_KINDS,
  MAX_CONNECTIONS,
  MAX_RESOURCES,
  RESOURCE_KINDS,
  addService,
  configureService,
  connectResources,
  connectionError,
  connectionLabel,
  createExampleDraft,
  createResource,
  createService,
  draftReducer,
  draftStorageKey,
  instanceCount,
  isClusterKind,
  layoutDraft,
  parseDraft,
  redisSlotRanges,
  removeConnections,
  removeResources,
  reviewDraft,
  serviceInstances,
  summarizeDraft,
  type DraftHistory,
  type ScaleDraft,
} from "./topology";

const empty = (): ScaleDraft => ({ version: 2, services: [], nodes: [], edges: [] });
const history = (): DraftHistory => ({ present: createExampleDraft(), past: [], future: [] });

describe("OpenShip Edge topology", () => {
  it("classifies PostgreSQL and Redis as cluster engines", () => {
    expect(RESOURCE_KINDS.filter(isClusterKind)).toEqual(CLUSTER_KINDS);
    expect(isClusterKind("edge")).toBe(false);
    expect(isClusterKind("service")).toBe(false);
  });
  it("has one gateway type, not separate edge and load-balancer modules", () => {
    expect(RESOURCE_KINDS).toEqual(["edge", "service", "postgres", "redis"]);
    const gateway = createResource("edge", "gateway");
    expect(gateway).toMatchObject({
      kind: "edge",
      tls: true,
      algorithm: "round-robin",
      healthPath: "/health",
      healthInterval: 10,
    });
    expect(Object.keys(ALGORITHMS)).toHaveLength(3);
  });

  it("renders the example as two gateways and three individually connected application instances", () => {
    const draft = createExampleDraft();
    expect(draft.nodes).toHaveLength(7);
    expect(draft.services).toHaveLength(1);
    expect(serviceInstances(draft, "api").map((node) => node.name)).toEqual([
      "api-1",
      "api-2",
      "api-3",
    ]);
    expect(draft.edges).toHaveLength(12);
    for (const node of serviceInstances(draft, "api")) {
      expect(
        draft.edges
          .filter((edge) => edge.target === node.id)
          .map((edge) => edge.source)
          .sort(),
      ).toEqual(["edge-eu", "edge-us"]);
      expect(
        draft.edges
          .filter((edge) => edge.source === node.id)
          .map((edge) => edge.target)
          .sort(),
      ).toEqual(["postgres", "redis"]);
      expect(instanceCount(node)).toBe(1);
      expect(node).not.toHaveProperty("replicas");
      expect(node).not.toHaveProperty("port");
    }
    expect(summarizeDraft(draft)).toEqual({
      gateways: 2,
      applications: 1,
      instances: 3,
      databases: 2,
      total: 14,
    });
    expect(reviewDraft(draft)).toEqual([]);
    expect(parseDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it.each(["api", "website", "service"] as const)(
    "supports generic %s applications without a hardcoded runtime",
    (applicationType) => {
      const draft = addService(empty(), { ...createService("app", "app"), applicationType });
      expect(draft.nodes).toHaveLength(3);
      expect(draft.services[0].applicationType).toBe(applicationType);
      expect(JSON.stringify(draft)).not.toContain("Node.js");
      expect(parseDraft(JSON.stringify(draft))).toEqual(draft);
    },
  );

  it("keeps each example independent and places nodes in three distinct columns", () => {
    const draft = createExampleDraft();
    const positions = new Set(draft.nodes.map((node) => `${node.position.x},${node.position.y}`));
    expect(positions.size).toBe(7);
    expect(new Set(draft.nodes.map((node) => node.position.x)).size).toBe(3);
    draft.nodes[0].position.x = 900;
    expect(createExampleDraft().nodes[0].position.x).toBe(0);
    expect(layoutDraft(empty())).toEqual(empty());
  });

  it("changes the edge protocol label with TLS and uses shared application ports", () => {
    const draft = createExampleDraft();
    const resource = draft.nodes[0];
    if (resource.kind !== "edge") throw new Error("Expected a gateway");
    expect(connectionLabel(draft, { ...resource, tls: false })).toBe("HTTP · Edge route");
    const changed = configureService(draft, { ...draft.services[0], port: 8080 });
    expect(connectionLabel(changed, serviceInstances(changed, "api")[0])).toBe("HTTP · 8080");
  });
});

describe("horizontal service scaling", () => {
  it("adds real nodes and inherits every gateway and data-store route", () => {
    const original = createExampleDraft();
    const next = configureService(original, original.services[0], 5);
    expect(serviceInstances(next, "api")).toHaveLength(5);
    expect(next.edges).toHaveLength(20);
    expect(next.nodes).toHaveLength(9);
    expect(original.nodes).toHaveLength(7);
    expect(original.edges).toHaveLength(12);
    expect(parseDraft(JSON.stringify(next))).toEqual(next);
    const restored = configureService(next, next.services[0], 2);
    expect(restored.nodes).toHaveLength(6);
    expect(restored.edges).toHaveLength(8);
    expect(serviceInstances(restored, "api").map((node) => node.id)).toEqual([
      "api-instance-1",
      "api-instance-2",
    ]);
    expect(parseDraft(JSON.stringify(restored))).toEqual(restored);
  });

  it("updates every instance from shared application configuration", () => {
    const draft = createExampleDraft();
    const positions = serviceInstances(draft, "api").map((node) => node.position);
    const next = configureService(draft, {
      ...draft.services[0],
      name: "website",
      applicationType: "website",
      cpu: 2,
      port: 8080,
    });
    expect(serviceInstances(next, "api").map((node) => node.name)).toEqual([
      "website-1",
      "website-2",
      "website-3",
    ]);
    expect(serviceInstances(next, "api").map((node) => node.position)).toEqual(positions);
    expect(next.services[0]).toMatchObject({ applicationType: "website", cpu: 2, port: 8080 });
    expect(parseDraft(JSON.stringify(next))).toEqual(next);
  });

  it("keeps ordinals unique after deleting a middle instance and scaling up", () => {
    const draft = removeResources(createExampleDraft(), ["api-instance-2"]);
    const next = configureService(draft, draft.services[0], 4);
    expect(serviceInstances(next, "api").map((node) => node.ordinal)).toEqual([1, 3, 4, 5]);
    expect(parseDraft(JSON.stringify(next))).toEqual(next);
  });

  it("removes incident routes, adjusts autoscaling bounds, and removes empty applications", () => {
    const initial = createExampleDraft();
    const draft = configureService(initial, {
      ...initial.services[0],
      autoscale: true,
      minReplicas: 3,
    });
    const next = removeResources(draft, ["api-instance-1"]);
    expect(next.services[0].minReplicas).toBe(2);
    expect(next.edges).toHaveLength(8);
    expect(parseDraft(JSON.stringify(next))).toEqual(next);
    const removed = removeResources(
      next,
      serviceInstances(next, "api").map((node) => node.id),
    );
    expect(removed.services).toEqual([]);
    expect(removed.edges).toEqual([]);
  });

  it.each([0, -1, 25, 1.5, NaN])("rejects invalid replica count %s", (count) => {
    const draft = createExampleDraft();
    expect(() => configureService(draft, draft.services[0], count)).toThrow();
    expect(() => addService(empty(), createService("new"), count)).toThrow();
  });

  it("rejects autoscaling outside configured bounds", () => {
    const draft = createExampleDraft();
    expect(() =>
      configureService(
        draft,
        { ...draft.services[0], autoscale: true, minReplicas: 2, maxReplicas: 4 },
        5,
      ),
    ).toThrow("bounds");
  });

  it("checks both node and connection budgets before scaling", () => {
    const draft = createExampleDraft();
    const full = {
      ...draft,
      nodes: [
        ...draft.nodes,
        ...Array.from({ length: MAX_RESOURCES - draft.nodes.length }, (_entry, index) =>
          createResource("edge", `extra-${index}`),
        ),
      ],
    };
    expect(() => configureService(full, draft.services[0], 4)).toThrow("limit");
    expect(() => addService(full, createService("extra-service"))).toThrow("limit");
    const connected = {
      ...draft,
      edges: [
        ...draft.edges,
        ...Array.from({ length: MAX_CONNECTIONS - draft.edges.length }, (_entry, index) => ({
          id: `extra-${index}`,
          source: "edge-us",
          target: "edge-eu",
        })),
      ],
    };
    expect(() => configureService(connected, draft.services[0], 4)).toThrow("connection limit");
  });
});

describe("shared application routing", () => {
  it("fans gateway and database connections out to all replicas", () => {
    const draft = createExampleDraft();
    const first = draft.edges.find((edge) => edge.source === "edge-us")!;
    const disconnected = removeConnections(draft, [first.id]);
    expect(disconnected.edges.filter((edge) => edge.source === "edge-us")).toHaveLength(0);
    const connected = connectResources(disconnected, "edge-us", "api-instance-2");
    expect(connected.edges.filter((edge) => edge.source === "edge-us")).toHaveLength(3);
    const databaseRoute = connected.edges.find((edge) => edge.target === "postgres")!;
    expect(
      removeConnections(connected, [databaseRoute.id]).edges.filter(
        (edge) => edge.target === "postgres",
      ),
    ).toHaveLength(0);
    expect(parseDraft(JSON.stringify(disconnected))).toEqual(disconnected);
  });

  it("isolates the routes and scaling of different applications", () => {
    let draft = addService(
      createExampleDraft(),
      { ...createService("web", "web"), applicationType: "website" },
      2,
    );
    draft = connectResources(draft, "edge-us", "web-instance-1");
    const route = draft.edges.find(
      (edge) => edge.source === "edge-us" && edge.target === "api-instance-1",
    )!;
    const next = removeConnections(draft, [route.id]);
    expect(
      next.edges.filter((edge) => edge.source === "edge-us").map((edge) => edge.target),
    ).toEqual(["web-instance-1", "web-instance-2"]);
    expect(
      configureService(next, next.services[0], 5).nodes.filter(
        (node) => node.kind === "service" && node.serviceId === "web",
      ),
    ).toHaveLength(2);
  });

  it("allows edge-to-edge routing but rejects duplicates, loops, and unsupported directions", () => {
    const draft = createExampleDraft();
    expect(connectionError(draft, "edge-us", "edge-eu")).toBeNull();
    const routed = connectResources(draft, "edge-us", "edge-eu");
    expect(connectionError(routed, "edge-eu", "edge-us")).toContain("loop");
    expect(connectionError(draft, "edge-us", "api-instance-1")).toContain("already connected");
    expect(connectionError(draft, "api-instance-1", "edge-us")).not.toBeNull();
    expect(connectionError(draft, "postgres", "redis")).not.toBeNull();
    expect(connectionError(draft, "edge-us", "postgres")).not.toBeNull();
    expect(connectionError(draft, "missing", "edge-us")).toContain("must exist");
    expect(connectionError(draft, "edge-us", "edge-us")).toContain("itself");
  });

  it("detects missing gateway routes for every affected instance and data store", () => {
    const draft = removeResources(createExampleDraft(), ["edge-us", "edge-eu"]);
    expect(reviewDraft(draft).filter((issue) => issue.message.includes("no route"))).toHaveLength(
      5,
    );
    expect(reviewDraft(empty())[0].severity).toBe("warning");
    expect(
      reviewDraft(removeResources(createExampleDraft(), ["edge-eu"])).some((issue) =>
        issue.message.includes("single point of failure"),
      ),
    ).toBe(true);
  });
});

describe("database planning", () => {
  it.each([3, 4, 5, 7, 12])(
    "allocates every Redis slot exactly once across %i shards",
    (shards) => {
      const ranges = redisSlotRanges(shards);
      expect(ranges[0].start).toBe(0);
      expect(ranges.at(-1)?.end).toBe(16383);
      expect(ranges.reduce((total, range) => total + range.end - range.start + 1, 0)).toBe(16384);
      for (let index = 1; index < ranges.length; index += 1)
        expect(ranges[index].start).toBe(ranges[index - 1].end + 1);
    },
  );
  it("counts PostgreSQL primaries and Redis replicas separately from applications", () => {
    expect(instanceCount(createResource("postgres", "postgres"))).toBe(3);
    expect(instanceCount(createResource("redis", "redis"))).toBe(6);
  });
});

describe("draft persistence and history", () => {
  it.each(["{", "null", "[]", "{}", '{"version":1,"nodes":[],"edges":[]}'])(
    "rejects malformed or previous-model drafts: %s",
    (serialized) => expect(parseDraft(serialized)).toBeNull(),
  );
  it.each([
    { port: 65536 },
    { cpu: "1" },
    { memory: "1024" },
    { minReplicas: 9, maxReplicas: 2 },
    { applicationType: "nodejs" },
    { applicationType: "toString" },
    { name: " " },
    { autoscale: true, minReplicas: 4 },
  ])("rejects invalid shared application settings %j", (patch) => {
    const draft = createExampleDraft();
    expect(
      parseDraft(JSON.stringify({ ...draft, services: [{ ...draft.services[0], ...patch }] })),
    ).toBeNull();
  });
  it.each([
    ["edge", { algorithm: ["round-robin"] }],
    ["edge", { algorithm: "constructor" }],
    ["edge", { healthPath: "health" }],
    ["postgres", { replicas: 0, failover: true }],
    ["redis", { shards: 2 }],
    ["redis", { replicasPerShard: 0 }],
  ] as const)("rejects invalid %s settings", (kind, patch) =>
    expect(
      parseDraft(
        JSON.stringify({ ...empty(), nodes: [{ ...createResource(kind, "resource"), ...patch }] }),
      ),
    ).toBeNull(),
  );
  it("rejects dangling service references, duplicate ordinals, and partial application routes", () => {
    const draft = createExampleDraft();
    expect(parseDraft(JSON.stringify({ ...draft, services: [] }))).toBeNull();
    expect(
      parseDraft(
        JSON.stringify({ ...draft, services: [...draft.services, createService("unused")] }),
      ),
    ).toBeNull();
    expect(
      parseDraft(
        JSON.stringify({
          ...draft,
          nodes: [...draft.nodes, { ...serviceInstances(draft, "api")[0], id: "duplicate" }],
        }),
      ),
    ).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft, edges: draft.edges.slice(1) }))).toBeNull();
    expect(
      parseDraft(JSON.stringify({ ...draft, edges: [...draft.edges, draft.edges[0]] })),
    ).toBeNull();
    expect(parseDraft(" ".repeat(250001))).toBeNull();
  });
  it("scopes saved drafts by user and organization without separator collisions", () => {
    expect(draftStorageKey("first", "org")).not.toBe(draftStorageKey("second", "org"));
    expect(draftStorageKey("first", "one")).not.toBe(draftStorageKey("first", "two"));
    expect(draftStorageKey("first:second", "third")).not.toBe(
      draftStorageKey("first", "second:third"),
    );
  });
  it("undoes and redoes an entire scale operation including all nodes and routes", () => {
    const initial = history();
    const changed = draftReducer(initial, {
      type: "change",
      draft: (draft) => configureService(draft, draft.services[0], 5),
    });
    expect(changed.present.nodes).toHaveLength(9);
    expect(changed.present.edges).toHaveLength(20);
    const undone = draftReducer(changed, { type: "undo" });
    expect(undone.present).toBe(initial.present);
    expect(draftReducer(undone, { type: "redo" }).present).toBe(changed.present);
    expect(draftReducer(initial, { type: "change", draft: createExampleDraft() })).toBe(initial);
  });
  it("bounds history and clears it on restore", () => {
    let state = history();
    for (let index = 1; index < 50; index += 1)
      state = draftReducer(state, {
        type: "change",
        draft: (draft) => ({
          ...draft,
          nodes: draft.nodes.map((node, ordinal) =>
            ordinal ? node : { ...node, name: `edge-${index}` },
          ),
        }),
      });
    expect(state.past).toHaveLength(40);
    expect(draftReducer(state, { type: "restore", draft: createExampleDraft() }).past).toEqual([]);
  });
});
