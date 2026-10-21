import "../jobs/_env";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
const network = vi.hoisted(() => ({ create: vi.fn(), exec: vi.fn(), dispose: vi.fn() }));
vi.mock("@repo/platform/engine/config/env", async (original) => {
  const actual = await original<typeof import("@repo/platform/engine/config/env")>();
  return { ...actual, env: { ...actual.env, CLOUD_MODE: true } };
});
vi.mock("@repo/adapters", async (original) => ({
  ...(await original<typeof import("@repo/adapters")>()),
  createExecutor: network.create,
}));
import { repos } from "@repo/db";
import { seedOwner } from "../jobs/_harness";
import { connectedServerRoutes } from "../../../src/modules/system/connected-server.routes";
import { serverResourceRoutes } from "../../../src/modules/system/server-resource.routes";
import { handleApiError } from "../../../src/middleware/error-handler";
import { managementNamespace } from "@repo/platform/engine/modules/billing/management.service";
import { sshManager } from "@repo/platform/engine/lib/ssh-manager";
const app = new Hono()
  .onError(handleApiError)
  .route("/api/system", serverResourceRoutes)
  .route("/api/system", connectedServerRoutes);
const hostKey = Buffer.from("fixture-host-key");
const input = {
  sshHost: "93.184.216.34",
  sshAuthMethod: "password",
  sshPassword: "fixture-secret",
};
const connections: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  network.exec.mockResolvedValue("");
  network.dispose.mockResolvedValue(undefined);
  network.create.mockImplementation((config) => {
    if (!config.hostVerifier(hostKey)) throw new Error("Wrong host identity");
    return { exec: network.exec, dispose: network.dispose };
  });
});
afterEach(() => {
  for (const id of connections.splice(0)) sshManager.invalidate(id);
});
async function owner() {
  const actor = await seedOwner();
  await repos.managementBilling.ensure(actor.orgId, managementNamespace(actor.orgId));
  await repos.managementBilling.update(actor.orgId, {
    checkedAt: new Date(),
    verified: {
      servers: 2,
      baseIncluded: false,
      priceCents: 500,
      status: "active",
      cancelAtPeriodEnd: false,
      periodEnd: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  const create = (body: unknown = input) =>
    app.request("/api/system/servers", {
      method: "POST",
      headers: { ...actor.auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { actor, create };
}

it("serializes concurrent connections against one allowance and encrypts the saved credentials", async () => {
  const { actor, create } = await owner();
  const responses = await Promise.all(
    Array.from({ length: 3 }, (_, i) => create({ ...input, sshPort: 2200 + i })),
  );
  expect(responses.filter((response) => response.ok)).toHaveLength(2);
  expect(responses.filter((response) => response.status === 402)).toHaveLength(1);
  const servers = await repos.server.listByOrganization(actor.orgId, true);
  expect(servers).toHaveLength(2);
  for (const server of servers) {
    expect(server.sshPassword).toMatch(/^enc1:/);
    expect(server.sshHostKey).toBe(hostKey.toString("base64"));
  }
  for (const response of responses) expect(await response.text()).not.toContain(input.sshPassword);
});

it.each(["127.0.0.1", "169.254.169.254", "10.0.0.1", "::1"])(
  "never dials private Cloud-control-plane destination %s",
  async (sshHost) => {
    const { create } = await owner();
    expect((await create({ ...input, sshHost })).status).toBe(400);
    expect(network.create).not.toHaveBeenCalled();
  },
);

it("rechecks paid access before reusing a pooled SSH connection", async () => {
  const { actor, create } = await owner();
  expect((await create()).ok).toBe(true);
  const server = (await repos.server.listByOrganization(actor.orgId, true))[0]!;
  connections.push(server.id);
  await sshManager.acquire(server.id);
  const dials = network.create.mock.calls.length;
  await repos.managementBilling.update(actor.orgId, { checkedAt: new Date(), verified: null });
  await expect(sshManager.acquire(server.id)).rejects.toMatchObject({
    code: "MANAGEMENT_PLAN_REQUIRED",
  });
  expect(network.create.mock.calls).toHaveLength(dials);
  expect(await repos.server.get(server.id)).toBeDefined();
});
