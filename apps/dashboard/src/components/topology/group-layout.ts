import { topologyPositions, type ProjectTopologyGraph } from "./model";
import type { TopologyPositions } from "./layout";

export interface TopologyGroupLayout {
  id: string;
  nodeIds: readonly string[];
  collapsed?: boolean;
}

/** Grouping is presentation only: it never adds resources or dependency edges. */
export function groupedTopologyLayout(
  graph: ProjectTopologyGraph,
  groups: readonly TopologyGroupLayout[],
) {
  const positions: TopologyPositions = {};
  const frames = new Map<string, { width: number; height: number }>();
  const parents = new Map<string, string>();
  let nextY = 0;
  for (const group of groups) {
    const ids = new Set(group.nodeIds);
    const nodes = graph.nodes.filter((node) => ids.has(node.id));
    const local = topologyPositions({ nodes, edges: [] });
    const points = Object.values(local);
    const minX = points.length ? Math.min(...points.map((point) => point.x)) : 0;
    const minY = points.length ? Math.min(...points.map((point) => point.y)) : 0;
    const maxX = points.length ? Math.max(...points.map((point) => point.x)) : 0;
    const maxY = points.length ? Math.max(...points.map((point) => point.y)) : 0;
    const width = Math.max(360, maxX - minX + 314);
    const height = group.collapsed ? 80 : Math.max(240, (maxY - minY) * 0.82 + 236);
    frames.set(group.id, { width, height });
    positions[group.id] = { x: 0, y: nextY };
    nextY += height + 32;
    for (const node of nodes) {
      parents.set(node.id, group.id);
      positions[node.id] = {
        x: local[node.id]!.x - minX + 32,
        y: (local[node.id]!.y - minY) * 0.82 + 88,
      };
    }
  }
  const ungrouped = graph.nodes.filter((node) => !parents.has(node.id));
  const ungroupedPositions = topologyPositions({ nodes: ungrouped, edges: [] });
  const minY = Math.min(0, ...Object.values(ungroupedPositions).map((position) => position.y));
  for (const node of ungrouped) {
    const position = ungroupedPositions[node.id]!;
    positions[node.id] = { x: position.x, y: position.y - minY + nextY };
  }
  return { positions, frames, parents };
}
