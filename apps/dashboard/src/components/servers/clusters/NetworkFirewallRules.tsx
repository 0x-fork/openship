"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, CircleAlert, Copy, Shield } from "lucide-react";
import {
  INFRASTRUCTURE_PROVIDERS,
  networkFirewallRules,
  networkFirewallTemplate,
  type InfrastructureProviderId,
  type NetworkFirewallMember,
  type NetworkFirewallScope,
} from "@repo/core";
import { BlurIp } from "@/components/BlurIp";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { InfrastructureProviderLogo } from "../InfrastructureProviderLogo";
import { NetworkDiagnosticText } from "./NetworkSetupProgress";

export interface NetworkFirewallServer extends NetworkFirewallMember {
  name: string;
  providerId?: InfrastructureProviderId;
}

/** Also support dashboards served over HTTP, where the Clipboard API is unavailable. */
async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const previous = document.activeElement;
  const field = document.createElement("textarea");
  field.value = value;
  field.readOnly = true;
  field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(field);
  try {
    field.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
  } finally {
    field.remove();
    if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
  }
}

/** One shared rule template for preparation, plan review and connection failures. */
export function NetworkFirewallRules({
  servers,
  initialServerId,
  network = { mode: "wireguard" },
  failed = false,
}: {
  servers: NetworkFirewallServer[];
  initialServerId?: string;
  network?: NetworkFirewallScope;
  failed?: boolean;
}) {
  const { t } = useI18n();
  const m = t.servers.clusters.managed;
  const f = m.firewallRules;
  const native = network.mode === "native";
  const id = useId();
  const [serverId, setServerId] = useState(initialServerId);
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const server = servers.find((item) => item.serverId === serverId) ?? servers[0];
  if (!server) return null;
  const { rules, pendingServerIds } = networkFirewallRules(servers, server.serverId, network);
  const template = networkFirewallTemplate(servers, server.serverId, network);
  // Native verification uses the same addresses and destination port for TCP and UDP.
  const visibleRules = rules.filter(
    (rule) => rule.direction === direction && rule.protocol === "udp" && !rule.reply,
  );
  const localCidr = rules[0]?.destination;

  async function copy(key: string, value: string) {
    setCopyError(false);
    try {
      await copyText(value);
      if (timer.current) clearTimeout(timer.current);
      setCopied(key);
      timer.current = setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
      setCopyError(true);
    }
  }
  function valueCell(value: string, label: string, key: string, address = false) {
    return (
      <span className="inline-flex max-w-full items-center gap-1 @sm/firewall:gap-1.5">
        <span
          className="whitespace-nowrap font-mono text-[11px] text-foreground @sm/firewall:text-xs"
          dir="ltr"
        >
          {address ? <BlurIp>{value}</BlurIp> : value}
        </span>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 @sm/firewall:size-7"
          aria-label={`${f.copy} ${label}`}
          title={copied === key ? f.copied : f.copy}
          onClick={() => void copy(key, value)}
        >
          {copied === key ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </span>
    );
  }

  return (
    <section
      className="@container/firewall min-w-0 space-y-4 rounded-2xl bg-card p-4"
      aria-labelledby={`${id}-title`}
    >
      <div className="-mx-4 -mt-4 rounded-t-2xl bg-warning/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-warning/10 text-warning">
            <Shield className="size-4" aria-hidden="true" />
          </span>
          <h3 id={`${id}-title`} className="text-sm font-semibold">
            {f.title}
          </h3>
          <span className="text-[11px] font-medium text-warning">{f.required}</span>
        </div>
        <p className="mt-2 text-xs font-medium leading-relaxed">{f.requiredHint}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {native ? f.nativeDescription : f.description}
        </p>
      </div>
      {failed && (
        <div role="alert" className="space-y-1 text-xs leading-relaxed">
          <p className="flex items-center gap-2 font-medium text-warning">
            <CircleAlert className="size-4 shrink-0" />
            {m.transportFailedTitle}
          </p>
          <p className="text-muted-foreground">
            {native ? f.nativeFailedHint : m.transportFailedHint}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-48 space-y-1.5">
          <label htmlFor={`${id}-server`} className="text-xs font-medium text-muted-foreground">
            {f.server}
          </label>
          <CustomSelect
            id={`${id}-server`}
            aria-label={f.server}
            value={server.serverId}
            variant="filled"
            onChange={(value) => {
              setServerId(value);
              setCopied(null);
              setCopyError(false);
            }}
            options={servers.map((member) => ({
              value: member.serverId,
              label: member.name,
              description: INFRASTRUCTURE_PROVIDERS.find(
                (provider) => provider.id === member.providerId,
              )?.name,
              icon: <InfrastructureProviderLogo providerId={member.providerId ?? "custom"} />,
            }))}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!template}
          onClick={() => template && void copy("template", template)}
        >
          {copied === "template" ? <Check /> : <Copy />}
          {copied === "template" ? f.copied : f.copyRules}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={f.title}
          className="inline-flex gap-1 rounded-lg bg-muted/40 p-1"
        >
          {(["inbound", "outbound"] as const).map((value) => (
            <button
              key={value}
              id={`${id}-${value}`}
              role="tab"
              type="button"
              aria-selected={direction === value}
              aria-controls={`${id}-rules`}
              tabIndex={direction === value ? 0 : -1}
              onClick={() => setDirection(value)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "inbound"
                    : event.key === "End"
                      ? "outbound"
                      : value === "inbound"
                        ? "outbound"
                        : "inbound";
                setDirection(next);
                document.getElementById(`${id}-${next}`)?.focus();
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${direction === value ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f[value]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {f.allow} · {native ? "TCP / UDP" : "UDP"} · {f.sourcePort}: {f.any}
        </p>
      </div>
      <div role="tabpanel" id={`${id}-rules`} aria-labelledby={`${id}-${direction}`}>
        {localCidr && (
          <div className="mb-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{direction === "inbound" ? f.destination : f.source}:</span>
            {valueCell(
              localCidr,
              direction === "inbound" ? f.destination : f.source,
              `local-${localCidr}`,
              true,
            )}
          </div>
        )}
        {native && (
          <p className="mb-3 text-xs text-muted-foreground">
            {t.servers.clusters.interfaceName}: {server.interfaceName || f.privateInterfaceHint}
          </p>
        )}
        {visibleRules.length > 0 && (
          <table className="w-full table-fixed text-start text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/40">
                <th scope="col" className="pb-2 text-start font-normal">
                  {direction === "inbound" ? f.sourceCidr : f.destinationCidr}
                </th>
                <th scope="col" className="w-20 pb-2 text-end font-normal @sm/firewall:w-32">
                  {f.destinationPort}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {visibleRules.map((rule) => {
                const peer = servers.find((item) => item.serverId === rule.peerServerId)!;
                const cidr = direction === "inbound" ? rule.source : rule.destination;
                return (
                  <tr key={rule.peerServerId}>
                    <td className="py-2 pe-2 @sm/firewall:pe-3">
                      <p className="mb-0.5 break-words text-muted-foreground">
                        <NetworkDiagnosticText value={peer.name} />
                      </p>
                      {valueCell(
                        cidr,
                        direction === "inbound" ? f.sourceCidr : f.destinationCidr,
                        `${rule.peerServerId}-${cidr}`,
                        true,
                      )}
                    </td>
                    <td className="py-2 text-end">
                      {valueCell(
                        String(rule.destinationPort),
                        f.destinationPort,
                        `${rule.peerServerId}-${direction}-port`,
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {pendingServerIds.length > 0 && (
          <p
            role="status"
            className="mt-3 rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
          >
            {f.pending}
          </p>
        )}
      </div>
      {native && (
        <details className="rounded-lg bg-muted/30 p-3 text-xs">
          <summary className="cursor-pointer font-medium">{f.returnTraffic}</summary>
          <p className="mt-2 leading-relaxed text-muted-foreground">{f.nativeReturnHint}</p>
          <dl className="mt-2 grid grid-cols-2 items-center gap-2 text-muted-foreground">
            <dt>{f.sourcePort}</dt>
            <dd>{valueCell(String(network.probePort), f.sourcePort, "reply-port")}</dd>
            <dt>{f.destinationPort}</dt>
            <dd>{f.any}</dd>
          </dl>
        </details>
      )}
      <div className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
        <p>{native ? f.nativeScopeHint : f.scopeHint}</p>
        <p>{native ? f.nativeFirewallHint : m.firewallHint}</p>
      </div>
      <span className="sr-only" role="status">
        {copied ? f.copied : ""}
      </span>
      {copyError && (
        <p role="alert" className="text-xs text-danger">
          {f.copyFailed}
        </p>
      )}
    </section>
  );
}
