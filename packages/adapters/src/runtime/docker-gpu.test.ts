import { describe, expect, it } from "vitest";

import { DockerRuntime } from "./docker";
import type { MultiServiceDeployConfig, MultiServiceGroupHandle } from "./types";

/**
 * What a compose GPU request becomes at container create.
 *
 * Pinned at the create payload, like docker-entrypoint.test.ts: `toDeviceRequests` can return the
 * right value and the container still never sees a card if `deployServiceWorkload` forgets to put it
 * on `HostConfig`. That is the whole bug — Docker only hands out a GPU when the create call carries
 * `DeviceRequests`, and `NVIDIA_VISIBLE_DEVICES` alone does nothing under the default runtime.
 */

const GROUP: MultiServiceGroupHandle = { id: "net-openship-demo" } as MultiServiceGroupHandle;

function baseConfig(overrides: Partial<MultiServiceDeployConfig> = {}): MultiServiceDeployConfig {
  return {
    deploymentId: "dep-1",
    projectId: "proj-1",
    slug: "demo",
    serviceName: "worker",
    image: "nvidia/cuda:12.4.1-base-ubuntu22.04",
    ports: [],
    environment: {},
    volumes: [],
    namespaceVolumes: true,
    ...overrides,
  } as MultiServiceDeployConfig;
}

async function createWith(config: MultiServiceDeployConfig) {
  const creates: Array<Record<string, any>> = [];
  const docker = {
    getContainer: () => ({ stop: async () => undefined, remove: async () => undefined }),
    createContainer: async (args: Record<string, any>) => {
      creates.push(args);
      return {
        id: "c".repeat(64),
        start: async () => undefined,
        remove: async () => undefined,
        inspect: async () => ({ NetworkSettings: { Networks: {} }, Config: {} }),
      };
    },
    getImage: () => ({ inspect: async () => ({ RepoDigests: [] }) }),
  };
  const runtime = await DockerRuntime.create({
    dockerSocketPath: "/tmp/openship-test-absent.sock",
  });
  (runtime as unknown as { _docker: unknown })._docker = docker;
  await runtime.deployServiceWorkload(GROUP, config);
  return creates[0]!;
}

describe("deployServiceWorkload — GPU", () => {
  it("puts DeviceRequests on HostConfig when the service asks for a GPU", async () => {
    const args = await createWith(
      baseConfig({ advanced: { gpus: { driver: "nvidia", count: "all", capabilities: ["gpu"] } } }),
    );
    expect(args.HostConfig.DeviceRequests).toEqual([
      { Driver: "nvidia", Count: -1, Capabilities: [["gpu"]] },
    ]);
  });

  it("sends no DeviceRequests key at all for a service without a GPU", async () => {
    const args = await createWith(baseConfig());
    expect("DeviceRequests" in args.HostConfig).toBe(false);
  });

  it("does not send a GPU request for a driver it cannot honor", async () => {
    const args = await createWith(baseConfig({ advanced: { gpus: { driver: "amd" } } }));
    expect("DeviceRequests" in args.HostConfig).toBe(false);
  });
});
