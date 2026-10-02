"use client";

import { Icon as UiIcon } from "@repo/ui/icons";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  resolveTierResources,
} from "@repo/core";
import { Button } from "@/components/ui/button";
import { useDeployment } from "@/context/DeploymentContext";
import { usesServiceDeployment, workloadOf } from "@/context/deployment/types";
import { useCloud } from "@/context/CloudContext";
import { ServerSelectorView, type ServerSelection } from "@/components/shared/ServerSelector";
import { ServerPicker } from "@/components/shared/ServerPicker";
import { ResourceTierPicker, useResourceTierLabels } from "@/components/deploy/ResourceTierPicker";
import { usePlatform } from "@/context/PlatformContext";
import { systemApi } from "@/lib/api/system";
import { settingsApi, type DefaultDeployTarget } from "@/lib/api/settings";
import type { ServerInfo } from "@/lib/api/system";
import { useToast } from "@/context/ToastContext";
import type { DeployTarget, BuildStrategy, CloneStrategy, RuntimeMode, CloudResourceTier } from "@/context/deployment/types";
import { createPersistedValue } from "@/lib/persisted-value";
import { DESKTOP_LOCAL_DEPLOY_ENABLED } from "@/hooks/useLocalDeployGate";
import { useAddServerModal } from "@/components/servers/add-server-modal";
import ServerRuntimePicker from "./ServerRuntimePicker";
import { RollbackBackupPanel } from "./RollbackBackupPanel";
import { useI18n, interpolate } from "@/components/i18n-provider";

// ─── Option card ─────────────────────────────────────────────────────────────

interface OptionCardProps {
  value: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  /** Optional children rendered below when selected */
  children?: React.ReactNode;
  /** Extra classes for the outer wrapper - e.g. `h-full` for equal-height grids. */
  className?: string;
}

export const OptionCard: React.FC<OptionCardProps> = ({
  selected,
  disabled = false,
  onSelect,
  icon,
  label,
  description,
  children,
  className,
}) => (
  <div className={className}>
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`
        relative w-full h-full text-start p-4 rounded-xl border transition-all
        ${selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border/50 bg-card hover:border-primary/30 hover:bg-primary/[0.02]"
        }
        ${selected && children ? "rounded-b-none border-b-0" : ""}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${selected ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${selected ? "text-foreground" : "text-foreground/80"}`}>
            {label}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {description}
          </p>
        </div>
        {selected && (
          <div className="size-5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
            <div className="size-2 rounded-full bg-primary-foreground" />
          </div>
        )}
      </div>
    </button>
    {selected && children && (
      <div className="border border-t-0 border-primary/20 bg-primary/[0.02] rounded-b-xl px-4 pb-4 pt-2">
        {children}
      </div>
    )}
  </div>
);

// ─── Compact summary (shown when editing from step 2) ────────────────────────

interface CompactSummaryProps {
  deployTarget: DeployTarget;
  buildStrategy: BuildStrategy;
  serverName?: string | null;
  showBuildStrategy?: boolean;
  /** When deployTarget is "cloud", the chosen resource tier — rendered
   *  as a small chip on the right of the summary so the operator sees
   *  their power pick at a glance without re-opening the picker. */
  cloudResourceTier?: CloudResourceTier;
  /** False when the project deploys as static files (no Start command,
   *  no long-running process). For cloud deploys this swaps the power
   *  tier chip for a "Static" chip — there's no machine to size when
   *  the workload is just files served from the edge. */
  hasServer?: boolean;
  /** Runtime isolation shown in the configuration summary and settings preview. */
  runtimeMode?: RuntimeMode;
  /** True when the project deploys as a multi-service stack (compose). A stack
   *  runs sandboxed containers — never static edge-served files — so it must
   *  never show the Static chip even when the project-level hasServer/framework
   *  is unset (those live per-service). */
  isServices?: boolean;
  /** Null/undefined retention inherits the instance default. */
  rollbackWindow?: number | null;
  rollbackStrategy?: "git" | "snapshot";
  onEdit?: () => void;
  variant?: "inline" | "preview";
}

export const DeployTargetSummary: React.FC<CompactSummaryProps> = ({
  deployTarget,
  buildStrategy,
  serverName,
  showBuildStrategy = true,
  cloudResourceTier,
  hasServer = true,
  runtimeMode,
  isServices = false,
  rollbackWindow,
  rollbackStrategy,
  onEdit,
  variant = "inline",
}) => {
  const { t } = useI18n();
  const targetLabels: Record<DeployTarget, { label: string; icon: React.ReactNode }> = {
    local: { label: t.deploy.summary.targetLocal, icon: <UiIcon name="cpu" className="size-4" /> },
    server: { label: t.deploy.summary.targetServer, icon: <UiIcon name="server" className="size-4" /> },
    cloud: { label: t.deploy.summary.targetCloud, icon: <UiIcon name="cloud" className="size-4" /> },
    cluster: { label: "Server cluster", icon: <UiIcon name="cluster" className="size-4" /> },
  };
  const buildLabels: Record<BuildStrategy, { label: string; icon: React.ReactNode }> = {
    local: { label: t.deploy.summary.buildLocal, icon: <UiIcon name="cpu" className="size-4" /> },
    server: { label: t.deploy.summary.buildRemote, icon: <UiIcon name="cloud" className="size-4" /> },
  };
  const tierLabels = useResourceTierLabels();
  const target = targetLabels[deployTarget];
  // Build label is driven by buildStrategy FIRST — a "local" build always runs
  // on this machine, even when the deploy target is Openship Cloud
  // (local-orchestrated cloud: build here, upload the output to the cloud
  // workspace). Only a SERVER build inherits the target's name ("Openship
  // Cloud" when the workspace builds it, else the generic remote label).
  const build =
    buildStrategy === "local"
      ? buildLabels.local
      : deployTarget === "cloud"
        ? { label: t.deploy.summary.targetCloud, icon: <UiIcon name="cloud" className="size-4" /> }
        : buildLabels.server;
  const deployLabel = (deployTarget === "server" || deployTarget === "cloud") && serverName
    ? serverName
    : target.label;

  // Build "destination" derived from (deployTarget, buildStrategy):
  //   - buildStrategy === "local" → local machine
  //   - buildStrategy === "server" → runs ON the deploy target
  // Same destination → collapse Build + Deploy into a single chip with
  // the two icons stacked + a `+` between them, instead of two
  // sections separated by an arrow. Most users have matching targets
  // (cloud-on-cloud, server-on-server), so this is the common case.
  const buildDest = buildStrategy === "local" ? "local" : deployTarget;
  const sameDestination = showBuildStrategy && buildDest === deployTarget;

  // Right-hand chip on the summary — one at a time, by workload shape:
  //   - Static (files served from the edge, any target): neutral info chip.
  //     No machine to size, no process to sandbox.
  //   - Cloud + server: the picked resource tier (Zap).
  //   - Self-hosted server: the runtime — "bare" carries a persistent WARNING
  //     (runs directly on the host, unsandboxed) so it's visible even when the
  //     user reads only the summary; "docker" a neutral Sandboxed chip.
  const runtimeChip = isServices ? (
    // A service stack (compose) always runs sandboxed containers — never static
    // edge-served files — regardless of the project-level hasServer/framework
    // (which are unset for compose). Show the tier on cloud, else Sandboxed.
    deployTarget === "cloud" && cloudResourceTier ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0">
        <UiIcon name="bolt" className="size-4" />
        <span>{tierLabels.name(cloudResourceTier)}</span>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0">
        <UiIcon name="shield-check" className="size-4" />
        {t.deploy.summary.runtimeSandboxed}
      </span>
    )
  ) : !hasServer ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0">
      <UiIcon name="globe" className="size-4" />
      {t.deploy.summary.runtimeStatic}
    </span>
  ) : deployTarget === "cloud" && runtimeMode !== "bare" ? (
    cloudResourceTier ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0">
        <UiIcon name="bolt" className="size-4" />
        <span>{tierLabels.name(cloudResourceTier)}</span>
      </span>
    ) : null
  ) : (deployTarget === "server" || deployTarget === "cloud") && runtimeMode === "bare" ? (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium text-warning shrink-0"
      title={t.deploy.summary.runtimeDirectHint}
    >
      <UiIcon name="shield-alert" className="size-4" />
      {t.deploy.summary.runtimeDirectWarning}
    </span>
  ) : (deployTarget === "server" || deployTarget === "cloud") && runtimeMode === "docker" ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0">
      <UiIcon name="shield-check" className="size-4" />
      {t.deploy.summary.runtimeSandboxed}
    </span>
  ) : null;

  // Keep retention visible in both the inline summary and settings preview.
  const rollbackChip = (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0"
      title={
        rollbackStrategy === "snapshot"
          ? t.deploy.summary.rollbackSnapshotHint
          : t.deploy.summary.rollbackGitHint
      }
    >
      <UiIcon name="rotate-left" className="size-4" />
      {rollbackWindow == null
        ? t.deploy.summary.rollbackAuto
        : interpolate(
            rollbackWindow === 1
              ? t.deploy.summary.rollbackOne
              : t.deploy.summary.rollbackOther,
            { count: String(rollbackWindow) },
          )}
    </span>
  );

  if (variant === "preview") {
    const containerLimits = deployTarget === "cloud" && (isServices || runtimeMode !== "bare");
    const runtimeLabel = !hasServer && !isServices
      ? t.deploy.summary.static
      : isServices || runtimeMode !== "bare"
        ? t.deploy.runtime.sandboxedLabel
        : t.deploy.runtime.directLabel;
    return (
      <div className="space-y-4">
        <dl className="space-y-3">
          <div>
            <dt className="text-xs text-muted-foreground">{sameDestination ? t.deploy.summary.buildAndDeploy : t.billing.workspaces.destination}</dt>
            <dd className="mt-1 break-words text-sm font-medium text-foreground">{deployLabel}</dd>
          </div>
          {showBuildStrategy && !sameDestination && (
            <div>
              <dt className="text-xs text-muted-foreground">{t.deploy.summary.build}</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{build.label}</dd>
            </div>
          )}
        </dl>
        <div className="space-y-3 rounded-xl bg-muted/40 p-3.5">
          <dl className="space-y-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">{t.deploy.runtime.heading}</dt>
              <dd className="font-medium text-foreground">{runtimeLabel}</dd>
            </div>
            {containerLimits && cloudResourceTier && (
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted-foreground">{t.projectSettings.resources.title}</dt>
                <dd className="font-medium text-foreground">{tierLabels.name(cloudResourceTier)}</dd>
              </div>
            )}
          </dl>
          {rollbackChip}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full flex items-center gap-3 px-4 py-3 bg-card rounded-xl border border-border/50 hover:border-primary/30 transition-all group text-start"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-3 grow basis-64 min-w-0">
          {sameDestination ? (
            // Merged view — single line, two icons with a + between to
            // signal "both build and deploy go here", followed by one
            // label. Saves horizontal space vs the two-section layout.
            <div className="flex items-center gap-2 text-xs min-w-0">
              <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                {build.icon}
                <UiIcon name="plus" className="size-3" />
                {target.icon}
              </div>
              <span className="text-muted-foreground shrink-0">{t.deploy.summary.buildAndDeploy}</span>
              <span className="font-medium text-foreground truncate" title={deployLabel}>{deployLabel}</span>
            </div>
          ) : (
            <>
              {showBuildStrategy && (
                <>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    {build.icon}
                    <span className="text-muted-foreground">{t.deploy.summary.build}</span>
                    <span className="font-medium text-foreground">{build.label}</span>
                  </div>
                  <UiIcon name="arrow-right" className="size-3.5 text-muted-foreground/50 shrink-0 rtl:rotate-180" />
                </>
              )}
              <div className="flex items-center gap-2 text-xs min-w-0">
                {target.icon}
                <span className="text-muted-foreground shrink-0">{t.deploy.summary.deploy}</span>
                <span className="font-medium text-foreground truncate" title={deployLabel}>{deployLabel}</span>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {runtimeChip}
          {rollbackChip}
        </div>
      </div>
      <UiIcon name="edit" className="size-4 shrink-0 text-muted-foreground transition-opacity" />
    </button>
  );
};

// ─── Hook: resolve available targets ─────────────────────────────────────────

export interface ResolvedTargets {
  ready: boolean;
  /** All configured servers */
  servers: ServerInfo[];
  hasCloudConnected: boolean;
  hasCloudOption: boolean;
  /** True when there's a real choice to make */
  hasChoice: boolean;
  /** Refetch the server list - used after the add-server modal saves one */
  refreshServers: () => void;
}

export function useDesktopTargets(): ResolvedTargets {
  const cloud = useCloud();
  const { selfHosted } = usePlatform();
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [serversReady, setServersReady] = useState(false);

  // Fetch servers + filter to ones that can run apps. Exposed so the picker
  // can re-pull after the user adds a new server in another tab.
  const fetchServers = useCallback(() => {
    if (!selfHosted) {
      setServersReady(true);
      return () => {};
    }

    let cancelled = false;
    systemApi.listServers()
      .then((list) => { if (!cancelled) setServers(list); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setServersReady(true); });
    return () => { cancelled = true; };
  }, [selfHosted]);

  useEffect(() => {
    const cleanup = fetchServers();
    return cleanup;
  }, [fetchServers]);

  // Refresh when the tab regains focus - covers the "added a server in a new
  // tab" flow without forcing the user to reload the deploy page.
  useEffect(() => {
    if (!selfHosted) return;
    const onFocus = () => { fetchServers(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [selfHosted, fetchServers]);

  const hasServers = servers.length > 0;
  const hasCloudConnected = cloud.connected;
  const hasCloudOption = true;
  const ready = serversReady && !cloud.loading;

  return {
    ready,
    servers,
    hasCloudConnected,
    hasCloudOption,
    hasChoice: ready && Number(hasServers) + Number(hasCloudOption) > 1,
    refreshServers: fetchServers,
  };
}

// ─── Soft "last pick" memory ─────────────────────────────────────────────────
// Remembers the most recent deploy choice across deployments without the user
// having to opt in via "Save as default". Distinct from the settings-API
// default, which is the explicit, cross-device "always use this" setting:
// localStorage here is the soft, per-browser "what did I pick last time".
//
// Priority on seed: settings-API default > localStorage > auto-select fallback.

export type LastPick = {
  /** A pickable target only — the same two this step renders. Never "local":
   *  that one is derived from the absence of a binding, and this step has no card
   *  for it, so remembering it would select a target the UI can't show. A legacy
   *  stored "local" fails validation below and falls through to the auto-pick,
   *  which lands on this box's own server row (with its real address). */
  target: Exclude<DeployTarget, "local">;
  serverId?: string | null;
};

export const lastPickStore = createPersistedValue<LastPick>(
  "openship.deploy-last-pick",
  (raw): raw is LastPick => {
    if (!raw || typeof raw !== "object") return false;
    const obj = raw as { target?: unknown; serverId?: unknown };
    if (obj.target !== "server" && obj.target !== "cloud") return false;
    if (obj.serverId !== undefined && obj.serverId !== null && typeof obj.serverId !== "string") return false;
    return true;
  },
);

// ─── Silent target seeding (used on the config view) ─────────────────────────

/**
 * Resolve the deploy target and write it to config ONCE, as soon as the target
 * list is ready — no UI. Priority mirrors the interactive step: explicit
 * settings-API default > soft localStorage last-pick > a server (prefer the
 * local host) > cloud.
 *
 * The config wizard calls this so it can land DIRECTLY on the config step with
 * the right target already in the DeployTargetSummary bar, instead of mounting
 * the full DeployTargetStep just to auto-pick a default and bounce back — that
 * async "spin then advance" was the visible flash on entry. The summary bar is
 * the affordance to change the pick (onEdit → the full step).
 *
 * `enabled` is false for an existing project that HAS a saved target: that one
 * hydrates from initializeFromProject and must never be overwritten by the global
 * default. It stays TRUE for a saved project with no target yet — bound to nothing
 * and never deployed — because there is nothing to preserve there, and leaving it off
 * is what let DEFAULT_CONFIG's "cloud" reach the deploy payload. The caller resolves
 * which case it is from the hydration result, not from the fact that it loaded a
 * project; see the `savedTargetState` gate in the deploy page.
 */
export function useSeedDeployTarget(targets: ResolvedTargets, enabled: boolean): void {
  const { updateConfig } = useDeployment();
  const { deployMode } = usePlatform();
  // Stable for the session (deployMode comes from the platform context), so the
  // one-shot effect below can read it without widening its tight dep array.
  const localDeployBlocked = deployMode === "desktop" && !DESKTOP_LOCAL_DEPLOY_ENABLED;
  const appliedRef = useRef(false);
  useEffect(() => {
    if (!enabled || !targets.ready || appliedRef.current) return;
    let cancelled = false;
    const seed = (
      def?: {
        defaultDeployTarget?: DefaultDeployTarget | null;
        defaultServerId?: string | null;
      } | null,
    ) => {
      if (cancelled || appliedRef.current) return;
      appliedRef.current = true;
      const target = def?.defaultDeployTarget ?? null;
      const savedServerId = def?.defaultServerId ?? null;
      // 1. Explicit settings-API default.
      if (target === "server" && savedServerId && targets.servers.some((s) => s.id === savedServerId)) {
        updateConfig({ deployTarget: "server", serverId: savedServerId });
        return;
      }
      if (target === "cloud") {
        updateConfig({ deployTarget: "cloud", serverId: undefined, buildStrategy: "server" });
        return;
      }
      // 2. Soft last-pick, validated against the current target list.
      const last = lastPickStore.read();
      if (last?.target === "server" && last.serverId && targets.servers.some((s) => s.id === last.serverId)) {
        updateConfig({ deployTarget: "server", serverId: last.serverId });
        return;
      }
      if (last?.target === "cloud") {
        updateConfig({ deployTarget: "cloud", serverId: undefined, buildStrategy: "server" });
        return;
      }
      // 3. A server exists → deploy to it (prefer the local host); else cloud.
      // TODO: temporary desktop gate — while running on this machine is disabled,
      // prefer a REMOTE server so a desktop user isn't silently defaulted onto a
      // destination the Deploy button will refuse. Falls back to the old pick when
      // the local host is the only server (the gate then explains it on click).
      if (targets.servers.length > 0) {
        const preferred = localDeployBlocked
          ? (targets.servers.find((s) => !s.isLocal) ?? targets.servers[0])
          : (targets.servers.find((s) => s.isLocal) ?? targets.servers[0]);
        updateConfig({ deployTarget: "server", serverId: preferred.id });
        return;
      }
      updateConfig({ deployTarget: "cloud", serverId: undefined, buildStrategy: "server" });
    };
    settingsApi.get().then((res) => seed(res)).catch(() => seed(null));
    return () => { cancelled = true; };
    // One-shot seed keyed off readiness; tight dep array on purpose (matches the
    // interactive step's seed effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, targets.ready]);
}

// ─── Main step ───────────────────────────────────────────────────────────────

interface DeployTargetStepProps {
  /** Existing project whose rollback and backup settings can be edited. */
  projectId?: string | null;
  targets: ResolvedTargets;
  serverSelection: ServerSelection;
  onContinue: () => void;
  onBack: () => void;
  /**
   * When true (the default), the step auto-advances to the next step if a
   * saved default applies cleanly - the user never sees this screen. Set to
   * false by the parent when the user explicitly navigated back here via
   * the edit affordance, so we don't bounce them straight back out.
   */
  autoSkipAllowed?: boolean;
}

const DeployTargetStep: React.FC<DeployTargetStepProps> = ({ targets, serverSelection, onContinue, onBack, autoSkipAllowed = true, projectId }) => {
  const { config, updateConfig } = useDeployment();
  const { requireCloud } = useCloud();
  const { selfHosted, deployMode } = usePlatform();
  const destinationReady = selfHosted || serverSelection.ready;
  // Git credential forwarding is desktop-only — the relay forwards the
  // operator's machine-local `gh`, which only exists on a desktop host.
  const isDesktop = deployMode === "desktop";
  const { showToast } = useToast();
  const { t } = useI18n();
  const ts = t.deploy.targetStep;
  const { ready, servers, hasCloudConnected, hasCloudOption, hasChoice, refreshServers } = targets;
  const hasServers = servers.length > 0;
  const isSingleServer = servers.length === 1;
  // "Save as my default for every deployment" - persists the picked target
  // (+ server id when applicable) to user_settings on continue.
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  // A saved default can skip this step on first entry; explicitly opening
  // destination settings always presents the full page.
  const [defaultApplied, setDefaultApplied] = useState(false);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  // True once the user has EXPLICITLY picked a build location from the picker.
  // The auto-match effects below (first-deploy match, cloud-switch default)
  // must never overwrite an explicit choice — otherwise "Build on this machine"
  // silently snaps back to the cloud default. Reset when the deploy target
  // changes so the sensible default applies to the new target.
  const buildStrategyTouchedRef = useRef(false);
  // Seed fresh server applications before rendering the runtime picker.
  const runtimeDefaultedRef = useRef(false);

  // Add server inline via modal. On create, refresh the server list and
  // auto-select the new one so the user lands on it immediately - no extra
  // clicks, no tab juggling, deploy config stays intact.
  const addServerModal = useAddServerModal();
  const openAddServer = () => {
    addServerModal((server) => {
      refreshServers();
      updateConfig({ deployTarget: "server", serverId: server.id });
    });
  };
  const isServiceDeployment = usesServiceDeployment(config);
  const showBuildStrategy =
    config.projectType === "app" || (config.projectType === "services" && !isServiceDeployment);

  // UNIFIED BUILD — build where you deploy, as the PERSISTENT default (every
  // untouched deploy, not just the first). A SERVER target builds on that server
  // (desktop → remote build + clone-on-server via git-credential forwarding;
  // VPS → the isLocal "This Server", i.e. build on this machine), and cloud
  // builds in the cloud runtime. Only the bare "local" target builds locally (it
  // IS the host, so buildStrategy is inert there). A server deploy that lacks a
  // clone credential still auto-downgrades to a local build at deploy time
  // (Sidebar.handleDeploy), so this never hard-fails a credential-less box. An
  // explicit pick in the build controls (buildStrategyTouchedRef) wins.
  useEffect(() => {
    if (buildStrategyTouchedRef.current) return;
    const want: BuildStrategy = config.deployTarget === "local" ? "local" : "server";
    if (config.buildStrategy !== want) {
      updateConfig({ buildStrategy: want });
    }
  }, [config.deployTarget, config.buildStrategy, updateConfig]);

  // Sandbox (docker) is the default for a fresh self-hosted server APP. Seeded
  // once, and only when the runtime choice actually applies (server app, not
  // docker/compose/static) — never clobbers a saved project value or a choice
  // the user makes in the runtime controls.
  useEffect(() => {
    if (config.projectId || runtimeDefaultedRef.current) return;
    if (config.deployTarget !== "server") return;
    if (workloadOf(config.options) === "static" || config.projectType === "docker" || isServiceDeployment) return;
    runtimeDefaultedRef.current = true;
    if (config.runtimeMode !== "docker") updateConfig({ runtimeMode: "docker" });
  }, [
    config.projectId,
    config.deployTarget,
    config.options.hasServer,
    config.options.workloadType,
    config.projectType,
    isServiceDeployment,
    config.runtimeMode,
    updateConfig,
  ]);

  // Seed the picker from the user's saved default (if any). The ref makes
  // sure we only ever APPLY the default once - even under StrictMode's
  // double-mount in dev - so we never clobber a choice the user made after
  // the initial seed. The fetch itself is allowed to re-run; only the
  // current invocation's `cancelled` flag gates state updates.
  const appliedDefaultRef = useRef(false);
  useEffect(() => {
    if (!ready) return;
    // Existing project: its saved target is authoritative (hydrated from
    // initializeFromProject). Don't seed a default over it — just mark the
    // fetch "done" so the picker renders the current config instead of a
    // perpetual spinner. (The parent seeds NEW deploys via useSeedDeployTarget;
    // this step now only mounts when the user opens the picker via the summary
    // bar, so seeding here would fight the user's own reason for opening it.)
    if (!selfHosted || config.projectId) {
      setDefaultsLoaded(true);
      return;
    }

    let cancelled = false;
    settingsApi.get()
      .then((res) => {
        if (cancelled) return;
        if (appliedDefaultRef.current) return; // already seeded - don't overwrite
        appliedDefaultRef.current = true;

        const target = res?.defaultDeployTarget;
        const savedServerId = res?.defaultServerId;
        let applied = false;
        if (target === "server") {
          if (savedServerId && servers.some((s) => s.id === savedServerId)) {
            updateConfig({ deployTarget: "server", serverId: savedServerId });
            applied = true;
          }
        } else if (target === "cloud") {
          updateConfig({ deployTarget: "cloud", serverId: undefined, buildStrategy: "server" });
          applied = true;
        }

        // No explicit settings-API default? Try the soft "last pick"
        // memory from localStorage. Validate against current state - if the
        // remembered server has since been deleted, fall through.
        if (!applied) {
          const last = lastPickStore.read();
          if (last) {
            if (last.target === "server") {
              if (last.serverId && servers.some((s) => s.id === last.serverId)) {
                updateConfig({ deployTarget: "server", serverId: last.serverId });
                applied = true;
              }
            } else if (last.target === "cloud" && hasCloudOption) {
              updateConfig({ deployTarget: "cloud", serverId: undefined, buildStrategy: "server" });
              applied = true;
            }
          }
        }

        // No saved default and no usable last-pick? Default to a SERVER when one
        // exists (including the auto-added "This Server" in server-host mode),
        // with a unified build — matches "deploy to your server by default".
        // Prefer the local host server. Cloud stays the fallback only when no
        // server exists at all (handled by the single-option auto-select below).
        if (!applied && servers.length > 0) {
          const preferred = servers.find((s) => s.isLocal) ?? servers[0];
          updateConfig({ deployTarget: "server", serverId: preferred.id });
          applied = true;
        }

        // Collapse to compact summary only when defaults applied cleanly
        // AND we're not coming back here on purpose. `autoSkipAllowed=false`
        // means the user clicked the edit affordance on the next step to
        // come back and change something - landing them on the compact pill
        // would force an extra click on the pencil to actually edit. Skip
        // the collapse so they see the full picker right away.
        if (applied) setDefaultApplied(true);
      })
      .catch(() => { /* no default - picker falls back to auto-select */ })
      .finally(() => { if (!cancelled) setDefaultsLoaded(true); });
    return () => { cancelled = true; };
    // Excluded `servers` / `updateConfig` on purpose: this is a one-shot
    // seed keyed off `ready`. The dep array is intentionally tight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selfHosted]);

  // Auto-set deploy target when there's only one option
  useEffect(() => {
    // Cloud placement is owned by ServerSelector. A generic Cloud default must
    // never erase the selected managed server when this step mounts.
    if (!selfHosted) return;
    if (config.deployTarget === "cluster") return;
    if (!ready || hasChoice) {
      return;
    }

    if (hasServers) {
      updateConfig({ deployTarget: "server", serverId: servers[0].id });
      return;
    }

    if (hasCloudOption) {
      updateConfig({ deployTarget: "cloud", serverId: undefined, buildStrategy: "server" });
    }
  }, [ready, hasChoice, hasServers, hasCloudOption, servers, updateConfig, selfHosted]);

  // When switching TO cloud, AUTO-PRESELECT "server" as the build strategy.
  // Cloud builds belong in the cloud runtime — they get the right toolchain
  // automatically and don't burn the host's CPU/RAM. We fire this ONLY on the
  // deployTarget transition into cloud (not on every render) so a user who
  // explicitly switches to "This Machine" via the visible card AFTER the
  // switch is respected — `cloudSupportsLocalBuild` keeps that override card
  // available for stacks that produce a transferable artifact (Next.js .next,
  // Vite dist, etc.). Static-app stacks (no `hasBuild`) have nothing to
  // transfer, so the second clause force-corrects an invalid local pick.
  const prevDeployTargetRef = useRef(config.deployTarget);
  useEffect(() => {
    const justSwitchedToCloud =
      prevDeployTargetRef.current !== "cloud" && config.deployTarget === "cloud";
    prevDeployTargetRef.current = config.deployTarget;
    if (justSwitchedToCloud && config.buildStrategy !== "server") {
      updateConfig({ buildStrategy: "server" });
      return;
    }
    // Always force server-build when the stack can't produce a transferable
    // artifact - local-build would have nothing to ship to cloud.
    if (
      config.deployTarget === "cloud" &&
      config.buildStrategy === "local" &&
      config.options?.hasBuild !== true
    ) {
      updateConfig({ buildStrategy: "server" });
    }
  }, [config.deployTarget, config.buildStrategy, config.options?.hasBuild, updateConfig]);

  // Auto-select single server
  useEffect(() => {
    if (isSingleServer && config.deployTarget === "server" && !config.serverId) {
      updateConfig({ serverId: servers[0].id });
    }
  }, [isSingleServer, config.deployTarget, config.serverId, servers, updateConfig]);

  // Remember the last server actually chosen so flipping cloud↔server doesn't
  // lose it (and the runtime panel that depends on serverId). Tracks whatever
  // path set it — manual pick, single-server auto-select, add-server, default.
  const lastServerIdRef = useRef<string | undefined>(config.serverId || undefined);
  useEffect(() => {
    if (config.deployTarget === "server" && config.serverId) {
      lastServerIdRef.current = config.serverId;
    }
  }, [config.deployTarget, config.serverId]);

  const handleDeployTargetChange = (target: DeployTarget) => {
    // Changing the deploy target re-applies the sensible build default for the
    // new target; the user's previous explicit pick no longer applies.
    buildStrategyTouchedRef.current = false;
    const updates: Partial<typeof config> = { deployTarget: target };
    if (target === "cloud") {
      updates.serverId = undefined;
      updates.buildStrategy = "server";
    }
    if (target === "server") {
      // Restore the previously-chosen server (or auto-pick the only one) so the
      // runtime panel reappears instead of vanishing until a manual re-pick.
      updates.serverId =
        config.serverId ?? lastServerIdRef.current ?? (isSingleServer ? servers[0].id : undefined);
    }
    // Selection is tentative — it only updates local config. The soft "remember
    // this for next time" memory is persisted on Continue (handleContinue), not
    // on every click, so glancing at another target doesn't silently stick.
    updateConfig(updates);
  };

  const handleServerSelect = (server: ServerInfo) => {
    updateConfig({ deployTarget: "server", serverId: server.id });
  };

  // Build the deploy target options
  const deployTargetOptions: Array<{
    value: DeployTarget;
    icon: React.ReactNode;
    label: string;
    description: string;
  }> = [];

  if (hasServers) {
    if (isSingleServer) {
      // Single server → show directly by name
      deployTargetOptions.push({
        value: "server",
        icon: <UiIcon name="server" className="size-5" />,
        label: servers[0].name || servers[0].sshHost || servers[0].id,
        description: ts.options.serverViaSsh,
      });
    } else {
      // Multiple servers → show "Servers" category
      deployTargetOptions.push({
        value: "server",
        icon: <UiIcon name="server" className="size-5" />,
        label: ts.options.servers,
        description: interpolate(ts.options.serversCount, { count: String(servers.length) }),
      });
    }
  }

  if (hasCloudOption) {
    deployTargetOptions.push({
      value: "cloud",
      icon: <UiIcon name="cloud" className="size-5" />,
      label: ts.options.cloud,
      description: hasCloudConnected
        ? ts.options.cloudConnectedDesc
        : ts.options.cloudDisconnectedDesc,
    });
  }

  const buildOptions: Array<{
    value: BuildStrategy;
    icon: React.ReactNode;
    label: string;
    description: string;
  }> = [
    {
      value: "local",
      icon: <UiIcon name="cpu" className="size-5" />,
      label: ts.build.localLabel,
      description: ts.build.localDesc,
    },
    {
      value: "server",
      icon: <UiIcon name="cloud" className="size-5" />,
      label: ts.build.remoteLabel,
      description: ts.build.remoteDesc,
    },
  ];
  // For cloud deploys, building locally is a valid cost-saving path when the
  // stack produces a transferable build artifact (Next.js .next, Vite dist,
  // etc.). We charge for cloud build minutes; doing the build on the user's
  // machine and only shipping the output to cloud skips that cost.
  //
  // NOT default - cloud-on-cloud stays the recommended choice. Building
  // locally requires the same toolchain the cloud would use (Node version,
  // pnpm/bun/etc.) and is environment-sensitive, so we surface it as an
  // opt-in option, not the first card. Static-app stacks (no `hasBuild`)
  // can't use local-build because there's no artifact to transfer; skip.
  const cloudSupportsLocalBuild = selfHosted && config.options?.hasBuild === true;
  const visibleBuildOptions = config.deployTarget === "cloud"
    ? [
        {
          value: "server" as const,
          icon: <UiIcon name="cloud" className="size-5" />,
          label: ts.build.cloudLabel,
          description: ts.build.cloudDesc,
        },
        ...(cloudSupportsLocalBuild
          ? [
              {
                value: "local" as const,
                icon: <UiIcon name="cpu" className="size-5" />,
                label: ts.build.cloudLocalLabel,
                description: ts.build.cloudLocalDesc,
              },
            ]
          : []),
      ]
    : buildOptions;

  // Clone-location picker (DOCKER server deploys, incl. services). Bare always
  // clones on the target, so it keeps the credential-forwarding checkbox below
  // instead — there's no "clone on the API host" alternative for it. Cloud
  // clones inside the workspace and local has no remote, so both are excluded.
  // Services always deploy as docker (build on the server), so the clone picker
  // applies to them regardless of the config.runtimeMode field (which may not be
  // hydrated to "docker" on a config-edit).
  // Clone location only exists for a REMOTE build (the clone runs on the target).
  // "This Machine" (local build) clones + builds here and ships the output, so
  // there's no on-server-vs-here choice to make — hide it entirely.
  const showCloneStrategy =
    config.deployTarget === "server" &&
    config.buildStrategy === "server" &&
    (config.runtimeMode === "docker" || isServiceDeployment);
  // Clone-on-server is the default (primary card); cloning on the api host and
  // uploading is the advanced/manual alternative.
  const cloneStrategy: CloneStrategy = config.cloneStrategy ?? "server";
  const cloneOptions: Array<{
    value: CloneStrategy;
    icon: React.ReactNode;
    label: string;
    description: string;
  }> = [
    {
      value: "server",
      icon: <UiIcon name="git-branch" className="size-5" />,
      label: ts.clone.serverLabel,
      description: ts.clone.serverDesc,
    },
    {
      value: "api-host",
      // The "api host" is the machine running Openship: the user's own device in
      // desktop mode, the Openship orchestrator when self-hosted. Not the cloud —
      // so no cloud icon, and a label that says which machine it actually is.
      icon: <UiIcon name="cpu" className="size-5" />,
      label: isDesktop ? ts.clone.apiHostDesktopLabel : ts.clone.apiHostServerLabel,
      description: isDesktop
        ? ts.clone.apiHostDesktopDesc
        : ts.clone.apiHostServerDesc,
    },
  ];

  // Default the clone location to "on the server" for a brand-new deploy when
  // the choice is UNSET. Git-identity forwarding is no longer a per-deploy
  // choice — it's the operator-wide "Forward my git identity to build servers"
  // setting (Settings → Clone credentials), resolved server-side at build time.
  useEffect(() => {
    if (config.projectId) return;
    if (!showCloneStrategy) return;
    if (config.cloneStrategy == null) updateConfig({ cloneStrategy: "server" });
  }, [config.projectId, showCloneStrategy, config.cloneStrategy, updateConfig]);


  const hasAnyDeployTarget = deployTargetOptions.length > 0;
  const canContinue = ready && (
    (config.deployTarget === "cluster" && !!config.projectId) ||
    (config.deployTarget === "cloud" && (selfHosted || destinationReady)) ||
    (config.deployTarget === "server" && !!config.serverId && hasServers)
  );

  const baseLoading = !ready || !defaultsLoaded;
  const wouldAutoSkip = autoSkipAllowed && !baseLoading && defaultApplied && canContinue && selfHosted;
  const showLoading = baseLoading || wouldAutoSkip;
  const showFullPicker = !showLoading;

  // Auto-skip the entire step when a saved default applies cleanly. Parent
  // sets autoSkipAllowed=false when the user navigated back here on purpose,
  // so this only fires on the initial entry. Ref prevents StrictMode and
  // re-render double-fires; once we've handed off to onContinue we're done.
  const autoSkippedRef = useRef(false);
  useEffect(() => {
    if (!wouldAutoSkip) return;
    if (autoSkippedRef.current) return;
    autoSkippedRef.current = true;
    onContinue();
  }, [wouldAutoSkip, onContinue]);

  // Server name for the compact pill - falls back to host if unnamed.
  const selectedServer = config.deployTarget === "server" && config.serverId
    ? servers.find((s) => s.id === config.serverId)
    : null;
  const summaryServerName = config.deployTarget === "cloud" ? config.serverName : selectedServer
    ? (selectedServer.name || selectedServer.sshHost)
    : null;

  // Publish that resolved name into the config, so the screens AFTER this step can
  // name the machine too. Every place that picks a server (auto-seed, last-used,
  // preferred, an explicit pick here, the sidebar's) sets only `serverId` — the id is
  // the truth and the name is derived from it — so the progress screens had nothing
  // but the bare word "Server" to show. Derived HERE, the one place holding both the
  // id and the servers list, rather than appended to each of those call sites: that
  // list only grows, and the next one added would forget.
  useEffect(() => {
    if (config.deployTarget !== "server" && config.deployTarget !== "cloud") {
      // Not a server deploy: a name left over from a previous pick would outlive the
      // target it described.
      if (config.serverName !== undefined) updateConfig({ serverName: undefined });
      return;
    }
    // No resolution yet (list still loading, or an id we don't have a row for) is not
    // evidence of "no name" — clearing here would wipe the one a saved project
    // restored before this step's fetch landed.
    if (!summaryServerName) return;
    if (summaryServerName !== config.serverName) updateConfig({ serverName: summaryServerName });
  }, [config.deployTarget, config.serverName, summaryServerName, updateConfig]);

  // What this step actually PICKED, in the vocabulary both memories below use: a
  // binding, or nothing. `config.deployTarget` can also be "local", which is not a
  // pick — it's what an unbound project derives — so neither the cross-device
  // default nor the soft last-pick may store it. Null therefore means "nothing to
  // remember": the default is cleared and the last-pick is left alone.
  const pickedTarget: DefaultDeployTarget | null =
    config.deployTarget === "server" || config.deployTarget === "cloud"
      ? config.deployTarget
      : null;

  // Persist the current pick as the user's default - fire-and-forget so it
  // never blocks the deploy flow. Failures are surfaced as a toast; the
  // deploy itself continues either way.
  const persistDefault = async () => {
    if (!saveAsDefault) return;
    setSavingDefault(true);
    try {
      await settingsApi.updateDeployDefaults({
        defaultDeployTarget: pickedTarget,
        defaultServerId: pickedTarget === "server" ? (config.serverId ?? null) : null,
      });
      showToast(ts.savedToast, "success", ts.savedToastTitle);
    } catch {
      showToast(ts.saveFailedToast, "error", ts.savedToastTitle);
    } finally {
      setSavingDefault(false);
    }
  };

  const handleContinue = async () => {
    // The only hard gate at this step: deploying TO Openship Cloud needs an
    // Openship Cloud connection. Anything else (free .${baseDomain} domains
    // on own-server / local, free domains in compose services, etc.) is a
    // downstream concern - the stack/domains screens after Continue prompt
    // for cloud at the exact moment it's actually needed. Interrupting here
    // is paternalistic and breaks the "I picked my own server, leave me
    // alone" signal the user just gave us.
    if (config.deployTarget === "cloud" && !hasCloudConnected) {
      if (!(await requireCloud("cloud-deploy-target"))) {
        return;
      }
    }

    // Persist the soft "remember this target for next time" memory now — on
    // commit, not on every tentative click. This is what lets a returning user
    // skip straight to config next deploy.
    if (pickedTarget) {
      lastPickStore.write({
        target: pickedTarget,
        serverId: pickedTarget === "server" ? (config.serverId ?? null) : null,
      });
    }

    void persistDefault();
    onContinue();
  };

  const showSettings = showFullPicker && (!!config.serverId || !selfHosted) &&
    (config.deployTarget === "server" || config.deployTarget === "cloud");
  const showRuntimeIsolation =
    (config.deployTarget === "cloud" || workloadOf(config.options) !== "static") &&
    config.projectType !== "docker" && !isServiceDeployment;
  const showResourceLimits = config.deployTarget === "cloud" &&
    (config.runtimeMode !== "bare" || isServiceDeployment || config.projectType === "docker");
  const resourceValues = resolveTierResources(config.cloudResourceTier ?? "unlimited", config.cloudResourceCustom);

  // Saved connection defaults stay with the destination controls.
  const saveDefaultCheckbox =
    selfHosted && showFullPicker && canContinue ? (
      <label className="flex items-start gap-2.5 cursor-pointer select-none px-1">
        <input
          type="checkbox"
          checked={saveAsDefault}
          onChange={(e) => setSaveAsDefault(e.target.checked)}
          disabled={savingDefault}
          className="mt-0.5 size-4 shrink-0 rounded border-border/60 bg-card text-primary focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 cursor-pointer disabled:opacity-50"
        />
        <span className="text-sm text-muted-foreground leading-snug">
          {ts.saveDefault}{" "}
          <span className="text-muted-foreground/70">{ts.saveDefaultHint}</span>
        </span>
      </label>
    ) : null;

  const headerSubtitle = showLoading || (!selfHosted && serverSelection.loading)
    ? ts.loadingSubtitle
    : !selfHosted && serverSelection.readOnly
      ? null
      : hasAnyDeployTarget
        ? ts.chooseSubtitle
        : ts.noTargetSubtitle;

  const backButton = (
    <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={onBack}>
      <UiIcon name="arrow-left" className="size-4 rtl:rotate-180" />
      {ts.back}
    </Button>
  );

  if (config.deployTarget === "cluster") return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-medium">Deploy to server cluster</h1>
        {backButton}
      </header>
      <p className="text-sm leading-relaxed text-muted-foreground">This project uses the cluster and instance count saved in its Scale controls. OpenShip builds or reuses the application image, starts the instances, and checks their health before switching traffic.</p>
      <Button onClick={onContinue}>Continue</Button>
    </div>
  );

  return (
    <div className="@container/target space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-foreground/80">{ts.heading}</h1>
          {headerSubtitle && <p className="mt-1 text-sm text-muted-foreground">{headerSubtitle}</p>}
        </div>
        {backButton}
      </header>
      <div className="grid grid-cols-1 items-start gap-6 @min-[60rem]/target:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <section className="space-y-4 rounded-2xl bg-card p-5" aria-label={t.billing.workspaces.destination}>
            <h2 className="text-sm font-semibold text-foreground">{t.billing.workspaces.destination}</h2>
            {showLoading && (
              <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-5 text-sm text-muted-foreground">
                <UiIcon name="spinner" className="size-4 animate-spin" />
                {ts.loadingCheck}
              </div>
            )}
            {!selfHosted && config.deployTarget === "cloud" && (
              <ServerSelectorView selection={serverSelection} label={t.billing.workspaces.destination} compact />
            )}
            {selfHosted && showFullPicker && hasAnyDeployTarget && (
              <div className="space-y-3">
                {deployTargetOptions.map((opt) => (
                  <OptionCard
                    key={opt.value}
                    value={opt.value}
                    selected={config.deployTarget === opt.value}
                    onSelect={() => handleDeployTargetChange(opt.value)}
                    icon={opt.icon}
                    label={opt.label}
                    description={opt.description}
                  >
                    {opt.value === "server" && !isSingleServer && config.deployTarget === "server" && (
                      <ServerPicker servers={servers} selectedId={config.serverId} onSelect={handleServerSelect} onAddServer={openAddServer} />
                    )}
                  </OptionCard>
                ))}
              </div>
            )}
            {selfHosted && showFullPicker && !hasAnyDeployTarget && (
              <p className="text-sm text-muted-foreground">{ts.noTargetBody}</p>
            )}
            {selfHosted && showFullPicker && !(config.deployTarget === "server" && !isSingleServer && hasServers) && (
              <Button type="button" variant="secondary" size="sm" onClick={openAddServer}>
                <UiIcon name="plus" className="size-3.5" />
                {ts.addServer}
              </Button>
            )}
            {saveDefaultCheckbox}
          </section>

          {showSettings && (
            <>
              {showRuntimeIsolation && (
                <section className="rounded-2xl bg-card p-5" aria-label={t.deploy.runtime.heading}>
                  <ServerRuntimePicker />
                </section>
              )}
              {showResourceLimits && (
                <section className="space-y-4 rounded-2xl bg-card p-5" aria-label={t.projectSettings.resources.title}>
                  <h2 className="text-sm font-semibold text-foreground">{t.projectSettings.resources.title}</h2>
                  <ResourceTierPicker
                    key={config.serverId}
                    compact
                    value={config.cloudResourceTier ?? "unlimited"}
                    values={resourceValues}
                    capacity={serverSelection.selected?.managed?.resources ?? undefined}
                    disabled={serverSelection.disabled}
                    onSelect={(tier, values) => updateConfig({
                      cloudResourceTier: tier,
                      cloudResourceCustom: tier === "custom" && values ? { ...resourceValues, ...values } : undefined,
                    })}
                  />
                </section>
              )}
              {showBuildStrategy && visibleBuildOptions.length > 1 && (
                <section className="space-y-4 rounded-2xl bg-card p-5">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">{config.options.hasBuild ? ts.build.heading : ts.build.prepareHeading}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{config.options.hasBuild ? ts.build.subtitle : ts.build.prepareSubtitle}</p>
                  </div>
                  <div className="grid grid-cols-1 items-stretch gap-3 @min-[36rem]/target:grid-cols-2">
                    {visibleBuildOptions.map((opt) => (
                      <OptionCard key={opt.value} value={opt.value} selected={config.buildStrategy === opt.value}
                        onSelect={() => { buildStrategyTouchedRef.current = true; updateConfig({ buildStrategy: opt.value }); }}
                        icon={opt.icon} label={opt.label} description={opt.description} className="h-full" />
                    ))}
                  </div>
                </section>
              )}
              <section className="rounded-2xl bg-card p-5" aria-label={ts.rollbackTitle}>
                <RollbackBackupPanel
                  projectId={projectId}
                  enabled
                  artifactKind={workloadOf(config.options) === "static" && !isServiceDeployment ? "files" : "image"}
                />
              </section>
              {showCloneStrategy && (
                <section className="space-y-4 rounded-2xl bg-card p-5">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">{ts.clone.heading}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ts.clone.descLead}{isDesktop ? ts.clone.descDesktop : ts.clone.descServer}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 items-stretch gap-3 @min-[36rem]/target:grid-cols-2">
                    {cloneOptions.map((opt) => (
                      <OptionCard key={opt.value} value={opt.value} selected={cloneStrategy === opt.value}
                        onSelect={() => updateConfig({ cloneStrategy: opt.value })}
                        icon={opt.icon} label={opt.label} description={opt.description} className="h-full" />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
        <aside className="space-y-4 rounded-2xl bg-card p-5 @min-[60rem]/target:sticky @min-[60rem]/target:top-6" aria-label={ts.previewTitle}>
          <h2 className="text-base font-semibold text-foreground">{ts.previewTitle}</h2>
          <DeployTargetSummary
            variant="preview"
            deployTarget={config.deployTarget}
            buildStrategy={config.buildStrategy}
            serverName={summaryServerName}
            showBuildStrategy={showBuildStrategy}
            cloudResourceTier={config.cloudResourceTier}
            hasServer={workloadOf(config.options) !== "static"}
            runtimeMode={config.runtimeMode}
            isServices={isServiceDeployment}
            rollbackWindow={config.rollbackWindow}
            rollbackStrategy={config.rollbackStrategy}
          />
          <Button type="button" onClick={handleContinue} disabled={!canContinue} className="w-full">
            {ts.continue}
            <UiIcon name="arrow-right" className="size-4 rtl:rotate-180" />
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">{ts.previewHint}</p>
        </aside>
      </div>
    </div>
  );
};

export default DeployTargetStep;
