import { DEPLOYMENT_SECRET_FIELDS } from "@repo/db/configuration-secrets";

/** Older lifecycle hooks scrubbed operational config as if it were log text.
 * Its missing credentials cannot be reconstructed from today's mutable rows.
 * New snapshots record that configuration bypassed the scrubber, so deliberate
 * literal markers in newly captured user configuration remain usable. */
export function hasRedactedFrozenConfiguration(meta: unknown): boolean {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const snapshot = meta as Record<string, unknown>;
  if (snapshot.configurationSecretsPreserved === true) return false;
  return DEPLOYMENT_SECRET_FIELDS.some((key) => containsRedaction(snapshot[key]));
}

function containsRedaction(value: unknown): boolean {
  if (typeof value === "string") return value.includes("://***@") || value.trim() === "***";
  if (Array.isArray(value)) return value.some(containsRedaction);
  if (value && typeof value === "object") return Object.values(value).some(containsRedaction);
  return false;
}
