import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand, stubFetch, type FetchStub } from "../helpers/harness";

vi.mock("../../src/lib/config", () => ({
  getApiUrl: () => "http://api.test",
  getToken: () => "tok",
}));
const gitState = vi.hoisted(() => ({ inRepo: false }));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: (...args: Parameters<typeof actual.execFileSync>) => {
      if (args[0] === "git") {
        if (gitState.inRepo) return Buffer.from("true");
        throw new Error("not a Git repository");
      }
      return actual.execFileSync(...args);
    },
  };
});
vi.mock("../../src/lib/project-link", () => ({ readProjectLink: () => null }));

describe("deploy requires folder upload opt-in (#853)", () => {
  let fetchStub: FetchStub;
  beforeEach(() => {
    vi.resetModules();
    gitState.inRepo = false;
  });
  afterEach(() => {
    fetchStub?.restore();
    vi.restoreAllMocks();
  });

  it.each([
    { flags: ["--folder"], inRepo: true },
    { flags: ["--name", "local-app"], inRepo: false },
  ])("uploads source with explicit opt-in: $flags", async ({ flags, inRepo }) => {
    const sourceDir = mkdtempSync(join(tmpdir(), "openship-folder-command-"));
    writeFileSync(join(sourceDir, "index.html"), "site");
    vi.spyOn(process, "cwd").mockReturnValue(sourceDir);
    gitState.inRepo = inRepo;
    fetchStub = stubFetch((req) => {
      if (req.url.endsWith("/projects/folder/session")) {
        return { json: { sessionId: "session-1", upload: { url: "/folder-upload" } } };
      }
      if (req.url.endsWith("/folder-upload")) return { json: { success: true } };
      if (req.url.endsWith("/projects/folder/scan/session-1")) return { json: { success: true } };
      if (req.url.endsWith("/projects/ensure")) {
        expect(req.body).toMatchObject({ projectId: "p1", gitProvider: "upload" });
        return { json: { project_id: "p1" } };
      }
      if (req.url.endsWith("/deployments/build/access")) {
        expect(req.body).toMatchObject({
          projectId: "p1",
          uploadSessionId: "session-1",
          serviceIds: ["svc1"],
        });
        return { json: { deployment_id: "d1" } };
      }
      throw new Error(`Unexpected endpoint: ${req.url}`);
    });
    try {
      const { deployCommand } = await import("../../src/commands/deploy");
      const result = await runCommand(deployCommand, [
        ...flags,
        "--project",
        "p1",
        "--service-ids",
        "svc1",
      ]);
      expect(result.code).toBe(0);
      expect(result.out + result.err).toContain("d1");
      expect(fetchStub.calls).toHaveLength(5);
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it.each([[], ["--project", "p1", "--service-ids", "svc1"]])(
    "does not provision an upload outside Git for %j",
    async (...args: string[]) => {
      fetchStub = stubFetch(() => {
        throw new Error("must not send a request");
      });
      const { deployCommand } = await import("../../src/commands/deploy");
      const result = await runCommand(deployCommand, args);
      expect(result.code).toBe(1);
      expect(result.err).toContain("--folder");
      expect(fetchStub.calls).toEqual([]);
    },
  );

  it("uses the Git deployment endpoint for an explicit remote branch", async () => {
    fetchStub = stubFetch((req) => {
      expect(req.url).toBe("http://api.test/api/deployments");
      expect(req.body).toMatchObject({ projectId: "p1", branch: "main", serviceIds: ["svc1"] });
      return { json: { data: { deployment_id: "dep1" } } };
    });
    const { deployCommand } = await import("../../src/commands/deploy");
    const result = await runCommand(deployCommand, [
      "--project",
      "p1",
      "--branch",
      "main",
      "--service-ids",
      "svc1",
    ]);
    expect(result.code).toBe(0);
    expect(fetchStub.calls).toHaveLength(1);
  });

  it("rejects Git-only options with --folder before making requests", async () => {
    fetchStub = stubFetch(() => {
      throw new Error("must not send a request");
    });
    const { deployCommand } = await import("../../src/commands/deploy");
    const result = await runCommand(deployCommand, ["--folder", "--commit", "abc123"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("cannot be combined");
    expect(fetchStub.calls).toEqual([]);
  });
});
