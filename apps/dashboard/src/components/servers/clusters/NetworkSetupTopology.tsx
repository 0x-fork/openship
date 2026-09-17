"use client";

import type { ClusterNetworkReport, ManagedNetworkHostProgress } from "@repo/core";
import { interpolate, useI18n } from "@/components/i18n-provider";
import { ClusterNetworkDiagnostics } from "./ClusterNetworkDiagnostics";
import type { NetworkProgressHost } from "./NetworkSetupProgress";
import type { NetworkTopologyMember } from "./network-topology";

/** The same topology shows installation progress before connectivity results exist. */
export function NetworkSetupTopology({
  members,
  hosts,
  running,
  statusLabel,
  completeLabel,
  preparation = false,
  report,
  observedAt,
  restored = false,
  onHostSelect,
}: {
  members: NetworkTopologyMember[];
  hosts: (NetworkProgressHost & { stage?: ManagedNetworkHostProgress["stage"] })[];
  running: boolean;
  statusLabel: string;
  completeLabel: string;
  preparation?: boolean;
  report?: ClusterNetworkReport | null;
  observedAt?: string | null;
  restored?: boolean;
  onHostSelect(serverId: string): void;
}) {
  const { t } = useI18n();
  const m = t.servers.clusters.managed;
  return (
    <ClusterNetworkDiagnostics
      compact
      members={members.map((member) => {
        const host = hosts.find((item) => item.serverId === member.serverId);
        if (!host) return member;
        const current = running && host.steps.find((step) => step.status === "running");
        const failed = host.steps.find((step) => step.status === "failed");
        const done = host.steps.filter(
          (step) => step.status === "completed" || step.status === "skipped",
        ).length;
        const complete = host.steps.length > 0 && done === host.steps.length;
        const recovered =
          host.stage === "rolled_back" ||
          host.steps.some((step) => step.id === "rollback" && step.status === "completed");
        const progress: NonNullable<NetworkTopologyMember["progress"]> = recovered
          ? { state: "restored", label: m.stages.rolled_back }
          : current
            ? { state: "running", label: m.setupSteps[current.id] }
            : failed || host.stage === "failed"
              ? { state: "failed", label: failed ? m.setupSteps[failed.id] : m.stages.failed }
              : complete || host.stage === "committed"
                ? { state: "completed", label: completeLabel }
                : {
                    state: "pending",
                    label: host.steps.length
                      ? interpolate(m.completedSteps, {
                          done: String(done),
                          total: String(host.steps.length),
                        })
                      : host.stage
                        ? m.stages[host.stage]
                        : m.stepStatus.pending,
                  };
        return { ...member, progress };
      })}
      report={report}
      running={running}
      observedAt={observedAt}
      restored={restored}
      statusText={statusLabel}
      hint={preparation ? m.preparationTopologyHint : m.installationTopologyHint}
      onHostSelect={onHostSelect}
    />
  );
}
