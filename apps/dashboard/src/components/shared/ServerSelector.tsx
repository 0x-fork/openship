"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ServerDetail } from "@repo/contracts";
import { Icon } from "@repo/ui/icons";
import { useI18n } from "@/components/i18n-provider";
import type { ServerInfo } from "@/lib/api/system";
import { useServerDestinations } from "@/hooks/useServerDestinations";
import { useAddServerModal } from "@/components/servers/add-server-modal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Button } from "@/components/ui/button";
import { usePlatform } from "@/context/PlatformContext";

export interface ServerOption {
  id: string;
  name: string;
  host: string;
  user: string;
  port: number;
  raw: ServerInfo;
}
export interface ServerSelectorProps {
  onSelect: (server: ServerOption | null) => void;
  value?: string | null;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
  autoSelectFirst?: boolean;
  excludeIds?: string[];
  emptyHint?: string;
  dockerOnly?: boolean;
  forDeployment?: boolean;
  requiredCapability?: keyof NonNullable<ServerDetail["capabilities"]>;
}

function option(server: ServerDetail | ServerInfo): ServerOption {
  return {
    id: server.id,
    name: server.name || server.sshHost || server.id,
    host: server.sshHost ?? "",
    user: server.sshUser ?? "",
    port: server.sshPort ?? 22,
    raw: { ...server, sshUser: server.sshUser ?? "", sshPort: server.sshPort ?? 22 },
  };
}

/** One picker for connected and managed servers; deployments select serverId. */
export default function ServerSelector({
  onSelect,
  value,
  label,
  disabled = false,
  compact = false,
  autoSelectFirst = false,
  excludeIds,
  emptyHint,
  dockerOnly = false,
  forDeployment = false,
  requiredCapability,
}: ServerSelectorProps) {
  const { t } = useI18n();
  const copy = t.widgets.shared.serverSelector;
  const managedCopy = t.billing.workspaces;
  const { selfHosted } = usePlatform();
  const { data, loading, error, refresh, organizationId } = useServerDestinations();
  const [internalId, setInternalId] = useState<string | null>(null);
  const autoSelected = useRef(false);
  const openAddServer = useAddServerModal();
  const selectedId = value === undefined ? internalId : value;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    autoSelected.current = false;
    setInternalId(null);
  }, [organizationId]);

  const rows = (data?.servers ?? []).filter((server) => {
    if (requiredCapability && !server.capabilities?.[requiredCapability]) return false;
    if (excludeIds?.includes(server.id)) return false;
    if (!server.managed) return true;
    return (
      server.id === selectedId ||
      !forDeployment ||
      server.managed.state !== "deleting"
    );
  });
  const ids = rows.map((row) => row.id).join(",");
  useEffect(() => {
    if (
      disabled ||
      selectedId ||
      (!autoSelectFirst && value === null) ||
      autoSelected.current
    )
      return;
    if (rows.length === 1 || (autoSelectFirst && rows.length > 0)) {
      autoSelected.current = true;
      const selected = option(rows[0]!);
      setInternalId(selected.id);
      onSelectRef.current(selected);
    }
  }, [ids, disabled, selectedId, autoSelectFirst, value, organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  function addServer() {
    openAddServer((server) => {
      autoSelected.current = true;
      setInternalId(server.id);
      onSelectRef.current(option(server));
      refresh();
    });
  }
  const describe = (server: ServerDetail) =>
    server.managed
      ? managedCopy.poolHint
      : server.isLocal
        ? t.servers.list.currentHost
        : `${server.sshUser ?? "root"}@${server.sshHost}:${server.sshPort ?? 22}`;
  const options = [
    ...rows.map((server) => ({
      value: server.id,
      label: server.name || server.sshHost || server.id,
      description: describe(server),
    })),
  ];
  const effective = selectedId ?? "";
  const automaticCloud =
    !selfHosted && forDeployment && data?.servers.length === 0 && !selectedId;
  const select = (id: string) => {
    autoSelected.current = true;
    setInternalId(id);
    const server = rows.find((row) => row.id === id);
    onSelectRef.current(server ? option(server) : null);
  };
  return (
    <div className={compact ? "space-y-2" : "mb-5 space-y-2"}>
      {!compact && (
        <label className="block text-sm font-medium text-foreground">
          {label ?? copy.serverLabel}
        </label>
      )}
      {loading ? (
        <div
          aria-busy="true"
          aria-label={copy.loadingServers}
          className="h-16 animate-pulse rounded-xl bg-muted/50"
        />
      ) : error ? (
        <div role="alert" className="space-y-2 text-sm text-danger">
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={refresh}>
            {t.billing.plansRoute.tryAgain}
          </Button>
        </div>
      ) : automaticCloud ? (
        <div className="rounded-xl bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium">{t.deploy.targetStep.options.cloud}</p>
          <p className="mt-1 text-xs text-muted-foreground">{managedCopy.defaultHint}</p>
        </div>
      ) : options.length > 0 ? (
        <>
          {options.length === 1 && effective === options[0]!.value ? (
            <div className="rounded-xl bg-muted/30 px-4 py-3">
              <p className="text-sm font-medium">{options[0]!.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{options[0]!.description}</p>
            </div>
          ) : (
            <CustomSelect
              aria-label={label ?? copy.serverLabel}
              value={effective}
              options={options}
              disabled={disabled}
              placeholder={copy.selectServer}
              variant="filled"
              triggerClassName="bg-muted/60 hover:bg-muted"
              onChange={select}
            />
          )}
          {!disabled &&
            (selfHosted ? (
              <Button type="button" variant="ghost" size="sm" onClick={addServer}>
                <Icon name="plus" className="size-3.5" aria-hidden />
                {copy.addNewServer}
              </Button>
            ) : (
              <Link
                href="/servers"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-xs text-muted-foreground hover:text-foreground"
              >
                {managedCopy.manage}
              </Link>
            ))}
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/30 p-4">
          <p className="min-w-0 text-sm text-muted-foreground">
            {emptyHint ?? (selfHosted ? copy.noServerConnected : managedCopy.noneAvailable)}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={addServer}
          >
            <Icon name="plus" className="size-3.5" aria-hidden />
            {copy.addServer}
          </Button>
        </div>
      )}
    </div>
  );
}
