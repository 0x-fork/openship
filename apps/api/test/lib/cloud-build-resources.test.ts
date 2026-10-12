import { describe, expect, expectTypeOf, it } from "vitest";
import type { ResourceConfig } from "@repo/adapters";
import type { CloudWorkspaceUsage } from "@repo/contracts";
import {
  decideCloudBuildResources,
  type CloudBuildReservation,
  type CloudBuildResourceInput,
  type CloudBuildResourceUsage,
} from "@repo/platform/engine/lib/cloud-build-resources";

const capacity = { cpuCores: 4, memoryMb: 8192 };
const usage = { available: true, memoryAvailableMb: 8192, cpuPercent: 0 };
const decide = (patch: Partial<CloudBuildResourceInput> = {}) =>
  decideCloudBuildResources({
    capacity,
    usage,
    reservations: [],
    ...patch,
  });

describe("Cloud build resource admission", () => {
  it("accepts existing resource and host sample types without requiring unrelated fields", () => {
    expectTypeOf<ResourceConfig>().toExtend<CloudBuildReservation>();
    expectTypeOf<CloudWorkspaceUsage>().toExtend<CloudBuildResourceUsage>();
    expect(decide()).toEqual({
      kind: "admit",
      resources: { cpuCores: 1, memoryMb: 4096, diskMb: 0 },
    });
  });

  it.each([undefined, null, {}, { cpuCores: 0, memoryMb: 0 }])(
    "treats missing/zero requests as bounded automatic allocations: %j",
    (requested) => {
      expect(decide({ requested })).toEqual(decide());
    },
  );

  it("does not grow automatic builds to fill a large idle host", () => {
    expect(
      decide({
        capacity: { cpuCores: 64, memoryMb: 131072 },
        usage: { ...usage, memoryAvailableMb: 131072 },
      }),
    ).toEqual({ kind: "admit", resources: { cpuCores: 1, memoryMb: 4096, diskMb: 0 } });
  });

  it("bounds automatic targets to a small host without rounding away CPU capacity", () => {
    expect(
      decide({
        capacity: { cpuCores: 0.6, memoryMb: 512 },
        usage: { ...usage, memoryAvailableMb: 512 },
      }),
    ).toEqual({ kind: "admit", resources: { cpuCores: 0.6, memoryMb: 249, diskMb: 0 } });
  });

  it.each([
    [256, 128], // Minimum 128 MB headroom.
    [2048, 1920],
    [8192, 7782], // 5% headroom, allocation rounded down.
    [32768, 32256], // Headroom capped at 512 MB.
  ])("keeps headroom on a %i MB host", (memoryMb, budget) => {
    const patch = {
      capacity: { ...capacity, memoryMb },
      usage: { ...usage, memoryAvailableMb: memoryMb },
    };
    expect(decide({ ...patch, requested: { memoryMb: budget } })).toEqual({
      kind: "admit",
      resources: { cpuCores: 1, memoryMb: budget, diskMb: 0 },
    });
    expect(decide({ ...patch, requested: { memoryMb: budget + 1 } })).toEqual({
      kind: "impossible",
      reason: "memory-exceeds-capacity",
    });
  });

  it.each([
    [
      { cpuCores: 2.3, memoryMb: 3000 },
      { cpuCores: 2.3, memoryMb: 3000, diskMb: 0 },
    ],
    [{ cpuCores: 0.3 }, { cpuCores: 0.3, memoryMb: 4096, diskMb: 0 }],
    [{ memoryMb: 256 }, { cpuCores: 1, memoryMb: 256, diskMb: 0 }],
    [
      { cpuCores: 0, memoryMb: 2048 },
      { cpuCores: 1, memoryMb: 2048, diskMb: 0 },
    ],
  ])("preserves explicit dimensions exactly: %j", (requested, resources) => {
    expect(decide({ requested })).toEqual({ kind: "admit", resources });
  });

  it.each([NaN, Infinity, -Infinity, -1])(
    "rejects invalid request values %s without throwing",
    (value) => {
      for (const requested of [{ cpuCores: value }, { memoryMb: value }]) {
        expect(decide({ requested })).toEqual({ kind: "impossible", reason: "invalid-request" });
      }
    },
  );

  it.each([{ cpuCores: 0.1 }, { memoryMb: 127 }])(
    "rejects explicit allocations below the build minimum: %j",
    (requested) => {
      expect(decide({ requested })).toEqual({ kind: "impossible", reason: "invalid-request" });
    },
  );

  it.each([
    [{ cpuCores: 5 }, "cpu-exceeds-capacity"],
    [{ memoryMb: 8192 }, "memory-exceeds-capacity"],
  ])("recognizes structural impossibility even with unknown usage: %j", (requested, reason) => {
    expect(decide({ usage: null, requested })).toEqual({ kind: "impossible", reason });
  });

  it.each([
    [{ cpuCores: 0.2, memoryMb: 8192 }, "cpu-exceeds-capacity"],
    [{ cpuCores: 4, memoryMb: 255 }, "memory-exceeds-capacity"],
  ])("rejects hosts that cannot fit even the automatic minimum: %j", (capacity, reason) => {
    expect(decide({ capacity })).toEqual({ kind: "impossible", reason });
  });

  it.each([0, -1, NaN, Infinity])(
    "waits for usable capacity when a host dimension is %s",
    (value) => {
      for (const host of [
        { ...capacity, cpuCores: value },
        { ...capacity, memoryMb: value },
      ]) {
        expect(decide({ capacity: host })).toEqual({
          kind: "wait",
          reason: "capacity-unavailable",
        });
      }
    },
  );

  it.each([
    null,
    { ...usage, available: false },
    { ...usage, memoryAvailableMb: null },
    { ...usage, cpuPercent: null },
    { ...usage, memoryAvailableMb: NaN },
    { ...usage, memoryAvailableMb: Infinity },
    { ...usage, memoryAvailableMb: -1 },
    { ...usage, cpuPercent: NaN },
    { ...usage, cpuPercent: Infinity },
    { ...usage, cpuPercent: -1 },
    { ...usage, cpuPercent: 101 },
  ])("waits on an unknown or malformed sample: %j", (sample) => {
    expect(decide({ usage: sample })).toEqual({ kind: "wait", reason: "usage-unavailable" });
  });

  it("does not infer extra physical capacity from a generous sample", () => {
    expect(
      decide({ usage: { ...usage, memoryAvailableMb: 999999 }, requested: { memoryMb: 7783 } }),
    ).toEqual({ kind: "impossible", reason: "memory-exceeds-capacity" });
  });

  it("waits for memory instead of shrinking an automatic or explicit allocation", () => {
    const pressured = { ...usage, memoryAvailableMb: 1024 };
    for (const requested of [undefined, { memoryMb: 1024 }]) {
      expect(decide({ usage: pressured, requested })).toEqual({
        kind: "wait",
        reason: "memory-pressure",
      });
      expect(decide({ requested }).kind).toBe("admit");
    }
  });

  it("admits exact available memory after headroom but waits one MB below it", () => {
    const patch = { capacity: { ...capacity, memoryMb: 2048 } };
    expect(decide({ ...patch, usage: { ...usage, memoryAvailableMb: 1376 } }).kind).toBe("admit");
    expect(decide({ ...patch, usage: { ...usage, memoryAvailableMb: 1375 } })).toEqual({
      kind: "wait",
      reason: "memory-pressure",
    });
  });

  it("reserves CPU independently of memory without double-counting CPU usage", () => {
    const reservations = [{ cpuCores: 2, memoryMb: 128 }];
    expect(decide({ reservations, usage: { ...usage, cpuPercent: 25 } }).kind).toBe("admit");
    expect(decide({ reservations, usage: { ...usage, cpuPercent: 94 } }).kind).toBe("admit");
    expect(decide({ requested: { cpuCores: 3 }, reservations })).toEqual({
      kind: "wait",
      reason: "cpu-pressure",
    });
    expect(decide({ usage: { ...usage, cpuPercent: 100 } })).toEqual({
      kind: "wait",
      reason: "cpu-pressure",
    });
  });

  it("subtracts full reservations even if the live sample already reflects their usage", () => {
    expect(
      decide({
        usage: { ...usage, memoryAvailableMb: 4096 },
        reservations: [{ cpuCores: 1, memoryMb: 3000 }],
      }),
    ).toEqual({ kind: "wait", reason: "memory-pressure" });
  });

  it.each([0.1, 5, 50, 94.999])(
    "admits a Hobby build on 1 CPU with %s%% background usage",
    (cpuPercent) => {
      const patch = {
        capacity: { cpuCores: 1, memoryMb: 2048 },
        usage: { ...usage, memoryAvailableMb: 1600, cpuPercent },
        concurrencyLimit: 1,
      };
      expect(decide(patch)).toEqual({
        kind: "admit",
        resources: { cpuCores: 1, memoryMb: 1248, diskMb: 0 },
      });
      expect(decide({ ...patch, requested: { cpuCores: 1, memoryMb: 1024 } })).toEqual({
        kind: "admit",
        resources: { cpuCores: 1, memoryMb: 1024, diskMb: 0 },
      });
    },
  );

  it.each([95, 99, 100])(
    "waits at %s%% CPU pressure for automatic and explicit builds",
    (cpuPercent) => {
      for (const requested of [undefined, { cpuCores: 0.25, memoryMb: 512 }]) {
        expect(decide({ usage: { ...usage, cpuPercent }, requested })).toEqual({
          kind: "wait",
          reason: "cpu-pressure",
        });
      }
    },
  );

  it.each([
    [1, 1, 2048, 1, 1248, 1],
    [4, 2, 8192, 1, 4096, 1],
    [8, 4, 16384, 1, 4096, 3],
    [20, 8, 32768, 1, 4096, 7],
  ])(
    "treats cap %i as a ceiling while memory determines actual concurrency",
    (concurrencyLimit, cpuCores, memoryMb, targetCpu, targetMemory, admittedCount) => {
      const reservations: CloudBuildReservation[] = [];
      const patch = {
        capacity: { cpuCores, memoryMb },
        usage: { ...usage, memoryAvailableMb: memoryMb, cpuPercent: 20 },
        concurrencyLimit,
        reservations,
      };
      for (let i = 0; i < admittedCount; i++) {
        const result = decide(patch);
        expect(result).toEqual({
          kind: "admit",
          resources: { cpuCores: targetCpu, memoryMb: targetMemory, diskMb: 0 },
        });
        if (result.kind !== "admit") throw new Error("Expected admission");
        reservations.push(result.resources);
      }
      expect(decide(patch).kind).toBe("wait");
      reservations.pop();
      expect(decide(patch).kind).toBe("admit");
    },
  );

  it.each([
    [64, 131072, 4, 1, 4096], // Automatic ceilings.
    [1, 2048, 20, 1, 1248], // Increasing concurrency never shrinks the build target.
    [0.3, 256, 20, 0.3, 128], // Preserve fractional CPU capacity and minimum memory.
  ])(
    "bounds automatic shares for %s CPUs / %s MB at cap %s",
    (cpuCores, memoryMb, concurrencyLimit, targetCpu, targetMemory) => {
      expect(
        decide({
          capacity: { cpuCores, memoryMb },
          usage: { ...usage, memoryAvailableMb: memoryMb },
          concurrencyLimit,
        }),
      ).toEqual({
        kind: "admit",
        resources: { cpuCores: targetCpu, memoryMb: targetMemory, diskMb: 0 },
      });
    },
  );

  it("does not shrink explicit dimensions to a plan share or impose the automatic ceiling on them", () => {
    expect(decide({ concurrencyLimit: 20, requested: { cpuCores: 3, memoryMb: 6144 } })).toEqual({
      kind: "admit",
      resources: { cpuCores: 3, memoryMb: 6144, diskMb: 0 },
    });
    expect(decide({ concurrencyLimit: 4, requested: { cpuCores: 2 } })).toEqual({
      kind: "admit",
      resources: { cpuCores: 2, memoryMb: 4096, diskMb: 0 },
    });
    expect(decide({ concurrencyLimit: 8, requested: { memoryMb: 2048 } })).toEqual({
      kind: "admit",
      resources: { cpuCores: 1, memoryMb: 2048, diskMb: 0 },
    });
  });

  it("waits rather than shrinking the automatic target under memory pressure", () => {
    expect(decide({ concurrencyLimit: 4, usage: { ...usage, memoryAvailableMb: 2048 } })).toEqual({
      kind: "wait",
      reason: "memory-pressure",
    });
  });

  it("uses the same memory policy when no finite plan ceiling is supplied", () => {
    expect(decide({ concurrencyLimit: null })).toEqual(decide());
  });

  it("keeps the same Hobby target through pressure and recovery with real background usage", () => {
    const patch = {
      capacity: { cpuCores: 1, memoryMb: 2048 },
      concurrencyLimit: 1,
      usage: { ...usage, memoryAvailableMb: 1600, cpuPercent: 5 },
    };
    const expected = { kind: "admit", resources: { cpuCores: 1, memoryMb: 1248, diskMb: 0 } };
    expect(decide(patch)).toEqual(expected);
    expect(decide({ ...patch, usage: { ...patch.usage, memoryAvailableMb: 500 } })).toEqual({
      kind: "wait",
      reason: "memory-pressure",
    });
    expect(decide({ ...patch, usage: { ...patch.usage, memoryAvailableMb: 1800 } })).toEqual(
      expected,
    );
  });

  it.each([undefined, null, 1, 4, 8, 20])(
    "never divides automatic memory by concurrency %s",
    (concurrencyLimit) => {
      expect(decide({ concurrencyLimit })).toMatchObject({
        kind: "admit",
        resources: { cpuCores: 1, memoryMb: 4096 },
      });
      expect(
        decide({
          concurrencyLimit,
          capacity: { cpuCores: 1, memoryMb: 2048 },
          usage: { ...usage, memoryAvailableMb: 1600, cpuPercent: 5 },
        }),
      ).toMatchObject({ kind: "admit", resources: { memoryMb: 1248 } });
    },
  );

  it("allows twenty fractional CPU shares when explicit memory allocations fit", () => {
    const reservations: CloudBuildReservation[] = [];
    const patch = {
      capacity: { cpuCores: 8, memoryMb: 32768 },
      usage: { ...usage, memoryAvailableMb: 32768, cpuPercent: 20 },
      concurrencyLimit: 20,
      requested: { cpuCores: 0.4, memoryMb: 512 },
      reservations,
    };
    for (let i = 0; i < 20; i++) {
      const result = decide(patch);
      expect(result).toEqual({
        kind: "admit",
        resources: { cpuCores: 0.4, memoryMb: 512, diskMb: 0 },
      });
      if (result.kind !== "admit") throw new Error("Expected admission");
      reservations.push(result.resources);
    }
    expect(decide(patch)).toEqual({ kind: "wait", reason: "cpu-pressure" });
  });

  it("shows that a resource-blocked head can coexist with a fitting later request", () => {
    const patch = { usage: { ...usage, memoryAvailableMb: 2048 }, concurrencyLimit: 4 };
    expect(decide({ ...patch, requested: { memoryMb: 4096 } })).toEqual({
      kind: "wait",
      reason: "memory-pressure",
    });
    expect(decide({ ...patch, requested: { memoryMb: 512 } }).kind).toBe("admit");
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "waits for a valid plan ceiling instead of inventing one: %s",
    (concurrencyLimit) => {
      expect(decide({ concurrencyLimit })).toEqual({
        kind: "wait",
        reason: "concurrency-unavailable",
      });
    },
  );

  it("waits, rather than declaring impossibility, when reservations exceed a resized host", () => {
    expect(decide({ reservations: [{ cpuCores: 8, memoryMb: 16384 }] })).toEqual({
      kind: "wait",
      reason: "memory-pressure",
    });
    expect(decide({ reservations: [{ cpuCores: 8, memoryMb: 128 }] })).toEqual({
      kind: "wait",
      reason: "cpu-pressure",
    });
  });

  it.each([0, -1, NaN, Infinity])(
    "fails closed on an invalid reservation dimension %s",
    (value) => {
      for (const reservation of [
        { cpuCores: value, memoryMb: 128 },
        { cpuCores: 1, memoryMb: value },
      ]) {
        expect(decide({ reservations: [reservation] })).toEqual({
          kind: "wait",
          reason: "reservations-unavailable",
        });
      }
    },
  );

  it("fails closed on overflowing reservation totals", () => {
    expect(
      decide({
        reservations: [
          { cpuCores: 1, memoryMb: Number.MAX_VALUE },
          { cpuCores: 1, memoryMb: Number.MAX_VALUE },
        ],
      }),
    ).toEqual({ kind: "wait", reason: "reservations-unavailable" });
  });

  it("prevents over-admission before builders appear in a sample and admits again after release", () => {
    const reservations: CloudBuildReservation[] = [];
    for (let i = 0; i < 4; i++) {
      const result = decide({ reservations, requested: { memoryMb: 1024 } });
      expect(result.kind).toBe("admit");
      if (result.kind !== "admit") throw new Error("Expected admission");
      reservations.push(result.resources);
    }
    expect(decide({ reservations, requested: { memoryMb: 1024 } })).toEqual({
      kind: "wait",
      reason: "cpu-pressure",
    });
    reservations.pop();
    expect(decide({ reservations, requested: { memoryMb: 1024 } }).kind).toBe("admit");
  });

  it("lets memory reservations limit concurrency even with abundant idle CPU", () => {
    const patch = {
      capacity: { cpuCores: 32, memoryMb: 4096 },
      usage: { ...usage, memoryAvailableMb: 4096 },
    };
    const reservations = Array.from({ length: 3 }, () => ({ cpuCores: 1, memoryMb: 1024 }));
    expect(decide({ ...patch, reservations })).toEqual({ kind: "wait", reason: "memory-pressure" });
    expect(decide({ ...patch, reservations: reservations.slice(2) }).kind).toBe("admit");
  });

  it("is deterministic, accepts frozen inputs, and never mutates the caller's request or ledger", () => {
    const input = Object.freeze({
      capacity: Object.freeze({ ...capacity }),
      usage: Object.freeze({ ...usage }),
      requested: Object.freeze({ cpuCores: 2, memoryMb: 2048 }),
      reservations: Object.freeze([Object.freeze({ cpuCores: 1, memoryMb: 1024 })]),
    });
    const before = structuredClone(input);
    expect(decideCloudBuildResources(input)).toEqual(decideCloudBuildResources(input));
    expect(input).toEqual(before);
  });
});
