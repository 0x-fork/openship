"use client";

import { createContext, useContext, type ComponentProps } from "react";
import Link from "next/link";
const BillingWorkspaceContext = createContext<string | undefined>(undefined);
export function BillingWorkspaceProvider({
  workspaceId,
  children,
}: {
  workspaceId?: string;
  children: React.ReactNode;
}) {
  return (
    <BillingWorkspaceContext.Provider key={workspaceId ?? "dedicated"} value={workspaceId}>
      {children}
    </BillingWorkspaceContext.Provider>
  );
}
export function useBillingWorkspace() {
  return useContext(BillingWorkspaceContext);
}
export function workspaceBillingHref(path: string, workspaceId?: string | null) {
  if (!workspaceId) return path;
  const url = new URL(path, "https://openship.invalid");
  url.searchParams.set("workspaceId", workspaceId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Keep navigation inside the subscription the customer is viewing. */
export function BillingLink({ href, ...props }: ComponentProps<typeof Link>) {
  const workspaceId = useBillingWorkspace();
  return (
    <Link
      {...props}
      href={
        typeof href === "string" && href.startsWith("/billing")
          ? workspaceBillingHref(href, workspaceId)
          : href
      }
    />
  );
}
