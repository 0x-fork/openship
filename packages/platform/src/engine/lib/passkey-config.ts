/**
 * WebAuthn binds credentials to a relying-party hostname. Prefer the operator's
 * public URL, then the selected runtime target; ports and paths are deliberately
 * ignored because WebAuthn RP IDs are hostnames rather than origins.
 */
export function resolvePasskeyRpId(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:") return url.hostname;
    } catch {
      // Try the next configured URL. Environment validation reports malformed
      // public URLs separately; auth should still have a safe local fallback.
    }
  }
  return "localhost";
}
