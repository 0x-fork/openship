import { getDockerRuntimeProbe, normalizeFramework, STACKS, type StackId } from "./stacks";

export interface RuntimeVerificationResult {
  status: "verified" | "unavailable" | "error";
  /** An observed interpreter, not a security or application-language attestation. */
  runtime: string | null;
  version: string | null;
  checkedAt: string;
  imageRef?: string | null;
  /** Actual daemon image ID, separate from a registry manifest digest. */
  imageId?: string | null;
  reason?: string;
}

export interface RuntimeVerificationMetadata {
  app?: RuntimeVerificationResult;
  services?: Record<string, RuntimeVerificationResult>;
}

const probes = {
  node: {
    binary: "node",
    command: `node -p 'process.versions.bun ? "bun:" + process.versions.bun : "node:" + process.versions.node'`,
  },
  bun: { binary: "bun", command: `bun -e 'console.log("bun:" + Bun.version)'` },
  deno: { binary: "deno", command: `deno eval 'console.log("deno:" + Deno.version.deno)'` },
  python: {
    binary: "python3",
    command: `python3 -c 'import platform; print("python:" + platform.python_version())'`,
  },
  pythonLegacy: {
    binary: "python",
    command: `python -c 'import platform; print("python:" + platform.python_version())'`,
  },
  php: { binary: "php", command: `php -r 'echo "php:" . PHP_VERSION . PHP_EOL;'` },
  ruby: { binary: "ruby", command: `ruby -e 'puts "ruby:" + RUBY_VERSION'` },
  java: {
    binary: "java",
    command: `java -version 2>&1 | awk -F'"' '/version/ { print "java:" $2; exit }'`,
  },
  dotnet: {
    binary: "dotnet",
    command: `dotnet --list-runtimes | awk '$1 == "Microsoft.NETCore.App" { print "dotnet:" $2; exit }'`,
  },
  elixir: { binary: "elixir", command: `elixir -e 'IO.puts("elixir:" <> System.version())'` },
} as const;
type Probe = keyof typeof probes;

function probeCommand(candidates: Probe[]): string {
  return (
    candidates
      .map((candidate) => {
        const probe = probes[candidate];
        // Only fixed catalogue commands enter this shell. Bound output INSIDE the
        // container, before the adapter buffers it; its watchdog bounds execution.
        return `if command -v ${probe.binary} >/dev/null 2>&1; then openship_probe_version="$( (${probe.command}) 2>/dev/null | head -c 128)"; printf 'openship-runtime:%s\\n' "$openship_probe_version"; exit 0; fi`;
      })
      .join("\n") + "\nexit 0"
  );
}

/** Pick fixed probes from existing stack policies; image hints only select a probe. */
export function getRuntimeVersionProbe(input: {
  framework?: string | null;
  packageManager?: string | null;
  imageRef?: string | null;
}): { runtime: string | null; command?: string; reason?: string } {
  const framework = normalizeFramework(input.framework);
  const stack = Object.hasOwn(STACKS, framework) ? STACKS[framework as StackId] : undefined;
  if (stack?.language === "go" || stack?.language === "rust") {
    return {
      runtime: stack.language,
      reason:
        "Compiled application: its build compiler version cannot be measured from the deployed binary.",
    };
  }
  let runtime: Exclude<Probe, "pythonLegacy"> | undefined =
    getDockerRuntimeProbe(framework, input.packageManager ?? undefined) ??
    (stack?.language === "php" ? "php" : undefined);
  // Prebuilt service rows have no framework. These select the binary to ASK;
  // neither the image tag nor a configured runtime version is the observation.
  if (!runtime) {
    const repository = input.imageRef
      ?.split("@")[0]
      ?.replace(/:[^/:]+$/, "")
      .replace(/^(?:docker\.io\/)?library\//, "");
    if (repository === "php" || repository === "wordpress" || repository === "dunglas/frankenphp")
      runtime = "php";
    else if (repository === "node") runtime = "node";
    else if (repository === "oven/bun") runtime = "bun";
    else if (repository === "denoland/deno") runtime = "deno";
    else if (repository === "python") runtime = "python";
    else if (repository === "ruby") runtime = "ruby";
  }
  const candidates: Probe[] = runtime
    ? runtime === "python"
      ? ["python", "pythonLegacy"]
      : [runtime]
    : ["node", "bun", "deno", "python", "pythonLegacy", "php", "ruby", "java", "dotnet", "elixir"];
  return { runtime: runtime ?? null, command: probeCommand(candidates) };
}

/** Store only bounded version tokens; arbitrary process output never becomes metadata. */
export function parseRuntimeVersionProbe(
  output: string,
): { runtime: string; version: string } | null {
  if (output.length > 1024) return null;
  const match =
    /^openship-runtime:(node|bun|deno|python|php|ruby|java|dotnet|elixir):([0-9][0-9A-Za-z.+_-]{0,79})\r?$/m.exec(
      output,
    );
  return match ? { runtime: match[1]!, version: match[2]! } : null;
}
