"use client";

import { NetworkFirewallRules, type NetworkFirewallServer } from "./NetworkFirewallRules";

/** Provider-side UDP access remains an explicit prerequisite of a reviewed plan. */
export function ManagedNetworkTransportNotice({
  failed = false,
  endpoints = [],
  initialServerId,
}: {
  failed?: boolean;
  endpoints?: NetworkFirewallServer[];
  initialServerId?: string;
}) {
  return (
    <NetworkFirewallRules servers={endpoints} initialServerId={initialServerId} failed={failed} />
  );
}
