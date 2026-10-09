import { describe, expect, it } from "vitest";
import { toDeviceRequests } from "../src/runtime/docker";

describe("toDeviceRequests", () => {
  it("is undefined when no GPU is asked for (no key reaches Docker)", () => {
    expect(toDeviceRequests(undefined)).toBeUndefined();
    expect(toDeviceRequests(null)).toBeUndefined();
  });

  it("builds exactly what `docker run --gpus all` sends", () => {
    expect(toDeviceRequests({ driver: "nvidia", count: "all", capabilities: ["gpu"] })).toEqual([
      { Driver: "nvidia", Count: -1, Capabilities: [["gpu"]] },
    ]);
  });

  it("treats a missing count and a missing driver as all GPUs on nvidia", () => {
    expect(toDeviceRequests({})).toEqual([
      { Driver: "nvidia", Count: -1, Capabilities: [["gpu"]] },
    ]);
  });

  it("keeps a numeric count", () => {
    expect(toDeviceRequests({ count: 2 })).toEqual([
      { Driver: "nvidia", Count: 2, Capabilities: [["gpu"]] },
    ]);
  });

  it("sends DeviceIDs WITHOUT Count (the daemon rejects both together)", () => {
    const [req] = toDeviceRequests({ deviceIds: ["0", "GPU-abc"], count: 3 }) as Record<
      string,
      unknown
    >[];
    expect(req.DeviceIDs).toEqual(["0", "GPU-abc"]);
    expect("Count" in req).toBe(false);
  });

  it("always includes the gpu capability and keeps the extra ones in ONE and-list", () => {
    expect(toDeviceRequests({ capabilities: ["compute", "utility"] })).toEqual([
      { Driver: "nvidia", Count: -1, Capabilities: [["compute", "utility", "gpu"]] },
    ]);
  });

  it("does not honor another vendor's driver (it would fail the create with an unrelated error)", () => {
    expect(toDeviceRequests({ driver: "amd", capabilities: ["gpu"] })).toBeUndefined();
  });
});
