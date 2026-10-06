import { CloudSupportReceiptSchema, parseInput, type CloudSupportInput } from "@repo/contracts";
import { ApiError } from "./client";
import { getCloudApiOrigin } from "./urls";

/** Use Cloud's existing durable support intake from its dashboard.
 * It is public by design; session cookies and org headers are not needed. */
export async function submitCloudSupport(input: CloudSupportInput, cloudApiUrl?: string) {
  const response = await fetch(`${getCloudApiOrigin(cloudApiUrl)}/api/cloud/support`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify(input),
  });
  const body: unknown = await response.json();
  if (!response.ok) throw new ApiError(response.status, response.statusText, body);
  return parseInput(CloudSupportReceiptSchema, body);
}
