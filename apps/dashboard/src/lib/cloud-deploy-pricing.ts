import { ApiError } from "@/lib/api/client";
import type { BillingState } from "@/lib/api/billing";
import type { CloudAllocation } from "@repo/core";

export interface CloudCapacityRestriction {
  code: "CLOUD_CAPACITY_REQUIRED";
  projectId: string;
  requested?: CloudAllocation;
  reusesWorkspace?: boolean;
}

/** Same public details for synchronous admission and persisted worker errors. */
export function cloudCapacityRestriction(error: unknown): CloudCapacityRestriction | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const body = error.body as { code?: unknown; projectId?: unknown; capacity?: { requested?: CloudAllocation; existing?: CloudAllocation } } | null;
  if (body?.code !== "CLOUD_CAPACITY_REQUIRED" || typeof body.projectId !== "string") return null;
  const request = body.capacity?.requested;
  const requested = request && [request.cpuCores, request.memoryMb, request.diskMb].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)
    ? request : undefined;
  // Only a verified reusable workspace gets delta accounting. Native Cloud
  // replacements need room for their full allocation while the old one runs.
  const existing = body.capacity?.existing;
  const reusesWorkspace = !!existing && [existing.cpuCores, existing.memoryMb, existing.diskMb]
    .every(n => typeof n === "number" && Number.isFinite(n) && n > 0);
  return { code: "CLOUD_CAPACITY_REQUIRED", projectId: body.projectId, requested, reusesWorkspace };
}

export interface CloudDeployRestriction {
  code: "CLOUD_BILLING_BLOCKED" | "PLAN_UPGRADE_REQUIRED";
  reason?: string;
}

/** Only an explicit deployment refusal can open pricing. Provider failures,
 * connectivity errors and ordinary permissions failures keep their own recovery. */
export function cloudDeployRestriction(error: unknown): CloudDeployRestriction | null {
  if (!(error instanceof ApiError) || error.status !== 402) return null;
  const body = error.body as { code?: unknown; reason?: unknown } | null;
  if (body?.code !== "CLOUD_BILLING_BLOCKED" && body?.code !== "PLAN_UPGRADE_REQUIRED") return null;
  return {
    code: body.code,
    ...(typeof body.reason === "string" ? { reason: body.reason } : {}),
  };
}

export type CloudDeployRecovery = "subscribe" | "upgrade" | "credits" | "payment" | "paused" | "ready";

/** A fresh billing snapshot selects the recovery, never authorizes a deployment.
 * The next Deploy still passes every server-side quota and resource check. */
export function cloudDeployRecovery(state: BillingState, restriction: CloudDeployRestriction): CloudDeployRecovery {
  if (state.status === "credit_exhausted" && !state.overQuota) return "paused";
  // A free account can also hit a Cloud subdomain limit while deploying to its
  // own server. Preserve that reason instead of implying local compute is paid.
  if (state.tier === "free") return restriction.code === "PLAN_UPGRADE_REQUIRED" && restriction.reason !== "project-limit" ? "upgrade" : "subscribe";
  if (!["active", "trialing", "credit_exhausted"].includes(state.status)) return "payment";
  if (restriction.code === "PLAN_UPGRADE_REQUIRED") return "upgrade";
  if (state.overQuota) return "credits";
  return "ready";
}
