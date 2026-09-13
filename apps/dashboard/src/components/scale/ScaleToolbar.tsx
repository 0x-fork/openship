"use client";

import { useState } from "react";
import {
  Download,
  Layers3,
  LayoutGrid,
  MoreHorizontal,
  Network,
  Plus,
  Redo2,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DismissiblePopover } from "@/components/ui/Popover";
import { ResourceIcon } from "./ResourceIcon";
import { CLUSTER_ENGINES, CLUSTER_KINDS, RESOURCE_META, type ResourceKind } from "./topology";

export function ResourceMenu({ onAdd }: { onAdd: (kind: ResourceKind) => void }) {
  const resourceButton = (kind: ResourceKind, title = RESOURCE_META[kind].title) => (
    <button
      type="button"
      className="scale-resource-tone flex w-full items-center gap-3 rounded-xl p-3 text-start transition-colors hover:bg-muted/60"
      data-kind={kind}
      key={kind}
      onClick={() => onAdd(kind)}
    >
      <div className="scale-resource-icon flex size-9 shrink-0 items-center justify-center rounded-xl">
        <ResourceIcon kind={kind} className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {RESOURCE_META[kind].description}
        </p>
      </div>
    </button>
  );

  return (
    <div>
      {resourceButton("edge")}
      {resourceButton("service")}
      <div className="mt-2 border-t border-border/50 pt-2" role="group" aria-label="Cluster">
        <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
          <Layers3 className="size-3.5" />
          Cluster
        </div>
        {CLUSTER_KINDS.map((kind) => resourceButton(kind, CLUSTER_ENGINES[kind]))}
      </div>
    </div>
  );
}

interface ScaleToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  canAdd: boolean;
  hasNodes: boolean;
  onAdd: (kind: ResourceKind) => void;
  onUndo: () => void;
  onRedo: () => void;
  onLayout: () => void;
  onExport: () => void;
  onReset: () => void;
}

export function ScaleToolbar(props: ScaleToolbarProps) {
  const [adding, setAdding] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <header
      className="scale-toolbar absolute start-4 top-4 z-30 flex items-center gap-2"
      aria-label="Topology editor"
    >
      <div className="scale-toolbar-identity scale-floating-surface relative flex h-14 items-center gap-3 rounded-2xl border border-border/60 py-2 ps-3 pe-2">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-foreground/70">
          <Network className="size-4" />
        </div>
        <div className="min-w-0 flex-1 pe-2">
          <h1 className="text-sm font-medium text-foreground">Scale</h1>
          <p className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">Topology editor</p>
        </div>
        <DismissiblePopover open={moreOpen} onOpenChange={setMoreOpen}>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Canvas options"
            title="Canvas options"
            aria-expanded={moreOpen}
            aria-controls="scale-options"
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <MoreHorizontal />
          </Button>
          {moreOpen && (
            <div
              id="scale-options"
              className="absolute start-0 top-full z-30 mt-2 w-64 max-w-full rounded-2xl border border-border bg-popover p-2 shadow-lg"
            >
              <p className="border-b border-border/50 px-3 pb-3 pt-2 text-xs leading-relaxed text-muted-foreground">
                Local topology preview. No infrastructure changes.
              </p>
              {[
                { label: "Export topology", Icon: Download, action: props.onExport },
                { label: "Reset example", Icon: RotateCcw, action: props.onReset },
              ].map(({ label, Icon, action }) => (
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  key={label}
                  onClick={() => {
                    action();
                    setMoreOpen(false);
                  }}
                >
                  <Icon />
                  {label}
                </Button>
              ))}
            </div>
          )}
        </DismissiblePopover>
      </div>
      <div
        className="scale-toolbar-actions scale-floating-surface flex h-14 items-center gap-1 rounded-2xl border border-border/60 p-2"
        role="group"
        aria-label="Edit topology"
      >
        <div className="flex items-center" role="group" aria-label="History">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Undo"
            aria-keyshortcuts="Control+Z Meta+Z"
            title="Undo (Ctrl/⌘ Z)"
            disabled={!props.canUndo}
            onClick={props.onUndo}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Redo"
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
            title="Redo (Ctrl/⌘ Shift Z)"
            disabled={!props.canRedo}
            onClick={props.onRedo}
          >
            <Redo2 />
          </Button>
        </div>
        <span className="mx-1 h-5 w-px bg-border/70" aria-hidden="true" />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Auto layout"
          title="Arrange nodes"
          disabled={!props.hasNodes}
          onClick={props.onLayout}
        >
          <LayoutGrid />
        </Button>
        <DismissiblePopover open={adding} onOpenChange={setAdding} className="ms-auto">
          <Button
            className="h-9 gap-1.5 px-2.5"
            aria-label="Add node"
            aria-expanded={adding}
            aria-controls="scale-resources"
            disabled={!props.canAdd}
            onClick={() => setAdding(!adding)}
          >
            <Plus />
            Add node
          </Button>
          {adding && (
            <div
              id="scale-resources"
              className="absolute end-0 top-full z-30 mt-2 max-h-[calc(100dvh-176px)] w-80 max-w-full overflow-y-auto rounded-2xl border border-border bg-popover p-2 shadow-lg"
            >
              <p className="px-3 py-2 text-xs font-medium text-muted-foreground">Add to canvas</p>
              <ResourceMenu
                onAdd={(kind) => {
                  props.onAdd(kind);
                  setAdding(false);
                }}
              />
            </div>
          )}
        </DismissiblePopover>
      </div>
    </header>
  );
}
