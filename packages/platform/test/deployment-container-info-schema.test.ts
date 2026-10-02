import { describe, expect, it } from "vitest";
import { CloudRuntime, DockerRuntime } from "@repo/adapters";
import { DeploymentControlSchemas } from "@repo/contracts";
import { presentOperationOutput } from "../src/resource-operations";

/**
 * `DeploymentContainerInfoSchema` (packages/contracts/src/deployment-controls.ts)
 * declares `additionalProperties: false`. The Docker and Cloud runtime adapters
 * (packages/adapters/src/runtime/docker.ts, packages/adapters/src/runtime/cloud.ts)
 * each populate a `resources` field on `getContainerInfo()` results — a real
 * field on the `ContainerInfo` type (packages/adapters/src/types.ts) — but the
 * schema never declared it. Docker omits the field for a missing container;
 * Cloud includes it only when the workspace response reports it.
 *
 * `presentOperationOutput()` (packages/platform/src/resource-operations.ts) is
 * what the real `GET /:id/info` route (apps/api/src/modules/deployments/
 * deployment.routes.ts) and its MCP tool (the route's `mcp` block makes it an
 * MCP tool, see apps/api/src/modules/mcp/mcp-tools.ts) call before returning a
 * `containerInfo` result to a caller. This test calls it directly.
 *
 * Before the fix, passing either tested adapter result to
 * `presentOperationOutput()` throws `500 INVALID_OPERATION_RESPONSE` because
 * `resources` is undeclared.
 */
describe("DeploymentContainerInfoSchema agrees with what runtime adapters return", () => {
  it("accepts the Docker runtime's getContainerInfo() output, including resources", async () => {
    const runtime = await DockerRuntime.create({
      dockerSocketPath: "/tmp/openship-test-absent.sock",
    });
    (runtime as unknown as { _docker: unknown })._docker = {
      getContainer: () => ({
        inspect: async () => ({
          HostConfig: { NanoCpus: 500_000_000, Memory: 512 * 1024 * 1024 },
          State: { Status: "exited", Running: false },
          NetworkSettings: { Networks: {} },
        }),
      }),
    };
    const info = await runtime.getContainerInfo("stopped-container");
    expect(info).toMatchObject({ status: "stopped", resources: { cpuCores: 0.5, memoryMb: 512 } });
    expect(() =>
      presentOperationOutput(
        DeploymentControlSchemas.containerInfo,
        info,
        "deployments.containerInfo",
      ),
    ).not.toThrow();
  });

  it("accepts the Cloud runtime's getContainerInfo() output, including resources", async () => {
    const client = {
      workspace: () => ({
        start: async () => {},
        get: async () => ({
          id: "native",
          status: "active",
          info: { status: "stopped" },
          resources: { cpus: 4, memory_mb: 8192 },
        }),
        apiAccess: { rawToken: async () => ({}) },
      }),
    };
    const runtime = new CloudRuntime(client as never, { namespace: "org" });
    const info = await runtime.getContainerInfo("native");
    expect(info).toMatchObject({ status: "stopped", resources: { cpuCores: 4, memoryMb: 8192 } });
    expect(() =>
      presentOperationOutput(
        DeploymentControlSchemas.containerInfo,
        info,
        "deployments.containerInfo",
      ),
    ).not.toThrow();
  });

  it("still accepts a runtime that reports no resources at all (Kubernetes, Bare)", () => {
    const minimal = { containerId: "c1", status: "running" };
    expect(() =>
      presentOperationOutput(
        DeploymentControlSchemas.containerInfo,
        minimal,
        "deployments.containerInfo",
      ),
    ).not.toThrow();
  });
});
