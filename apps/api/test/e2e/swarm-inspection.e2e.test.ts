/** Swarm lives only inside two disposable DinD containers, never on the test host. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import Dockerode from "dockerode";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { inspectDockerSwarm, type CommandExecutor } from "@repo/adapters";
import { probeEdge, freeEdgeTargets } from "../../../../packages/adapters/src/system/proxy/detect";
import { describeDockerE2E, dockerSocketPath, requireDocker } from "../helpers/docker-e2e";

const exec = promisify(execFile);
const image = "docker:28.5.2-dind";
const docker = async (args: string[], timeout = 30_000) =>
  (
    await exec("docker", ["--host", `unix://${dockerSocketPath}`, ...args], {
      timeout,
      maxBuffer: 2 * 1024 * 1024,
    })
  ).stdout.trim();

describeDockerE2E("Swarm inspection and ownership on independent Docker daemons", () => {
  const network = `openship-swarm-test-${randomUUID()}`;
  const containers: string[] = [];
  let networkCreated = false;
  let manager: Dockerode, worker: Dockerode;
  let managerContainer: string;
  const inside = (command: string) => docker(["exec", managerContainer, "sh", "-c", command]);

  beforeAll(async () => {
    await requireDocker();
    await docker(["pull", image], 120_000);
    await docker(["network", "create", "--label", "openship.test=swarm-inspection", network]);
    networkCreated = true;
    const createNode = async () => {
      const container = await docker([
        "create",
        "--privileged",
        "--network",
        network,
        "--label",
        "openship.test=swarm-inspection",
        "--env",
        "DOCKER_TLS_CERTDIR=",
        "--publish",
        "127.0.0.1::2375",
        image,
      ]);
      containers.push(container);
      await docker(["start", container]);
      const inspect = JSON.parse(await docker(["inspect", container]))[0];
      const node = new Dockerode({
        host: "127.0.0.1",
        port: Number(inspect.NetworkSettings.Ports["2375/tcp"][0].HostPort),
        timeout: 5000,
      });
      await vi.waitFor(async () => expect(String(await node.ping())).toBe("OK"), {
        timeout: 40_000,
        interval: 500,
      });
      return {
        node,
        container,
        address: inspect.NetworkSettings.Networks[network].IPAddress as string,
      };
    };
    const m = await createNode(),
      w = await createNode();
    manager = m.node;
    worker = w.node;
    managerContainer = m.container;
    await manager.swarmInit({ ListenAddr: "0.0.0.0:2377", AdvertiseAddr: m.address });
    const swarm = await manager.swarmInspect();
    await worker.swarmJoin({
      ListenAddr: "0.0.0.0:2377",
      AdvertiseAddr: w.address,
      RemoteAddrs: [`${m.address}:2377`],
      JoinToken: swarm.JoinTokens.Worker,
    });
    // Exercise a real stack, including ingress on a manager with NO local task.
    const compose = JSON.stringify({
      version: "3.8",
      services: {
        web: {
          image: "busybox:1.37",
          command: ["sleep", "600"],
          environment: { TEST_PASSWORD: "test-only-private-value" },
          deploy: { replicas: 1, placement: { constraints: ["node.role == worker"] } },
          ports: [{ target: 8080, published: 80 }],
          volumes: ["data:/data"],
        },
      },
      volumes: { data: {} },
    });
    // JSON is also valid YAML; pass the fixture as an argv value, never shell interpolation.
    await docker([
      "exec",
      managerContainer,
      "sh",
      "-c",
      'printf "%s" "$1" | docker stack deploy --resolve-image never -c - sample',
      "fixture",
      compose,
    ]);
    await vi.waitFor(
      async () =>
        expect(
          (await inspectDockerSwarm(manager, true)).inventory?.stacks[0]?.services[0]?.runningTasks,
        ).toBe(1),
      { timeout: 120_000, interval: 1000 },
    );
  }, 360_000);

  afterAll(async () => {
    const cleanup = await Promise.allSettled(
      containers.map((id) => docker(["rm", "--force", "--volumes", id])),
    );
    if (networkCreated) await docker(["network", "rm", network]);
    for (const result of cleanup) if (result.status === "rejected") throw result.reason;
  }, 60_000);

  it("reads the stack from its manager, preserves it during takeover refusal, and guides workers", async () => {
    const result = await inspectDockerSwarm(manager, true);
    expect(result).toMatchObject({
      state: "active",
      role: "manager",
      nodeCount: 2,
      inventory: {
        nodes: expect.arrayContaining([
          expect.objectContaining({ role: "worker", state: "ready" }),
        ]),
        stacks: [
          {
            name: "sample",
            services: [
              {
                name: "sample_web",
                desiredTasks: 1,
                runningTasks: 1,
                ports: [expect.objectContaining({ published: 80, target: 8080 })],
                mounts: [{ type: "volume", target: "/data", readOnly: false }],
              },
            ],
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("test-only-private-value");
    expect(await inspectDockerSwarm(worker, true)).toMatchObject({
      role: "worker",
      inventory: null,
    });
    const servicesBefore = (await manager.listServices()).map((service) => ({
      id: service.ID,
      version: service.Version?.Index,
    }));
    expect(servicesBefore).toEqual([expect.objectContaining({ version: expect.any(Number) })]);
    expect(
      await inside("docker ps -q --filter label=com.docker.swarm.service.name=sample_web"),
    ).toBe("");
    const executor = { exec: inside } as unknown as CommandExecutor;
    expect(await probeEdge(executor)).toMatchObject({
      canProceedClean: false,
      occupants: [expect.objectContaining({ port: 80, swarmService: "sample_web" })],
    });
    await expect(
      freeEdgeTargets(executor, [{ unit: "nginx.service", port: 80 }], () => {}),
    ).rejects.toMatchObject({ code: "SWARM_SERVICE_OWNED" });
    expect(
      (await manager.listServices()).map((service) => ({
        id: service.ID,
        version: service.Version?.Index,
      })),
    ).toEqual(servicesBefore);
    expect(
      (await inspectDockerSwarm(manager, true)).inventory?.stacks[0]?.services[0]?.runningTasks,
    ).toBe(1);
  }, 30_000);
});
