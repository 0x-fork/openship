import type { ResourceConfig } from "@repo/adapters";
import type { CloudWorkspaceUsage } from "@repo/contracts";

/** Only CPU and memory are reserved. Disk capacity is not free disk space. */
export type CloudBuildReservation = Readonly<Pick<ResourceConfig, "cpuCores" | "memoryMb">>;
export type CloudBuildResourceUsage = Readonly<
  Pick<CloudWorkspaceUsage, "available" | "memoryAvailableMb" | "cpuPercent">
>;

export interface CloudBuildResourceInput {
  capacity: CloudBuildReservation;
  /** Caller must supply a fresh sample; null represents an unavailable sample. */
  usage: CloudBuildResourceUsage | null;
  /** All outstanding reservations on this host, excluding this candidate. */
  reservations: readonly CloudBuildReservation[];
  /** Missing or zero dimensions mean automatic, as in persisted resource settings. */
  requested?: Readonly<Partial<CloudBuildReservation>> | null;
  /** Validate the plan ceiling; admission slots remain owned by the caller.
   * It must not divide or cap the resources of an automatic build. */
  concurrencyLimit?: number | null;
}

export type CloudBuildResourceDecision =
  | { kind: "admit"; resources: ResourceConfig }
  | {
      kind: "wait";
      reason:
        | "capacity-unavailable"
        | "usage-unavailable"
        | "reservations-unavailable"
        | "concurrency-unavailable"
        | "memory-pressure"
        | "cpu-pressure";
    }
  | {
      kind: "impossible";
      reason: "invalid-request" | "memory-exceeds-capacity" | "cpu-exceeds-capacity";
    };

const MIN_MEMORY_MB = 128;
const MIN_CPU_CORES = 0.25;
const finiteNonnegative = (value: number) => Number.isFinite(value) && value >= 0;

/**
 * Pure preflight, not a reservation write. Call and persist the admitted allocation
 * under the same host admission lock. Plan slots and lifecycle exclusion belong
 * to that caller. Never turn a wait into a running worker or shrink an explicit cap.
 *
 * Subtract the FULL memory ledger from sampled free memory (bounded by capacity).
 * Samples may already include running builders: this deliberately double-counts
 * their memory until per-builder attribution exists, but also protects reservations
 * whose builders have not started yet. Memory headroom is 5%, clamped to 128–512 MB.
 * Automatic CPU subtracts full reservations from sampled idle capacity, just
 * like memory. Running builders can therefore be counted twice until attributed.
 * Explicit CPU stays unchanged. Extreme pressure (>=95%) gates both modes.
 * A sample cannot guarantee protection against future growth of unrelated apps.
 */
export function decideCloudBuildResources(
  input: CloudBuildResourceInput,
): CloudBuildResourceDecision {
  const { capacity, usage, reservations, requested, concurrencyLimit } = input;
  const cpu = requested?.cpuCores ?? 0;
  const memory = requested?.memoryMb ?? 0;
  if (
    !finiteNonnegative(cpu) ||
    !finiteNonnegative(memory) ||
    (cpu > 0 && cpu < MIN_CPU_CORES) ||
    (memory > 0 && memory < MIN_MEMORY_MB)
  ) {
    return { kind: "impossible", reason: "invalid-request" };
  }
  if (
    !Number.isFinite(capacity.cpuCores) ||
    capacity.cpuCores <= 0 ||
    !Number.isFinite(capacity.memoryMb) ||
    capacity.memoryMb <= 0
  ) {
    return { kind: "wait", reason: "capacity-unavailable" };
  }

  const headroomMb = Math.min(512, Math.max(128, capacity.memoryMb * 0.05));
  const memoryBudget = Math.floor(capacity.memoryMb - headroomMb);
  // Structural impossibility is independent of live usage and other reservations.
  if (memoryBudget < MIN_MEMORY_MB || memory > memoryBudget)
    return { kind: "impossible", reason: "memory-exceeds-capacity" };
  if (capacity.cpuCores < MIN_CPU_CORES || cpu > capacity.cpuCores)
    return { kind: "impossible", reason: "cpu-exceeds-capacity" };

  if (
    concurrencyLimit != null &&
    (!Number.isSafeInteger(concurrencyLimit) || concurrencyLimit <= 0)
  )
    return { kind: "wait", reason: "concurrency-unavailable" };
  if (
    !usage?.available ||
    usage.memoryAvailableMb === null ||
    usage.cpuPercent === null ||
    !finiteNonnegative(usage.memoryAvailableMb) ||
    !finiteNonnegative(usage.cpuPercent) ||
    usage.cpuPercent > 100
  ) {
    return { kind: "wait", reason: "usage-unavailable" };
  }
  let reservedMemory = 0;
  let reservedCpu = 0;
  for (const reservation of reservations) {
    // Zero is not a bounded reservation. A corrupt ledger must fail closed.
    if (
      !Number.isFinite(reservation.memoryMb) ||
      reservation.memoryMb <= 0 ||
      !Number.isFinite(reservation.cpuCores) ||
      reservation.cpuCores <= 0
    )
      return { kind: "wait", reason: "reservations-unavailable" };
    reservedMemory += reservation.memoryMb;
    reservedCpu += reservation.cpuCores;
  }
  if (!Number.isFinite(reservedMemory) || !Number.isFinite(reservedCpu))
    return { kind: "wait", reason: "reservations-unavailable" };

  const freeMemory =
    Math.floor(Math.min(capacity.memoryMb, usage.memoryAvailableMb) - headroomMb) - reservedMemory;
  if (freeMemory < MIN_MEMORY_MB || memory > freeMemory)
    return { kind: "wait", reason: "memory-pressure" };
  const freeCpu = capacity.cpuCores - reservedCpu;
  const automaticCpu = capacity.cpuCores * (1 - usage.cpuPercent / 100) - reservedCpu;
  // Fractional shares (e.g. 8 CPUs / 20 slots) accumulate floating-point noise.
  const cpuRoundingTolerance = Number.EPSILON * capacity.cpuCores * (reservations.length + 2);
  if (
    usage.cpuPercent >= 95 ||
    freeCpu + cpuRoundingTolerance < MIN_CPU_CORES ||
    (!cpu && automaticCpu <= cpuRoundingTolerance) ||
    cpu - freeCpu > cpuRoundingTolerance
  )
    return { kind: "wait", reason: "cpu-pressure" };
  const resources: ResourceConfig = {
    // Retain the minimum useful CPU ceiling on small/busy hosts. CPU quotas
    // share scheduling time; never exceed the unreserved physical capacity.
    cpuCores: cpu || Math.min(freeCpu, Math.max(MIN_CPU_CORES, automaticCpu)),
    memoryMb: memory || freeMemory,
    // No additional disk cap: this helper neither reserves nor measures disk.
    diskMb: 0,
  };
  return { kind: "admit", resources };
}
