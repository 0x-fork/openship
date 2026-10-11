import { describe, expect, it, mock } from "bun:test";
import { repairCatalogImage } from "./catalog-image-repair";

function client(image = "minio/minio:latest", activeDeploymentId: string | null = null) {
  const project = { id: "project", appTemplateId: "minio", activeDeploymentId };
  const service = {
    id: "service",
    projectId: "project",
    name: "minio",
    image,
    volumes: ["data:/data"],
    environment: { SECRET: "preserved" },
  };
  const update = mock(async () => service);
  const create = mock(async () => ({ deployment_id: "deployment" }));
  const wait = mock(async () => ({ deploymentId: "deployment", success: true, status: "ready" }));
  return {
    project,
    service,
    ship: {
      projects: { get: mock(async () => project) },
      services: { get: mock(async () => service), list: mock(async () => [service]), update },
      deployments: {
        create,
        list: mock(async () => ({ data: [{ projectId: "project", status: "failed" }] })),
      },
      deployment: () => ({ wait }),
    },
  };
}
const repair = (ship: ReturnType<typeof client>["ship"], apply = false) =>
  repairCatalogImage(
    ship as unknown as Parameters<typeof repairCatalogImage>[0],
    "project",
    "service",
    apply,
  );

describe("explicit retired catalog image repair", () => {
  it("previews without modifying anything", async () => {
    const { ship } = client();
    expect(await repair(ship)).toMatchObject({ status: "preview", from: "minio/minio:latest" });
    expect(ship.services.update).not.toHaveBeenCalled();
    expect(ship.deployments.create).not.toHaveBeenCalled();
  });
  it("changes only the failed service's image and uses a scoped normal deployment", async () => {
    const { ship, service } = client();
    const before = structuredClone(service);
    const result = await repair(ship, true);
    expect(ship.services.update).toHaveBeenCalledWith("project", "service", { image: result.to });
    expect(ship.deployments.create).toHaveBeenCalledWith({
      projectId: "project",
      serviceIds: ["service"],
      forceAll: true,
    });
    expect(service).toEqual(before);
    expect(result).toMatchObject({ status: "ready", success: true });
  });
  it("preserves custom images and running stateful installations", async () => {
    for (const c of [client("my/minio:v2"), client("minio/minio:latest", "live")]) {
      await expect(repair(c.ship, true)).rejects.toThrow();
      expect(c.ship.services.update).not.toHaveBeenCalled();
      expect(c.ship.deployments.create).not.toHaveBeenCalled();
    }
  });
  it("refuses a service changed after preview", async () => {
    const { ship } = client();
    ship.services.get.mockImplementationOnce(async () => ({ ...client().service }));
    ship.services.get.mockImplementationOnce(async () => ({
      ...client().service,
      image: "custom:v1",
    }));
    await expect(repair(ship, true)).rejects.toThrow("changed during");
    expect(ship.services.update).not.toHaveBeenCalled();
  });
  it("does not deploy sibling services in a partially installed app", async () => {
    const { ship, service } = client();
    ship.services.list.mockResolvedValue([service, { ...service, id: "sibling" }]);
    await expect(repair(ship, true)).rejects.toThrow("single-service");
    expect(ship.services.update).not.toHaveBeenCalled();
  });
  it("refuses drafts and deployments that are still running", async () => {
    for (const data of [[], [{ projectId: "project", status: "building" }]]) {
      const { ship } = client();
      ship.deployments.list.mockResolvedValue({ data });
      await expect(repair(ship, true)).rejects.toThrow("must have failed");
      expect(ship.services.update).not.toHaveBeenCalled();
      expect(ship.deployments.create).not.toHaveBeenCalled();
    }
  });
});
