import { describe, expect, it } from "vitest";
import { clusterWorkloadUnsupportedReason } from "./cluster-workload";

describe("workload replication eligibility", () => {
  it("allows independent applications and workers", () => {
    expect(clusterWorkloadUnsupportedReason({ workload: "web", framework: "express" })).toBeNull();
    expect(clusterWorkloadUnsupportedReason({ workload: "worker" })).toBeNull();
  });
  it.each([
    { workload: "static" },
    { workload: "web", services: [{}] },
    { workload: "web", volumes: ["data:/data"] },
    { workload: "web", framework: "postgres" },
    { workload: "web", image: "redis:7" },
  ])("keeps unsupported stateful or service workloads explicit: %j", (input) => {
    expect(clusterWorkloadUnsupportedReason(input)).toBeTruthy();
  });
});
