"use client";
import Link from "next/link";
import { managementApi } from "@/lib/api/management";
import { useScopedResource } from "@/hooks/use-scoped-resource";
import { Button } from "@/components/ui/button";

/** Shared by the page and inline connection dialog. The API enforces the same
 * allowance under the server inventory lock, including simultaneous connects. */
export function ManagementAccess({
  children,
  serverId,
}: {
  children: React.ReactNode;
  serverId?: string;
}) {
  const { data, loading, error, refresh } = useScopedResource(managementApi.get);
  if (loading)
    return (
      <p role="status" className="p-5 text-muted-foreground">
        Checking your management allowance…
      </p>
    );
  if (error)
    return (
      <div role="alert" className="space-y-3 rounded-2xl bg-card p-5">
        <p>{error}</p>
        <Button variant="secondary" onClick={refresh}>
          Try again
        </Button>
      </div>
    );
  if (!data?.active || (!serverId && data.connectedServers >= data.serverLimit))
    return (
      <div className="space-y-4 rounded-2xl bg-card p-5">
        <h2 className="text-lg font-medium">Manage your own infrastructure</h2>
        <p className="text-sm text-muted-foreground">
          Connect your server to Openship Cloud for deployments, domains, monitoring and backups.
          Apps and data stay on your hardware.
        </p>
        <Button asChild>
          <Link href="/billing/manage">
            {data?.active ? "Add a server allowance" : "View Manage plans"}
          </Link>
        </Button>
      </div>
    );
  return children;
}
