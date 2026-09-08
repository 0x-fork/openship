import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deployFolder } from "../../src/lib/folder-deploy";

const mocks = vi.hoisted(() => ({
  temp: "",
  failTar: false,
  apiRequest: vi.fn(),
  apiRaw: vi.fn(),
}));
vi.mock("node:os", async (original) => {
  const actual = await original<typeof import("node:os")>();
  return { ...actual, tmpdir: () => mocks.temp || actual.tmpdir() };
});
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: (...args: Parameters<typeof execFileSync>) => {
      if (mocks.failTar && args[0] === "tar") {
        // A real tar failure can leave a partial output before exiting.
        writeFileSync(String(args[1]?.[1]), "partial archive");
        throw new Error("tar failed");
      }
      return actual.execFileSync(...args);
    },
  };
});
vi.mock("../../src/lib/api-client", () => mocks);

let sandbox: string;
let source: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "openship-folder-test-"));
  mocks.temp = join(sandbox, "tmp");
  source = join(sandbox, "source");
  mkdirSync(mocks.temp);
  mkdirSync(source);
  mkdirSync(join(source, "dist"));
  writeFileSync(join(source, "dist", "index.html"), "the deployed site");
  mocks.failTar = false;
  mocks.apiRequest.mockReset().mockImplementation(async (url: string) => {
    if (url === "/projects/folder/session") {
      return { sessionId: "same-session", upload: { url: "/upload" } };
    }
    if (url.startsWith("/projects/folder/scan/")) return { success: true };
    if (url === "/projects/ensure") return { project_id: "p1" };
    if (url === "/deployments/build/access") return { deployment_id: "d1" };
    throw new Error(`Unexpected endpoint: ${url}`);
  });
  mocks.apiRaw.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => {
  mocks.temp = "";
  rmSync(sandbox, { recursive: true, force: true });
});

describe("folder upload staging (#853)", () => {
  it.each(["temp root", "ancestor", "symlink"])(
    "rejects a source containing TMPDIR (%s) before provisioning or packaging",
    async (kind) => {
      const alias = join(sandbox, "temp-link");
      symlinkSync(mocks.temp, alias, "dir");
      const cwd = kind === "temp root" ? mocks.temp : kind === "ancestor" ? sandbox : alias;
      // Old failed uploads belong to the operator; the guard must leave them alone.
      writeFileSync(join(mocks.temp, "openship-upload-old.tar.gz"), "old archive");
      await expect(deployFolder({ cwd })).rejects.toThrow(/temporary directory/i);
      expect(mocks.apiRequest).not.toHaveBeenCalled();
      expect(readdirSync(mocks.temp)).toEqual(["openship-upload-old.tar.gz"]);
    },
  );

  it("uploads real source archives repeatedly and removes every staging directory", async () => {
    // A common prefix is not ancestry (tmp versus tmp-project).
    source = join(sandbox, "tmp-project");
    mkdirSync(source);
    writeFileSync(join(source, "index.html"), "site");
    mocks.apiRaw.mockImplementation(async (_url, request) => {
      const contents = execFileSync("tar", ["-tzf", "-"], { input: request.body }).toString();
      expect(contents).toContain("./index.html");
      expect(contents).not.toContain("openship-upload-");
      expect(contents).not.toContain("source.tar.gz");
      return { ok: true };
    });
    for (let i = 0; i < 3; i++) {
      await expect(deployFolder({ cwd: source })).resolves.toMatchObject({ deploymentId: "d1" });
      expect(readdirSync(mocks.temp)).toEqual([]);
    }
  });

  it("removes partial archives when tar fails before upload", async () => {
    mocks.failTar = true;
    await expect(deployFolder({ cwd: source })).rejects.toThrow("tar failed");
    expect(readdirSync(mocks.temp)).toEqual([]);
    expect(mocks.apiRaw).not.toHaveBeenCalled();
  });

  it("preserves built assets in the archive and cleans up on upload failure", async () => {
    mocks.apiRaw.mockImplementation(async (_url, request) => {
      const contents = execFileSync("tar", ["-tzf", "-"], { input: request.body }).toString();
      expect(contents).toContain("./dist/index.html");
      return { ok: false, status: 503 };
    });
    await expect(deployFolder({ cwd: source })).rejects.toThrow("upload failed (HTTP 503)");
    expect(readdirSync(mocks.temp)).toEqual([]);
  });
});
