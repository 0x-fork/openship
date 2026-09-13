"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useReducer, useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { randomUUID } from "@/lib/random-uuid";
import ScaleCanvas from "./ScaleCanvas";
import { ScaleLoading } from "./ScaleLoading";
import { ScaleToolbar } from "./ScaleToolbar";
import { useTopologyStorage } from "./useTopologyStorage";
import {
  MAX_RESOURCES,
  addService,
  configureService,
  connectResources,
  createExampleDraft,
  createResource,
  createService,
  draftReducer,
  layoutDraft,
  removeConnections,
  removeResources,
  serviceInstances,
  type ResourceKind,
  type ScaleDraft,
  type ScaleResource,
  type ScaleSelection,
  type ScaleService,
} from "./topology";
import "./scale.css";

const ScaleInspector = dynamic(() => import("./ScaleInspector"), {
  loading: () => (
    <aside
      className="flex h-full items-center justify-center text-sm text-muted-foreground"
      role="status"
    >
      Loading configuration…
    </aside>
  ),
});

export default function ScaleEditor({ storageKey }: { storageKey: string }) {
  const [history, dispatch] = useReducer(draftReducer, undefined, () => ({
    present: createExampleDraft(),
    past: [],
    future: [],
  }));
  const draft = history.present;
  const [selection, setSelection] = useState<ScaleSelection>(null);
  const [fitRequest, setFitRequest] = useState<{ revision: number; nodeId?: string }>({
    revision: 0,
  });
  const { toast } = useToast();
  const storage = useTopologyStorage(storageKey, draft, dispatch);
  const selectedNode =
    selection?.type === "node" && draft.nodes.some((node) => node.id === selection.id);

  const change = useCallback(
    (update: (current: ScaleDraft) => ScaleDraft) => dispatch({ type: "change", draft: update }),
    [],
  );
  const select = useCallback((next: ScaleSelection) => {
    setSelection((current) =>
      current?.type === next?.type && current?.id === next?.id ? current : next,
    );
  }, []);
  const closeInspector = useCallback(() => setSelection(null), []);
  const updateResource = useCallback(
    (resource: ScaleResource) => {
      change((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === resource.id ? { ...resource, position: node.position } : node,
        ),
      }));
    },
    [change],
  );
  const updateService = useCallback(
    (service: ScaleService, count?: number) => {
      try {
        const next = configureService(draft, service, count);
        dispatch({ type: "change", draft: next });
        if (selection?.type === "node" && !next.nodes.some((node) => node.id === selection.id))
          select({ type: "node", id: serviceInstances(next, service.id)[0].id });
        if (next.nodes.length !== draft.nodes.length)
          setFitRequest((current) => ({ revision: current.revision + 1 }));
      } catch (error) {
        toast(
          "error",
          error instanceof Error ? error.message : "Could not update the application.",
        );
      }
    },
    [draft, selection, select, toast],
  );
  const moveResources = useCallback(
    (positions: { id: string; position: { x: number; y: number } }[]) => {
      const moved = new Map(positions.map((entry) => [entry.id, entry.position]));
      change((current) => ({
        ...current,
        nodes: current.nodes.map((node) => {
          const position = moved.get(node.id);
          return position && (position.x !== node.position.x || position.y !== node.position.y)
            ? { ...node, position: { ...position } }
            : node;
        }),
      }));
    },
    [change],
  );
  const removeNodes = useCallback(
    (ids: string[]) => {
      change((current) => removeResources(current, ids));
      setSelection((current) =>
        current?.type === "node" && ids.includes(current.id) ? null : current,
      );
    },
    [change],
  );
  const removeEdges = useCallback(
    (ids: string[]) => {
      change((current) => removeConnections(current, ids));
      setSelection((current) => (current?.type === "edge" ? null : current));
    },
    [change],
  );
  const connect = useCallback(
    (source: string, target: string) => {
      try {
        dispatch({ type: "change", draft: connectResources(draft, source, target) });
      } catch (error) {
        toast(
          "error",
          error instanceof Error ? error.message : "Could not connect these resources.",
        );
      }
    },
    [draft, toast],
  );
  const addResource = useCallback(
    (kind: ResourceKind) => {
      const id = randomUUID();
      try {
        if (kind === "service") {
          let ordinal = 1;
          while (draft.services.some((service) => service.name === `application-${ordinal}`))
            ordinal += 1;
          dispatch({
            type: "change",
            draft: addService(draft, createService(id, `application-${ordinal}`)),
          });
          select({ type: "node", id: `${id}-instance-1` });
        } else {
          if (draft.nodes.length >= MAX_RESOURCES)
            throw new Error(`The draft supports up to ${MAX_RESOURCES} nodes.`);
          let ordinal = 1;
          while (draft.nodes.some((node) => node.name === `${kind}-${ordinal}`)) ordinal += 1;
          const resource = createResource(kind, id, ordinal);
          const siblings = draft.nodes.filter(
            (node) =>
              node.kind === kind ||
              (node.kind !== "service" && node.kind !== "edge" && kind !== "edge"),
          );
          resource.position.y = Math.max(-250, ...siblings.map((node) => node.position.y)) + 250;
          change((current) => ({ ...current, nodes: [...current.nodes, resource] }));
          select({ type: "node", id });
        }
        setFitRequest((current) => ({ revision: current.revision + 1 }));
      } catch (error) {
        toast("error", error instanceof Error ? error.message : "Could not add this resource.");
      }
    },
    [draft, change, select, toast],
  );
  const autoLayout = useCallback(() => {
    change(layoutDraft);
    setFitRequest((current) => ({ revision: current.revision + 1 }));
  }, [change]);
  const exportDraft = useCallback(() => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "openship-scaling-draft.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [draft]);
  const resetExample = useCallback(() => {
    if (
      !window.confirm(
        "Reset the local topology to the example? You can undo this change. No infrastructure is changed.",
      )
    )
      return;
    dispatch({ type: "change", draft: createExampleDraft() });
    select(null);
    setFitRequest((current) => ({ revision: current.revision + 1 }));
  }, [select]);

  useEffect(() => {
    if (!storage.ready) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        (event.target as HTMLElement | null)?.closest(
          "input, textarea, select, [contenteditable='true']",
        )
      )
        return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [storage.ready]);

  if (!storage.ready) return <ScaleLoading />;
  return (
    <div className="scale-page h-full min-h-0 w-full p-3">
      <section
        className="scale-workspace relative isolate h-full min-h-0 min-w-0 overflow-hidden rounded-2xl border border-border/50 bg-background"
        aria-label="Scaling workspace"
      >
        <div className="absolute inset-0" aria-label="Scaling topology">
          <ScaleCanvas
            draft={draft}
            selection={selection}
            onSelect={select}
            onConnect={connect}
            onMove={moveResources}
            onRemoveNodes={removeNodes}
            onRemoveEdges={removeEdges}
            fitRequest={fitRequest}
          />
        </div>
        <ScaleToolbar
          canUndo={!!history.past.length}
          canRedo={!!history.future.length}
          canAdd={draft.nodes.length < MAX_RESOURCES}
          hasNodes={!!draft.nodes.length}
          onAdd={addResource}
          onUndo={() => dispatch({ type: "undo" })}
          onRedo={() => dispatch({ type: "redo" })}
          onLayout={autoLayout}
          onExport={exportDraft}
          onReset={resetExample}
        />
        {storage.notice && (
          <div
            role="status"
            className="scale-storage-notice absolute start-4 z-40 max-w-lg rounded-xl border border-warning-border bg-popover p-3 text-sm shadow-sm"
          >
            <div className="flex items-start gap-2 text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-warning" />
              <p>{storage.notice}</p>
            </div>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="sm" onClick={storage.retry}>
                {storage.blocked ? "Replace saved layout" : "Retry"}
              </Button>
              <Button variant="ghost" size="sm" onClick={exportDraft}>
                Export topology
              </Button>
            </div>
          </div>
        )}
        {selectedNode && (
          <div className="scale-inspector-overlay scale-floating-surface overflow-hidden rounded-2xl border border-border/60">
            <ScaleInspector
              draft={draft}
              selection={selection}
              onUpdate={updateResource}
              onUpdateService={updateService}
              onSelect={select}
              onConnect={connect}
              onRemoveNodes={removeNodes}
              onRemoveEdges={removeEdges}
              onClose={closeInspector}
            />
          </div>
        )}
      </section>
    </div>
  );
}
