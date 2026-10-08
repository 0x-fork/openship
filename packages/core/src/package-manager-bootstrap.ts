import { shellQuote } from "./shell-split";
import {
  declaredPackageManagerPin,
  PACKAGE_MANAGER_DEFAULTS,
  type ManagedPackageManager,
} from "./package-manager-version";

/** Shared discovery and verification with manager-specific installation drivers. */
export function packageManagerBootstrapSource(manager: ManagedPackageManager): string {
  return `const manager = ${JSON.stringify(manager)}, defaults = ${JSON.stringify(PACKAGE_MANAGER_DEFAULTS)};
const declaredPackageManagerPin = ${declaredPackageManagerPin.toString()};
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process");
let directory = process.cwd(), pin, lock, yarnLock, yarnPath, scriptPolicy = false;
let ignoreYarnPath = /^(?:1|true)$/i.test(process.env.YARN_IGNORE_PATH || "");
const policyKeys = ["onlyBuiltDependencies", "ignoredBuiltDependencies", "neverBuiltDependencies", "allowBuilds", "strictDepBuilds", "dangerouslyAllowAllBuilds"];
for (;;) {
  const manifest = path.join(directory, "package.json");
  if (fs.existsSync(manifest)) {
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
    if (pkg.pnpm && policyKeys.some(key => key in pkg.pnpm)) scriptPolicy = true;
    const declared = declaredPackageManagerPin(pkg, manager);
    if (declared) pin = declared;
  }
  for (const name of ["pnpm-workspace.yaml", ".npmrc"]) {
    const file = path.join(directory, name);
    if (fs.existsSync(file) && /^(?:onlyBuiltDependencies|ignoredBuiltDependencies|neverBuiltDependencies|allowBuilds|strictDepBuilds|dangerouslyAllowAllBuilds|strict-dep-builds)\\s*[:=]/m.test(fs.readFileSync(file, "utf8"))) scriptPolicy = true;
  }
  if (manager === "yarn" && yarnLock === undefined && fs.existsSync(path.join(directory, "yarn.lock")))
    yarnLock = fs.readFileSync(path.join(directory, "yarn.lock"), "utf8");
  if (manager === "yarn" && yarnPath === undefined) for (const name of [".yarnrc.yml", ".yarnrc"]) {
    const file = path.join(directory, name);
    if (!fs.existsSync(file)) continue;
    const contents = fs.readFileSync(file, "utf8");
    if (/^\\s*ignorePath:\\s*true\\s*(?:#.*)?$/m.test(contents)) ignoreYarnPath = true;
    const match = contents.match(/^\\s*(?:yarnPath:|yarn-path)\\s*(?:"([^"]+)"|'([^']+)'|([^#\\r\\n]+))/m);
    const value = match && (match[1] || match[2] || match[3]).trim();
    if (value && value !== "false" && value !== "null") { yarnPath = path.resolve(directory, value); break; }
  }
  const file = path.join(directory, "pnpm-lock.yaml");
  if (manager === "pnpm" && lock === undefined && fs.existsSync(file)) {
    const match = fs.readFileSync(file, "utf8").match(/^lockfileVersion:\\s*['\"]?(\\d+(?:\\.\\d+)?)/m);
    if (!match) throw new Error("Cannot determine pnpm lockfile version; set packageManager to pnpm@X.Y.Z.");
    lock = match[1];
  }
  if (pin || fs.existsSync(path.join(directory, ".git"))) break;
  const parent = path.dirname(directory);
  if (parent === directory) break;
  directory = parent;
}

const toolEnv = { ...process.env, COREPACK_DEFAULT_TO_LATEST: "0", COREPACK_ENABLE_AUTO_PIN: "0" };
const execute = (command, args, capture = false) => cp.spawnSync(command, args, { stdio: capture ? "pipe" : "inherit", encoding: "utf8", env: toolEnv });
const run = (command, args) => execute(command, args).status === 0;
const versionOf = (command, args = ["--version"]) => {
  const result = execute(command, args, true);
  return result.status === 0 ? result.stdout.trim() : undefined;
};
let localYarnVersion;
if (manager === "yarn" && yarnPath && !ignoreYarnPath) {
  localYarnVersion = versionOf(process.execPath, [yarnPath, "--version"]);
  if (!localYarnVersion || !/^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$/.test(localYarnVersion))
    throw new Error("Cannot verify the repository yarnPath version.");
}
if (!pin) {
  let version = defaults[manager];
  if (manager === "pnpm") {
    if (scriptPolicy) throw new Error("Pin packageManager to pnpm@X.Y.Z so the managed build preserves your explicit dependency-script policy.");
    const versions = { "9": "9.15.9", "9.0": "9.15.9", "6": "8.15.9", "6.0": "8.15.9", "5.4": "7.33.7", "5.3": "6.35.1" };
    version = lock === undefined ? defaults.pnpm : versions[lock];
    if (!version) throw new Error("Unsupported pnpm lockfile version; set packageManager to pnpm@X.Y.Z.");
  }
  if (manager === "yarn") {
    if (localYarnVersion) version = localYarnVersion;
    else if (yarnLock && /(?:^|\\n)__metadata:/.test(yarnLock)) {
      const metadata = yarnLock.match(/__metadata:\\s*\\n\\s+version:\\s*(\\d+)/);
      version = metadata && ({ "4": "2.4.3", "6": "3.8.7", "8": "4.9.2" })[metadata[1]];
      if (!version) throw new Error("Unsupported Yarn lockfile; set packageManager to yarn@X.Y.Z.");
    } else if (yarnLock && !yarnLock.includes("# yarn lockfile v1"))
      throw new Error("Unsupported Yarn lockfile; set packageManager to yarn@X.Y.Z.");
  }
  pin = manager + "@" + version;
}
const version = pin.slice(manager.length + 1).split("+sha")[0];
if (localYarnVersion && localYarnVersion !== version)
  throw new Error("yarnPath and the declared package-manager version disagree.");
console.log("[openship] Selected package manager: " + pin);
if (manager === "pnpm" || manager === "yarn" || (manager === "npm" && pin.includes("+sha"))) {
  if (run("corepack", ["enable", manager])) {
    if (!run("corepack", ["prepare", pin, "--activate"])) throw new Error("Corepack could not prepare the selected package-manager version.");
  } else {
    if (pin.includes("+sha")) throw new Error("Corepack is required to honor the packageManager integrity pin.");
    const spec = manager === "yarn" && Number(version.split(".")[0]) >= 2 ? "@yarnpkg/cli-dist@" + version : pin;
    if (!run("npm", ["install", "--global", spec])) throw new Error("Unable to install the selected package-manager version.");
  }
} else {
  if (pin.includes("+sha")) throw new Error("Integrity-qualified Bun pins need a custom toolchain; no integrity requirement was discarded.");
  if (versionOf(manager) !== version) {
    if (manager === "bun" && process.versions.bun) {
      const platform = process.platform, arch = process.arch === "arm64" ? "aarch64" : process.arch;
      if (!["linux", "darwin"].includes(platform) || !["x64", "aarch64"].includes(arch)) throw new Error("Unsupported platform for managed Bun installation.");
      const musl = platform === "linux" && (fs.existsSync("/lib/ld-musl-x86_64.so.1") || fs.existsSync("/lib/ld-musl-aarch64.so.1"));
      const name = "@oven/bun-" + platform + "-" + arch + (musl ? "-musl" : "") + (arch === "x64" ? "-baseline" : "");
      const temp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "openship-bun-toolchain-"));
      const destination = fs.realpathSync(process.execPath), staging = destination + ".openship-" + process.pid;
      try {
        fs.writeFileSync(path.join(temp, "package.json"), "{}");
        if (!run("bun", ["add", "--cwd", temp, "--ignore-scripts", name + "@" + version])) throw new Error("Unable to fetch the selected Bun binary.");
        const binary = path.join(temp, "node_modules", name, "bin", "bun");
        if (versionOf(binary) !== version) throw new Error("Downloaded Bun binary has the wrong version.");
        fs.copyFileSync(binary, staging); fs.chmodSync(staging, 0o755); fs.renameSync(staging, destination);
      } finally { fs.rmSync(temp, { recursive: true, force: true }); fs.rmSync(staging, { force: true }); }
    } else if (!run("npm", ["install", "--global", pin]))
      throw new Error("Unable to install " + pin + ". Use a build image containing this version or an npm installer.");
  }
}
const actual = versionOf(manager);
if (actual !== version) throw new Error("Package-manager verification failed: expected " + manager + "@" + version + ", got " + (actual || "no executable") + ".");
console.log("[openship] Verified package manager: " + manager + "@" + actual);
`;
}

export function managedPackageManagerEnsureCommand(manager: ManagedPackageManager): string {
  const source = shellQuote(packageManagerBootstrapSource(manager).replace(/\n/g, " "));
  const runner =
    manager === "bun"
      ? `(if command -v node >/dev/null 2>&1; then node -e ${source}; else bun -e ${source}; fi)`
      : `node -e ${source}`;
  return `export COREPACK_DEFAULT_TO_LATEST=0 COREPACK_ENABLE_AUTO_PIN=0 && ${runner}`;
}
