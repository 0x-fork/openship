import { expect, it, vi } from "vitest";
import { OpenshipClient } from "../src/client";
import { swarmFixture } from "../../contracts/test/swarm-fixture";

it("inspects through the shared server facade with escaped ID and validated optional query", async () => {
  const fetcher = vi.fn(async () => Response.json(swarmFixture()));
  const ship = new OpenshipClient({ baseUrl: "https://ship.test", fetch: fetcher });
  expect(await ship.servers.inspectSwarm("manager/a", { details: true })).toEqual(swarmFixture());
  expect(fetcher).toHaveBeenCalledWith(
    "https://ship.test/api/system/servers/manager%2Fa/swarm?details=true",
    expect.objectContaining({ method: "GET" }),
  );
  await ship.servers.inspectSwarm("manager/a");
  expect(fetcher).toHaveBeenLastCalledWith(
    "https://ship.test/api/system/servers/manager%2Fa/swarm",
    expect.objectContaining({ method: "GET" }),
  );
  await expect(
    ship.servers.inspectSwarm("manager/a", { details: "yes" } as never),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
