import type { ClusterNetworkReport, InfrastructureProviderId } from "@repo/core";

export interface NetworkTopologyMember {
  interfaceName?: string;
  serverId: string;
  name: string;
  privateIp: string;
  providerId: InfrastructureProviderId;
  endpoint?: string;
  listenPort?: number;
  progress?: {
    state: "pending" | "running" | "completed" | "failed" | "restored";
    label: string;
  };
}

export function networkLinks(
  members: NetworkTopologyMember[],
  report?: ClusterNetworkReport | null,
) {
  return members.flatMap((source, i) =>
    members.slice(i + 1).map((target) => {
      const directions = [
        [source, target],
        [target, source],
      ].map(([from, to]) => ({
        source: from!,
        target: to!,
        check: report?.peers.find(
          (p) => p.sourceServerId === from!.serverId && p.targetServerId === to!.serverId,
        ),
        handshake: report?.handshakes?.find(
          (p) => p.sourceServerId === from!.serverId && p.targetServerId === to!.serverId,
        ),
        speed: report?.throughput?.find(
          (p) => p.sourceServerId === from!.serverId && p.targetServerId === to!.serverId,
        ),
      }));
      const failed = directions.some(
        ({ check, handshake }) =>
          handshake?.ok === false || (check && (!check.tcp || !check.udp || !check.mtu)),
      );
      const passed = directions.every(({ check }) => check?.tcp && check.udp && check.mtu);
      const rtts = directions.flatMap(({ check }) =>
        check?.latencyKind === "rtt" && check.latencyMs !== null ? [check.latencyMs] : [],
      );
      return {
        id: JSON.stringify([source.serverId, target.serverId]),
        source,
        target,
        directions,
        state: failed ? ("failed" as const) : passed ? ("passed" as const) : ("unchecked" as const),
        latencyMs: rtts.length === 2 ? Math.max(...rtts) : null,
      };
    }),
  );
}
export type NetworkTopologyLink = ReturnType<typeof networkLinks>[number];

export function networkNodePositions(count: number) {
  if (count === 2)
    return [
      { x: 0, y: 80 },
      { x: 380, y: 80 },
    ];
  if (count === 3)
    return [
      { x: 0, y: 0 },
      { x: 420, y: 0 },
      { x: 210, y: 240 },
    ];
  const radius = Math.max(260, count * 46);
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return { x: radius + Math.cos(angle) * radius, y: radius + Math.sin(angle) * radius };
  });
}
