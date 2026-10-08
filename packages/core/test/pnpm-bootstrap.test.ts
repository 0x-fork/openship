import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { packageManagerEnsureCommand } from "../src/stacks";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function run(
  files: Record<string, string>,
  options: { nested?: boolean; failCorepack?: boolean } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "openship-pnpm-bootstrap-"));
  roots.push(root);
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "bin"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content);
  for (const cmd of ["corepack", "npm"])
    writeFileSync(
      join(root, "bin", cmd),
      `#!/bin/sh\nprintf '%s\\n' "${cmd} $*" >> "$BOOTSTRAP_LOG"\n${cmd === "corepack" && options.failCorepack ? "exit 1" : "exit 0"}\n`,
      { mode: 0o755 },
    );
  const cwd = options.nested ? join(root, "nested") : root;
  if (options.nested) {
    mkdirSync(cwd);
    writeFileSync(join(cwd, "package.json"), "{}");
  }
  const result = spawnSync("sh", ["-c", packageManagerEnsureCommand("pnpm")], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      BOOTSTRAP_LOG: join(root, "calls"),
    },
  });
  let calls = "";
  try {
    calls = readFileSync(join(root, "calls"), "utf8");
  } catch {}
  return { ...result, calls, root };
}
describe("managed pnpm bootstrap", () => {
  it("does not downgrade an unpinned repository with an explicit dependency-script policy", () => {
    const result = run({
      "package.json": "{}",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'",
      "pnpm-workspace.yaml": "allowBuilds:\n  sharp: false\n",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("preserves your explicit dependency-script policy");
    expect(result.calls).toBe("");
  });

  it.each([
    ["9.0", "9.15.9"],
    ["6.0", "8.15.9"],
    ["5.4", "7.33.7"],
  ])("selects a fixed version for lockfile %s", (lock, version) => {
    const result = run({ "package.json": "{}", "pnpm-lock.yaml": `lockfileVersion: '${lock}'\n` });
    expect(result.status).toBe(0);
    expect(result.calls).toContain(`corepack prepare pnpm@${version} --activate`);
    expect(readFileSync(join(result.root, "package.json"), "utf8")).toBe("{}");
  });
  it("honors a parent packageManager pin even when a child has a package.json", () => {
    const result = run(
      {
        "package.json": JSON.stringify({ packageManager: "pnpm@12.10.1" }),
        "pnpm-lock.yaml": "lockfileVersion: '9.0'",
      },
      { nested: true },
    );
    expect(result.status).toBe(0);
    expect(result.calls).toContain("prepare pnpm@12.10.1 --activate");
  });
  it("honors exact devEngines pins", () => {
    const result = run({
      "package.json": JSON.stringify({
        devEngines: { packageManager: { name: "pnpm", version: "10.1.0" } },
      }),
    });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("prepare pnpm@10.1.0 --activate");
  });
  it("keeps the selected version in the npm fallback", () => {
    const result = run({ "pnpm-lock.yaml": "lockfileVersion: '9.0'" }, { failCorepack: true });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("npm install --global pnpm@9.15.9");
  });
  it.each(["pnpm@latest", "pnpm@9;touch /tmp/injected", "yarn@1.22.22"])(
    "refuses incompatible or unbounded pins: %s",
    (packageManager) => {
      const result = run({ "package.json": JSON.stringify({ packageManager }) });
      expect(result.status).not.toBe(0);
      expect(result.calls).toBe("");
    },
  );
  it("does not silently ignore an unknown lockfile", () => {
    const result = run({ "pnpm-lock.yaml": "lockfileVersion: '99.0'" });
    expect(result.status).not.toBe(0);
    expect(result.calls).toBe("");
  });
  it("does not drop integrity requirements when corepack fails", () => {
    const result = run(
      {
        "package.json": JSON.stringify({ packageManager: `pnpm@9.15.9+sha224.${"a".repeat(56)}` }),
      },
      { failCorepack: true },
    );
    expect(result.status).not.toBe(0);
    expect(result.calls).not.toContain("npm install");
  });
});
