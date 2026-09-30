import { repos } from "@repo/db";
import type { EdgeProviderOptions } from "@repo/adapters";
import { resolveAcmeProviderOptions } from "./acme-config";
import { isLocalHostRow } from "./box-org";
import { createProvisionLock } from "./provision-lock";

/** One lock per edge, shared by deploys, verification, TLS and server settings.
 * Separate from provisioning: setup may already hold the provisioning lock. */
export function edgeProviderOptions(remoteServerId?: string): EdgeProviderOptions {
  return {
    ...resolveAcmeProviderOptions(),
    configLock: createProvisionLock(
      remoteServerId ? `edge-config:server:${remoteServerId}` : "edge-config:local",
    ),
  };
}

/** Callers with only a server id must resolve the local-host alias too. */
export async function resolveEdgeProviderOptions(serverId?: string): Promise<EdgeProviderOptions> {
  if (!serverId) return edgeProviderOptions();
  const server = await repos.server.get(serverId);
  if (!server) throw new Error(`Server not found: ${serverId}`);
  return edgeProviderOptions((await isLocalHostRow(server)) ? undefined : serverId);
}
