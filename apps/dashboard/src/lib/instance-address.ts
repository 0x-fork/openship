import { instanceOrigin } from "@repo/core";

/** Only these local pages may be opened after an explicitly confirmed remote
 * connection. An invitation address is not a generic redirect parameter. */
export function parseInstanceAddress(value: string): { origin: string; nextPath: string } | null {
  if (!/^https?:\/\//i.test(value)) return null;
  const url = new URL(value);
  if (url.username || url.password || url.hash || url.search)
    throw new Error(
      "Use an instance or invitation address without credentials or extra parameters.",
    );
  const invitation = /^\/(?:api\/proxy\/)?accept-invite\/([A-Za-z0-9_-]{1,200})$/.exec(
    url.pathname,
  );
  if (invitation)
    return {
      origin: instanceOrigin(
        url.origin + (url.pathname.startsWith("/api/proxy/") ? "/api/proxy" : ""),
      ),
      nextPath: `/accept-invite/${encodeURIComponent(invitation[1]!)}`,
    };
  return { origin: instanceOrigin(value), nextPath: "/login" };
}
