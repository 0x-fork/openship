import "../mail/_setup-env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ services: vi.fn() }));
vi.mock("@repo/db", async (original) => ({
  ...(await original<object>()),
  repos: { service: { listByProject: h.services } },
}));

import {
  verifyDeployedRuntime,
  verifyDeployedServiceRuntimes,
} from "@repo/platform/engine/modules/deployments/runtime-verification";

const imageId = `sha256:${"1".repeat(64)}`;
function adapter(output = "openship-runtime:php:8.4.15\n") {
  const exec = vi.fn().mockResolvedValue(output);
  return {
    exec,
    runtime: {
      supports: vi.fn((cap: string) =>
        ["isolatedExec", "inContainerExec", "containerInfo"].includes(cap),
      ),
      getContainerInfo: vi
        .fn()
        .mockResolvedValue({ containerId: "container", status: "running", imageId }),
      inContainerExecutor: vi.fn().mockResolvedValue({ exec }),
    },
  };
}
beforeEach(() => {
  h.services.mockReset().mockResolvedValue([]);
});

describe("post-deploy runtime observations", () => {
  it("records the observed version and actual image ID independently of a configured tag", async () => {
    const { runtime, exec } = adapter(),
      log = vi.fn();
    const result = await verifyDeployedRuntime({
      runtime,
      containerId: "container",
      framework: "laravel",
      imageRef: "dunglas/frankenphp:1-php8.4-bookworm",
      log,
    });
    expect(result).toMatchObject({
      status: "verified",
      runtime: "php",
      version: "8.4.15",
      imageId,
      checkedAt: expect.any(String),
    });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining("head -c 128"), { timeout: 3000 });
    expect(runtime.inContainerExecutor).toHaveBeenCalledWith("container");
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`php 8.4.15. image ID ${imageId}`));
  });

  it.each([
    "node:22.20.0",
    "bun:1.3.14",
    "deno:2.5.0",
    "python:3.13.9",
    "ruby:3.4.6",
    "java:21.0.9",
    "dotnet:8.0.21",
    "elixir:1.18.4",
  ])("records an observed %s interpreter without a PHP assumption", async (observed) => {
    const { runtime } = adapter(`openship-runtime:${observed}\n`);
    const [language, version] = observed.split(":");
    expect(
      await verifyDeployedRuntime({ runtime, containerId: "container", log() {} }),
    ).toMatchObject({ status: "verified", runtime: language, version });
  });

  it("does not fall back to a host executor when isolated container exec is unavailable", async () => {
    const { runtime, exec } = adapter();
    runtime.supports.mockImplementation((cap) => cap !== "isolatedExec");
    expect(
      await verifyDeployedRuntime({
        runtime,
        containerId: "container",
        framework: "laravel",
        log() {},
      }),
    ).toMatchObject({ status: "unavailable", version: null });
    expect(runtime.inContainerExecutor).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it.each(["go", "rust"])(
    "reports compiled %s explicitly unavailable without executing a compiler",
    async (framework) => {
      const { runtime, exec } = adapter();
      expect(
        await verifyDeployedRuntime({ runtime, containerId: "container", framework, log() {} }),
      ).toMatchObject({
        status: "unavailable",
        runtime: framework,
        version: null,
        imageId,
        reason: expect.stringContaining("Compiled application"),
      });
      expect(exec).not.toHaveBeenCalled();
    },
  );

  it("does not inspect a host artifact as though static files were a running interpreter", async () => {
    const { runtime, exec } = adapter();
    expect(
      await verifyDeployedRuntime({
        runtime,
        containerId: "/tmp/static-release",
        staticFiles: true,
        framework: "vite",
        log() {},
      }),
    ).toMatchObject({
      status: "unavailable",
      version: null,
      reason: expect.stringContaining("Static files"),
    });
    expect(runtime.getContainerInfo).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it("omits arbitrary process output from both metadata and deployment logs", async () => {
    const { runtime } = adapter("php 8.4.15 SECRET_PASSWORD=private\n"),
      log = vi.fn();
    const result = await verifyDeployedRuntime({ runtime, containerId: "container", log });
    expect(result).toMatchObject({ status: "unavailable", version: null });
    expect(JSON.stringify(result) + JSON.stringify(log.mock.calls)).not.toContain(
      "SECRET_PASSWORD",
    );
  });

  it("keeps transport and logging failures advisory without persisting raw error output", async () => {
    const { runtime, exec } = adapter();
    exec.mockRejectedValue(new Error("SECRET_PASSWORD=private"));
    const result = await verifyDeployedRuntime({
      runtime,
      containerId: "container",
      log() {
        throw new Error("log unavailable");
      },
    });
    expect(result).toMatchObject({ status: "error", version: null, imageId });
    expect(JSON.stringify(result)).not.toContain("SECRET_PASSWORD");
  });

  it("bounds a stalled observation and preserves an unknown result", async () => {
    vi.useFakeTimers();
    try {
      const { runtime, exec } = adapter();
      exec.mockReturnValue(new Promise(() => {}));
      const result = verifyDeployedRuntime({ runtime, containerId: "container", log() {} });
      await vi.advanceTimersByTimeAsync(6_001);
      expect(await result).toMatchObject({ status: "error", version: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it("observes only newly activated services and records static output explicitly unavailable", async () => {
    const { runtime, exec } = adapter();
    h.services.mockResolvedValue([
      {
        id: "wordpress",
        kind: "compose",
        name: "wordpress",
        image: "wordpress:7.1.3-php8.3-apache",
      },
      { id: "site", kind: "monorepo", name: "site", framework: "vite" },
    ]);
    const results = await verifyDeployedServiceRuntimes({
      runtime,
      projectId: "project",
      snapshot: { packageManager: "npm" } as never,
      services: [
        {
          serviceId: "wordpress",
          serviceName: "wordpress",
          status: "running",
          containerId: "wp-container",
        },
        { serviceId: "site", serviceName: "site", status: "running", staticRoot: "/tmp/static" },
        {
          serviceId: "carried",
          serviceName: "db",
          status: "running",
          containerId: "db-container",
          carried: true,
        },
        {
          serviceId: "failed",
          serviceName: "failed",
          status: "failed",
          containerId: "failed-container",
        },
      ],
      imageRefs: new Map([["wordpress", "wordpress:7.1.3-php8.3-apache"]]),
      log() {},
    });
    expect(Object.keys(results)).toEqual(["wordpress", "site"]);
    expect(results.wordpress).toMatchObject({
      status: "verified",
      runtime: "php",
      version: "8.4.15",
      imageId,
    });
    expect(results.site).toMatchObject({ status: "unavailable", version: null });
    expect(runtime.inContainerExecutor).toHaveBeenCalledExactlyOnceWith("wp-container");
    expect(exec).toHaveBeenCalledOnce();
  });

  it("does not fail an activated deployment when service configuration cannot be read", async () => {
    h.services.mockRejectedValue(new Error("database unavailable"));
    const { runtime } = adapter();
    await expect(
      verifyDeployedServiceRuntimes({
        runtime,
        projectId: "project",
        services: [],
        snapshot: {} as never,
        imageRefs: new Map(),
        log() {},
      }),
    ).resolves.toEqual({});
  });

  it("stops launching queued probes before the whole cohort exceeds its time budget", async () => {
    vi.useFakeTimers();
    try {
      const { runtime, exec } = adapter();
      exec.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve("openship-runtime:node:22.20.0\n"), 5_000),
          ),
      );
      const services = Array.from({ length: 10 }, (_, index) => ({
        serviceId: `s${index}`,
        serviceName: `s${index}`,
        containerId: `c${index}`,
        status: "running",
      }));
      const pending = verifyDeployedServiceRuntimes({
        runtime,
        projectId: "project",
        services,
        snapshot: {} as never,
        imageRefs: new Map(),
        log() {},
      });
      await vi.advanceTimersByTimeAsync(10_001);
      const result = await pending;
      expect(Object.keys(result)).toHaveLength(10);
      expect(exec.mock.calls.length).toBeLessThanOrEqual(4);
      expect(Object.values(result).some((value) => value.reason?.includes("time budget"))).toBe(
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
