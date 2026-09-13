"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useViewport,
  type Connection,
  type OnDelete,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import {
  LockKeyhole,
  Map as MapIcon,
  Maximize,
  Minus,
  Network,
  Plus,
  UnlockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResourceNode, type ScaleFlowNode } from "./ResourceNode";
import { TrafficEdge, type ScaleFlowEdge } from "./TrafficEdge";
import { connectionError, connectionLabel, type ScaleDraft, type ScaleSelection } from "./topology";
import "@xyflow/react/dist/style.css";

const nodeTypes = { resource: ResourceNode };
const edgeTypes = { traffic: TrafficEdge };
const defaultEdgeOptions = {
  type: "traffic",
  markerEnd: { type: MarkerType.ArrowClosed, color: "var(--th-on-30)", width: 15, height: 15 },
};
const fitViewOptions = { padding: 0.12, maxZoom: 1 };
const connectionLineStyle = { stroke: "var(--foreground)", strokeWidth: 1.5 };

interface ScaleCanvasProps {
  draft: ScaleDraft;
  selection: ScaleSelection;
  onSelect: (selection: ScaleSelection) => void;
  onConnect: (source: string, target: string) => void;
  onMove: (positions: { id: string; position: { x: number; y: number } }[]) => void;
  onRemoveNodes: (ids: string[]) => void;
  onRemoveEdges: (ids: string[]) => void;
  fitRequest: { revision: number; nodeId?: string };
}

function CanvasTools({
  locked,
  onToggleLock,
  showMap,
  onToggleMap,
}: {
  locked: boolean;
  onToggleLock: () => void;
  showMap: boolean;
  onToggleMap: () => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  return (
    <Panel
      position="bottom-left"
      className="scale-canvas-controls scale-floating-surface flex items-center gap-0.5 rounded-2xl border border-border/60 p-1.5"
    >
      <Button
        variant="ghost"
        size="icon"
        title="Zoom out"
        aria-label="Zoom out"
        onClick={() => zoomOut()}
      >
        <Minus />
      </Button>
      <span className="w-10 text-center text-xs tabular-nums text-foreground/70">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon"
        title="Zoom in"
        aria-label="Zoom in"
        onClick={() => zoomIn()}
      >
        <Plus />
      </Button>
      <span className="mx-1 h-5 w-px bg-border/70" aria-hidden="true" />
      <Button
        variant="ghost"
        size="icon"
        title="Fit topology to view"
        aria-label="Fit topology to view"
        onClick={() => fitView(fitViewOptions)}
      >
        <Maximize />
      </Button>
      <span className="mx-1 h-5 w-px bg-border/70" aria-hidden="true" />
      <Button
        variant="ghost"
        size="icon"
        title={locked ? "Unlock canvas" : "Lock canvas"}
        aria-label={locked ? "Unlock canvas" : "Lock canvas"}
        aria-pressed={locked}
        onClick={onToggleLock}
      >
        {locked ? <LockKeyhole /> : <UnlockKeyhole />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Toggle minimap"
        aria-label="Toggle minimap"
        aria-pressed={showMap}
        onClick={onToggleMap}
      >
        <MapIcon />
      </Button>
    </Panel>
  );
}

function Canvas({
  draft,
  selection,
  onSelect,
  onConnect,
  onMove,
  onRemoveNodes,
  onRemoveEdges,
  fitRequest,
}: ScaleCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<ScaleFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ScaleFlowEdge>([]);
  const [locked, setLocked] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const fittedRevision = useRef(fitRequest.revision);
  useEffect(() => {
    const services = new Map(draft.services.map((service) => [service.id, service]));
    setNodes((current) => {
      const previous = new Map(current.map((node) => [node.id, node]));
      return draft.nodes.map((resource) => {
        const existing = previous.get(resource.id);
        const selected = selection?.type === "node" && selection.id === resource.id;
        const service = resource.kind === "service" ? services.get(resource.serviceId) : undefined;
        const unchanged =
          existing?.data.resource === resource && existing?.data.service === service;
        if (unchanged && existing.selected === selected) return existing;
        return {
          ...existing,
          id: resource.id,
          type: "resource",
          position: resource.position,
          data: unchanged ? existing.data : { resource, service },
          selected,
          ariaLabel: `${resource.name}, ${resource.kind}. Select to configure.`,
        };
      });
    });
  }, [draft.nodes, draft.services, selection, setNodes]);
  useEffect(() => {
    const resources = new Map(draft.nodes.map((resource) => [resource.id, resource]));
    setEdges((current) => {
      const previous = new Map(current.map((edge) => [edge.id, edge]));
      return draft.edges.flatMap((edge) => {
        const target = resources.get(edge.target);
        if (!target) return [];
        const existing = previous.get(edge.id);
        const selected = selection?.type === "edge" && selection.id === edge.id;
        const label = connectionLabel(draft, target);
        if (existing?.data?.label === label && existing.selected === selected) return [existing];
        return [
          {
            ...edge,
            ...defaultEdgeOptions,
            type: "traffic" as const,
            sourceHandle: "out",
            targetHandle: "in",
            data: { label },
            selected,
            ariaLabel: `Connection from ${resources.get(edge.source)?.name} to ${target.name}`,
          },
        ];
      });
    });
  }, [draft, selection, setEdges]);
  useEffect(() => {
    if (!nodesInitialized || fittedRevision.current === fitRequest.revision) return;
    const frame = requestAnimationFrame(() => {
      fittedRevision.current = fitRequest.revision;
      fitView({
        ...fitViewOptions,
        nodes: fitRequest.nodeId ? [{ id: fitRequest.nodeId }] : undefined,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [fitRequest, nodesInitialized, fitView]);

  const handleConnection = useCallback(
    (connection: Connection) => onConnect(connection.source, connection.target),
    [onConnect],
  );
  const isValidConnection = useCallback(
    (connection: Connection | ScaleFlowEdge) =>
      !connectionError(draft, connection.source, connection.target),
    [draft],
  );
  const handleNodesChange = useCallback(
    (changes: NodeChange<ScaleFlowNode>[]) => {
      onNodesChange(changes);
      const selected = changes.find((change) => change.type === "select" && change.selected);
      if (selected?.type === "select") onSelect({ type: "node", id: selected.id });
      const settled = changes.flatMap((change) =>
        change.type === "position" && change.position && !change.dragging
          ? [{ id: change.id, position: change.position }]
          : [],
      );
      if (settled.length) onMove(settled);
    },
    [onNodesChange, onSelect, onMove],
  );
  const handleEdgesChange = useCallback(
    (changes: EdgeChange<ScaleFlowEdge>[]) => {
      onEdgesChange(changes);
      const selected = changes.find((change) => change.type === "select" && change.selected);
      if (selected?.type === "select") onSelect({ type: "edge", id: selected.id });
    },
    [onEdgesChange, onSelect],
  );
  const handleNodeClick = useCallback(
    (_event: unknown, node: ScaleFlowNode) => onSelect({ type: "node", id: node.id }),
    [onSelect],
  );
  const handleEdgeClick = useCallback(
    (_event: unknown, edge: ScaleFlowEdge) => onSelect({ type: "edge", id: edge.id }),
    [onSelect],
  );
  const handlePaneClick = useCallback(() => onSelect(null), [onSelect]);
  const handleDelete = useCallback<OnDelete<ScaleFlowNode, ScaleFlowEdge>>(
    ({ nodes: removedNodes, edges: removedEdges }) => {
      if (removedNodes.length) onRemoveNodes(removedNodes.map((node) => node.id));
      else if (removedEdges.length) onRemoveEdges(removedEdges.map((edge) => edge.id));
    },
    [onRemoveNodes, onRemoveEdges],
  );

  return (
    <div
      className="scale-canvas h-full w-full"
      dir="ltr"
      aria-label="Interactive scaling topology"
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") onSelect(null);
      }}
    >
      <ReactFlow<ScaleFlowNode, ScaleFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnection}
        isValidConnection={isValidConnection}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onDelete={handleDelete}
        nodesDraggable={!locked}
        nodesConnectable={!locked}
        autoPanOnNodeFocus={false}
        edgesReconnectable={false}
        deleteKeyCode={locked ? null : ["Backspace", "Delete"]}
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
        onlyRenderVisibleElements
        minZoom={0.2}
        maxZoom={1.6}
        fitView
        fitViewOptions={fitViewOptions}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineStyle={connectionLineStyle}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--th-on-12)" />
        {!draft.nodes.length && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <Network className="size-8 text-muted-foreground/50" />
            <h3 className="text-lg font-medium text-foreground/80">No resources yet</h3>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Add an edge, application, or cluster to start your topology.
            </p>
          </div>
        )}
        <CanvasTools
          locked={locked}
          onToggleLock={() => setLocked(!locked)}
          showMap={showMap}
          onToggleMap={() => setShowMap(!showMap)}
        />
        {showMap && (
          <MiniMap pannable zoomable nodeColor="var(--th-on-30)" maskColor="var(--th-sf-06)" />
        )}
      </ReactFlow>
    </div>
  );
}

export default memo(function ScaleCanvas(props: ScaleCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
});
