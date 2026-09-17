import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ quota: vi.fn(), get: vi.fn(), update: vi.fn() }));
vi.mock("@repo/platform/engine/lib/oblien-client", () => ({
  getOblienClient: () => ({ workspaces: { getQuota: h.quota }, namespaces: { get: h.get, update: h.update } }),
}));
import {
  cloudAccountCapacity, cloudNamespaceLimits, initialCloudNamespaceLimits,
  syncCloudResourceLimits, __resetCloudResourceCapacityForTests,
} from "@repo/platform/engine/lib/cloud-resource-limits";

const quota = { success: true, limits: { cpus: 32, memory_mb: 65536, disk_size_mb: 256000 }, maxSandboxes: 300 };
beforeEach(() => {
  vi.resetAllMocks();
  __resetCloudResourceCapacityForTests();
  h.quota.mockResolvedValue(quota);
  h.get.mockResolvedValue({ data: { id: "ns-a", slug: "tenant-a", resource_limits: null } });
  h.update.mockImplementation(async (_id, input) => ({ data: { id: "ns-a", slug: "tenant-a", ...input } }));
});

describe("customer namespace resource ceilings", () => {
  it("fits native builds and a shared Compose stack within each paid plan", () => {
    const account = cloudAccountCapacity(quota);
    expect(cloudNamespaceLimits("free", account)).toEqual({ max_workspaces: 2, max_vcpus: 4, max_ram_mb: 8192, max_disk_gb: 32 });
    expect(cloudNamespaceLimits("starter", account)).toEqual({ max_workspaces: 5, max_vcpus: 4, max_ram_mb: 11264, max_disk_gb: 32 });
    expect(cloudNamespaceLimits("pro", account)).toEqual({ max_workspaces: 12, max_vcpus: 20, max_ram_mb: 28672, max_disk_gb: 32 });
    expect(cloudNamespaceLimits("team", account)).toEqual({ max_workspaces: 52, max_vcpus: 32, max_ram_mb: 65536, max_disk_gb: 64 });
  });
  it("never asks for a namespace ceiling larger than the reseller account", () => {
    expect(cloudNamespaceLimits("pro", { cpu: 8, memory: 16384, diskGb: 10, workspaces: 4 }))
      .toEqual({ max_workspaces: 4, max_vcpus: 8, max_ram_mb: 16384, max_disk_gb: 10 });
  });
  it.each([null, {}, { success: false }, { ...quota, limits: { ...quota.limits, cpus: 0 } }])("fails closed when account capacity is unknown", value => {
    expect(() => cloudAccountCapacity(value)).toThrow("capacity could not be verified");
  });
  it("supplies explicit initial limits before a new namespace receives a token", async () => {
    await expect(initialCloudNamespaceLimits()).resolves.toEqual({ max_workspaces: 2, max_vcpus: 4, max_ram_mb: 8192, max_disk_gb: 32 });
  });
  it("updates only the current namespace's resource ceilings", async () => {
    await syncCloudResourceLimits("tenant-a", "starter");
    expect(h.get).toHaveBeenCalledWith("tenant-a");
    expect(h.update).toHaveBeenCalledWith("ns-a", { resource_limits: { max_workspaces: 5, max_vcpus: 4, max_ram_mb: 11264, max_disk_gb: 32 } });
  });
  it("repeated synchronization does not rewrite already matching ceilings", async () => {
    h.get.mockResolvedValue({ data: { id: "ns-a", slug: "tenant-a", resource_limits: cloudNamespaceLimits("pro", cloudAccountCapacity(quota)) } });
    await syncCloudResourceLimits("tenant-a", "pro");
    expect(h.update).not.toHaveBeenCalled();
  });
  it("clears previous plan ceilings when an enterprise entitlement is verified", async () => {
    h.get.mockResolvedValue({ data: { id: "ns-a", slug: "tenant-a", resource_limits: { max_workspaces: 5 } } });
    await syncCloudResourceLimits("tenant-a", "enterprise");
    expect(h.update).toHaveBeenCalledWith("ns-a", { resource_limits: { max_workspaces: null, max_vcpus: null, max_ram_mb: null, max_disk_gb: null } });
  });
  it("cannot change ceilings if the provider returns another namespace", async () => {
    h.get.mockResolvedValue({ data: { id: "ns-b", slug: "tenant-b" } });
    await expect(syncCloudResourceLimits("tenant-a", "pro")).rejects.toMatchObject({ code: "CLOUD_NAMESPACE_MISMATCH" });
    expect(h.update).not.toHaveBeenCalled();
  });
  it("refuses to authorize a deployment when the provider ignores the update", async () => {
    h.update.mockResolvedValue({ data: { id: "ns-a", slug: "tenant-a", resource_limits: null } });
    await expect(syncCloudResourceLimits("tenant-a", "pro")).rejects.toMatchObject({ code: "CLOUD_RESOURCE_LIMITS_UNCONFIRMED" });
  });
});
