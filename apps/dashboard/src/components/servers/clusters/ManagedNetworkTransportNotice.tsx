"use client";

import { CircleAlert } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { BlurIp } from "@/components/BlurIp";
import { NetworkDiagnosticText } from "./NetworkSetupProgress";

/** Provider-side UDP access remains an explicit prerequisite of a reviewed plan. */
export function ManagedNetworkTransportNotice({
  failed = false,
  endpoints = [],
}: {
  failed?: boolean;
  endpoints?: { serverId: string; name: string; endpoint: string; listenPort: number }[];
}) {
  const { t } = useI18n();
  const m = t.servers.clusters.managed;
  return (
    <div className="rounded-2xl bg-warning/5 p-4 text-sm" role={failed ? "alert" : "note"}>
      <div className="flex items-center gap-2 font-medium text-warning">
        <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
        <p>{failed ? m.transportFailedTitle : m.transportCheckTitle}</p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {failed ? m.transportFailedHint : m.transportCheckHint}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{m.firewallHint}</p>
      {endpoints.length > 0 && (
        <ul className="mt-3 divide-y divide-border/40">
          {endpoints.map((host) => (
            <li
              key={host.serverId}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-xs"
            >
              <span>
                <NetworkDiagnosticText value={host.name} />
              </span>
              <span className="font-mono" dir="ltr">
                <BlurIp>{host.endpoint}</BlurIp>:{host.listenPort}/UDP
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
