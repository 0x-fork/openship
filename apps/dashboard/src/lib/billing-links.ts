export interface BillingLinkScope {
  workspaceId?: string | null;
  organizationId?: string | null;
}

/** Keep the chosen subscription and organization through billing navigation. */
export function scopedBillingHref(path: string, { workspaceId, organizationId }: BillingLinkScope = {}) {
  const url = new URL(path, "https://openship.invalid");
  if (workspaceId) url.searchParams.set("workspaceId", workspaceId);
  if (organizationId) url.searchParams.set("organizationId", organizationId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function workspaceBillingHref(path: string, workspaceId?: string | null) {
  return scopedBillingHref(path, { workspaceId });
}
