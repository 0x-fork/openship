import { shellQuote } from "./shell-split";

/** Runs inside the build directory. Never edits package.json or approves scripts.
 * Corepack otherwise chooses its latest release for unpinned repositories, so
 * a lockfile produced by pnpm 9 can unexpectedly be installed by pnpm 12. */
export const pnpmBootstrapSource = `
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process");
let directory = process.cwd(), pin, lock, scriptPolicy = false;
const policyKeys = ["onlyBuiltDependencies", "ignoredBuiltDependencies", "neverBuiltDependencies", "allowBuilds", "strictDepBuilds", "dangerouslyAllowAllBuilds"];
for (;;) {
  const manifest = path.join(directory, "package.json");
  if (fs.existsSync(manifest)) {
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
    if (pkg.pnpm && policyKeys.some(key => key in pkg.pnpm)) scriptPolicy = true;
    const declared = pkg.packageManager;
    if (declared !== undefined) {
      if (typeof declared !== "string" || !/^pnpm@\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+sha(?:224|256|384|512)\\.[0-9a-f]+)?$/.test(declared))
        throw new Error("The build uses pnpm but packageManager is not an exact pnpm version. Set packageManager to pnpm@X.Y.Z or select the matching package manager.");
      pin = declared;
      break;
    }
    if (pkg.devEngines && pkg.devEngines.packageManager) {
      const engine = pkg.devEngines.packageManager;
      if (engine.name !== "pnpm" || typeof engine.version !== "string" || !/^\\d+\\.\\d+\\.\\d+$/.test(engine.version))
        throw new Error("Set an exact packageManager pnpm@X.Y.Z to preserve devEngines.packageManager during managed builds.");
      pin = "pnpm@" + engine.version;
      break;
    }
  }
  for (const name of ["pnpm-workspace.yaml", ".npmrc"]) {
    const file = path.join(directory, name);
    if (fs.existsSync(file) && /^(?:onlyBuiltDependencies|ignoredBuiltDependencies|neverBuiltDependencies|allowBuilds|strictDepBuilds|dangerouslyAllowAllBuilds|strict-dep-builds)\\s*[:=]/m.test(fs.readFileSync(file, "utf8"))) scriptPolicy = true;
  }
  const file = path.join(directory, "pnpm-lock.yaml");
  if (lock === undefined && fs.existsSync(file)) {
    const match = fs.readFileSync(file, "utf8").match(/^lockfileVersion:\\s*['\"]?(\\d+(?:\\.\\d+)?)/m);
    if (!match) throw new Error("Cannot determine pnpm lockfile version; set packageManager to pnpm@X.Y.Z.");
    lock = match[1];
  }
  if (fs.existsSync(path.join(directory, ".git"))) break;
  const parent = path.dirname(directory);
  if (parent === directory) break;
  directory = parent;
}
if (!pin) {
  if (scriptPolicy) throw new Error("Pin packageManager to pnpm@X.Y.Z so the managed build preserves your explicit dependency-script policy.");
  const versions = { "9": "9.15.9", "9.0": "9.15.9", "6": "8.15.9", "6.0": "8.15.9", "5.4": "7.33.7", "5.3": "6.35.1" };
  const version = lock === undefined ? "9.15.9" : versions[lock];
  if (!version) throw new Error("Unsupported pnpm lockfile version; set packageManager to pnpm@X.Y.Z.");
  pin = "pnpm@" + version;
}
console.log("[openship] Package manager: " + pin);
const run = (command, args) => cp.spawnSync(command, args, { stdio: "inherit", env: { ...process.env, COREPACK_DEFAULT_TO_LATEST: "0", COREPACK_ENABLE_AUTO_PIN: "0" } }).status === 0;
if (run("corepack", ["enable", "pnpm"])) {
  if (!run("corepack", ["prepare", pin, "--activate"])) throw new Error("Corepack could not prepare the selected pnpm version.");
  process.exit(0);
}
if (pin.includes("+sha")) throw new Error("Corepack is required to honor the packageManager integrity pin.");
if (!run("npm", ["install", "--global", pin])) throw new Error("Unable to install the selected pnpm version.");
`;

export function pnpmEnsureCommand(): string {
  return `export COREPACK_DEFAULT_TO_LATEST=0 COREPACK_ENABLE_AUTO_PIN=0 && node -e ${shellQuote(pnpmBootstrapSource.replace(/\n/g, " "))}`;
}
