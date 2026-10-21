import {
  getRuntimeVersionProbe,
  parseRuntimeVersionProbe,
  validateImageReference,
  withTimeout,
  type RuntimeVerificationResult,
} from "@repo/core";
import { reportCaughtError as observeCaughtError } from "@repo/core/diagnostics";
import type { RuntimeAdapter } from "@repo/adapters";
import { repos } from "@repo/db";
import { mapWithLimit } from "../../lib/map-with-limit";
import { resolveSubAppRecipe, serviceKind } from "../../lib/deployable-service";
import type { BuildConfigSnapshotLike } from "./build-config";
import type { ComposeDeployResult } from "./compose/deploy.service";

const PROBE_TIMEOUT_MS = 3_000;
const OBSERVATION_TIMEOUT_MS = 6_000;
const COHORT_TIMEOUT_MS = 10_000;
type ProbeRuntime = Pick<RuntimeAdapter, "supports" | "inContainerExecutor" | "getContainerInfo">;

/** Advisory observation after activation; a missing interpreter never fails a deploy. */
export async function verifyDeployedRuntime(opts: {
  runtime: ProbeRuntime;
  containerId?: string;
  framework?: string | null;
  packageManager?: string | null;
  imageRef?: string | null;
  staticFiles?: boolean;
  label?: string;
  log(message: string): void;
}): Promise<RuntimeVerificationResult> {
  const policy = getRuntimeVersionProbe(opts);
  const base: RuntimeVerificationResult = {
    status: "unavailable",
    runtime: policy.runtime,
    version: null,
    checkedAt: new Date().toISOString(),
    imageRef:
      opts.imageRef && opts.imageRef.length <= 512 && !validateImageReference(opts.imageRef)
        ? opts.imageRef
        : null,
  };
  let result: RuntimeVerificationResult;
  try {
    result = await withTimeout(
      (async (): Promise<RuntimeVerificationResult> => {
        if (opts.staticFiles || !opts.containerId)
          return {
            ...base,
            reason: "Static files have no running application interpreter to inspect.",
          };
        if (opts.runtime.supports("containerInfo")) {
          try {
            const info = await withTimeout(
              opts.runtime.getContainerInfo(opts.containerId),
              1_500,
              "Image inspection timed out",
            );
            if (info.imageId && /^sha256:[a-f0-9]{64}$/.test(info.imageId))
              base.imageId = info.imageId;
          } catch (error) {
            observeCaughtError(error, "platform/engine/modules/deployments/runtime-verification");
          }
        }
        if (!policy.command) return { ...base, reason: policy.reason };
        if (
          !opts.runtime.supports("isolatedExec") ||
          !opts.runtime.supports("inContainerExec") ||
          !opts.runtime.inContainerExecutor
        ) {
          return {
            ...base,
            reason: "This runtime cannot inspect an interpreter inside the deployed container.",
          };
        }
        const executor = await withTimeout(
          opts.runtime.inContainerExecutor(opts.containerId),
          1_500,
          "Container inspection timed out",
        );
        const output = await withTimeout(
          executor.exec(policy.command, { timeout: PROBE_TIMEOUT_MS }),
          PROBE_TIMEOUT_MS + 500,
          "Runtime observation timed out",
        );
        const observed = parseRuntimeVersionProbe(output);
        return observed
          ? { ...base, ...observed, status: "verified" }
          : {
              ...base,
              reason:
                "No supported interpreter version could be observed in the deployed container.",
            };
      })(),
      OBSERVATION_TIMEOUT_MS,
      "Runtime observation timed out",
    );
  } catch (error) {
    observeCaughtError(error, "platform/engine/modules/deployments/runtime-verification");
    result = {
      ...base,
      status: "error",
      reason: "Runtime observation was unavailable; the deployment outcome is unchanged.",
    };
  }
  try {
    const identity = result.imageId
      ? `image ID ${result.imageId}`
      : result.imageRef
        ? `image reference ${result.imageRef}`
        : "image identity unavailable";
    opts.log(
      `${opts.label ? `${opts.label}: ` : ""}Runtime observation: ${result.status === "verified" ? `${result.runtime} ${result.version}` : result.reason}. ${identity}.\n`,
    );
  } catch (error) {
    observeCaughtError(error, "platform/engine/modules/deployments/runtime-verification");
  }
  return result;
}

/** Observe only containers/static artifacts activated by this service deployment. */
export async function verifyDeployedServiceRuntimes(opts: {
  runtime: ProbeRuntime;
  projectId: string;
  services: ComposeDeployResult["services"];
  snapshot: BuildConfigSnapshotLike;
  imageRefs: ReadonlyMap<string, string>;
  log(message: string): void;
}): Promise<Record<string, RuntimeVerificationResult>> {
  const deadline = performance.now() + COHORT_TIMEOUT_MS;
  try {
    const rows = await withTimeout(
      repos.service.listByProject(opts.projectId),
      1_500,
      "Service observation lookup timed out",
    );
    const deployed = opts.services.filter(
      (service) =>
        !service.carried &&
        service.status !== "failed" &&
        service.status !== "failure" &&
        (service.containerId || service.staticRoot),
    );
    const results = await mapWithLimit(deployed, 2, async (deployed) => {
      const service = rows.find((row) => row.id === deployed.serviceId);
      const recipe =
        service && serviceKind(service) === "monorepo"
          ? resolveSubAppRecipe(service, opts.snapshot)
          : undefined;
      if (deadline - performance.now() < OBSERVATION_TIMEOUT_MS) {
        // A large cohort must not add six seconds for every pair of services.
        // Reserve a full probe window before starting; queued work stays unknown.
        return [
          deployed.serviceId,
          {
            status: "unavailable",
            runtime: null,
            version: null,
            checkedAt: new Date().toISOString(),
            reason:
              "Runtime observation deferred because this deployment's observation time budget was exhausted.",
          } satisfies RuntimeVerificationResult,
        ] as const;
      }
      return [
        deployed.serviceId,
        await verifyDeployedRuntime({
          runtime: opts.runtime,
          containerId: deployed.containerId,
          framework: recipe?.framework ?? service?.framework,
          packageManager: service?.packageManager ?? opts.snapshot.packageManager,
          imageRef: opts.imageRefs.get(deployed.serviceId) ?? service?.image,
          staticFiles: !!deployed.staticRoot,
          label: deployed.serviceName,
          log: opts.log,
        }),
      ] as const;
    });
    return Object.fromEntries(results);
  } catch (error) {
    observeCaughtError(error, "platform/engine/modules/deployments/runtime-verification");
    return {};
  }
}
