import { describe, expect, it } from "vitest";
import {
  ENV_MASK,
  maskDeploymentEnv,
  maskDriftChanges,
  maskServiceEnv,
} from "../../src/lib/secret-env";

const service = (value: string) => ({
  name: "web",
  projectId: "project-1",
  buildArgs: { TOKEN: value, INHERITED: null, TEMPLATE: "${TOKEN}", EMPTY: "" },
  advanced: { buildArgTemplateKeys: ["TEMPLATE"] },
  importedSpec: { buildArgs: { TOKEN: "original-secret" } },
  driftSpec: { buildArgs: { TOKEN: "pending-secret" } },
});

describe("build argument response protection (#854)", () => {
  it("masks old and new deployments without changing rollback input, and verifies literal rotations", () => {
    const old = {
      id: "d1",
      projectId: "project-1",
      meta: { composeServices: [service("old-secret")] },
    };
    const current = {
      id: "d2",
      projectId: "project-1",
      meta: { composeServices: [service("new-secret")] },
    };
    const oldResponse = maskDeploymentEnv(old);
    const newResponse = maskDeploymentEnv(current);
    const saved = maskServiceEnv(service("new-secret")) as any;
    const oldPublic = oldResponse.meta.composeServices[0] as any;
    const newPublic = newResponse.meta.composeServices[0] as any;
    for (const response of [oldPublic, newPublic, saved]) {
      expect(response.buildArgs).toEqual({
        TOKEN: ENV_MASK,
        INHERITED: null,
        TEMPLATE: ENV_MASK,
        EMPTY: "",
      });
      expect(Object.keys(response.buildArgsFingerprints).sort()).toEqual(["EMPTY", "TOKEN"]);
      expect(response).not.toHaveProperty("importedSpec");
      expect(response).not.toHaveProperty("driftSpec");
      expect(JSON.stringify(response)).not.toContain("-secret");
    }
    expect(saved.buildArgsFingerprints.TOKEN).toBe(newPublic.buildArgsFingerprints.TOKEN);
    expect(oldPublic.buildArgsFingerprints.TOKEN).not.toBe(newPublic.buildArgsFingerprints.TOKEN);
    expect(old.meta.composeServices[0].buildArgs.TOKEN).toBe("old-secret");
    expect(current.meta.composeServices[0].buildArgs.TOKEN).toBe("new-secret");
  });

  it("does not let another project or service reproduce a target's fingerprint", () => {
    const original = maskServiceEnv(service("same-value")) as any;
    const otherProject = maskServiceEnv({ ...service("same-value"), projectId: "other" }) as any;
    const otherService = maskServiceEnv({ ...service("same-value"), name: "other" }) as any;
    expect(original.buildArgsFingerprints.TOKEN).not.toBe(otherProject.buildArgsFingerprints.TOKEN);
    expect(original.buildArgsFingerprints.TOKEN).not.toBe(otherService.buildArgsFingerprints.TOKEN);
  });

  it("masks build-arg drift values, including literal defaults inside expressions", () => {
    const result = maskDriftChanges([
      {
        field: "buildArgs",
        from: { TOKEN: "old-secret" },
        to: { TOKEN: "${TOKEN:-new-secret}" },
      },
    ]);
    expect(result).toEqual([
      { field: "buildArgs", from: { TOKEN: ENV_MASK }, to: { TOKEN: ENV_MASK } },
    ]);
  });
});
