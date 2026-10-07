"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@repo/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { OptionCard } from "@/components/shared/OptionCard";
import ServerSelector, { type ServerOption } from "@/components/shared/ServerSelector";
import { instanceApi, type InstanceStatus, type InstanceHostMapping } from "@/lib/api/instance";
import { ApiError, getApiErrorMessage } from "@/lib/api/client";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { parseInstanceAddress } from "@/lib/instance-address";
import { UpgradeAuthModal } from "./UpgradeAuthModal";

type Action = "move" | "receive" | "send" | "connect" | "pair" | "return" | "previous";
const pending = (state: InstanceStatus) =>
  !!state.handoff && !["complete", "aborted"].includes(state.handoff.status);

export function instanceProgress(state: InstanceStatus): string {
  if (!state.handoff) return "Connecting to your instance";
  if (state.handoff.status === "complete") return "Connected to the active instance";
  if (state.role === "quiescing") return "Waiting for current operations to finish";
  if (state.handoff.provisioning && state.role === "active")
    return "Preparing Openship on your server";
  return {
    offered: "Waiting for the other instance",
    frozen: "Transferring your instance",
    copying: "Receiving your instance",
    prepared: "Verifying the handoff",
    retired: "Connecting to the new control plane",
    aborted: "Move cancelled",
  }[state.handoff.status];
}

/** Used both in Settings and by the recovery screen before the normal shell can
 * authenticate. Polling keeps its last state across an intentional API restart. */
export function useInstanceStatus(initial?: InstanceStatus) {
  const [state, setState] = useState(initial ?? null);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState<number>();
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const next = await instanceApi.status();
      if (mounted.current) {
        setState(next);
        setError("");
        setErrorStatus(undefined);
      }
      return next;
    } catch (err) {
      if (mounted.current) {
        setError(getApiErrorMessage(err));
        setErrorStatus(err instanceof ApiError ? err.status : undefined);
      }
      return null;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    if (errorStatus === 403)
      return () => {
        mounted.current = false;
      };
    const timer = setInterval(() => void refresh(), state && pending(state) ? 2_000 : 15_000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh, errorStatus, state?.handoff?.status]);
  return { state, error, errorStatus, refresh };
}

export function InstanceProgress({
  state,
  refresh,
}: {
  state: InstanceStatus;
  refresh: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const h = state.handoff;
  async function run(action: "resume" | "cancel") {
    setBusy(true);
    setError("");
    try {
      await instanceApi[action]();
      await refresh();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-xl bg-muted/30 p-4" aria-live="polite">
      <div className="flex items-center gap-2.5 text-sm font-medium">
        <Icon
          name={h?.error ? "alert-circle" : "spinner"}
          className={`size-4 shrink-0 ${h?.running ? "animate-spin" : ""}`}
        />
        {instanceProgress(state)}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Your apps stay on their servers. Openship pauses new operations while control moves.
      </p>
      {(error || h?.error) && (
        <p role="alert" className="whitespace-pre-line text-sm text-destructive">
          {error || h?.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!h?.running && (h?.peerOrigin || h?.provisioning) && (
          <Button size="sm" disabled={busy} onClick={() => void run("resume")}>
            Resume move
          </Button>
        )}
        {!h?.running && h && !["retired", "complete"].includes(h.status) && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run("cancel")}>
            Cancel move
          </Button>
        )}
        {h?.provisioning?.deploymentId && (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/deployments/${h.provisioning.deploymentId}`}>View deployment</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export function InstanceLocation({
  initial,
  recovering = false,
}: {
  initial?: InstanceStatus;
  recovering?: boolean;
}) {
  const { state, error, errorStatus, refresh } = useInstanceStatus(initial);
  const [action, setAction] = useState<Action | null>(null);
  const [setupAccount, setSetupAccount] = useState(false);
  const [actionError, setActionError] = useState("");
  const moved = useRef(false);
  useEffect(() => {
    if (!state) return;
    if (
      recovering &&
      state.role === "active" &&
      state.ready !== false &&
      (!state.handoff || ["aborted", "complete"].includes(state.handoff.status))
    ) {
      window.location.reload();
      return;
    }
    if (pending(state)) moved.current = true;
    if (
      moved.current &&
      state.handoff?.status === "complete" &&
      !state.handoff.running &&
      (state.role !== "active" || state.ready !== false)
    ) {
      moved.current = false;
      window.location.assign("/settings?tab=instance");
    }
  }, [state, recovering]);
  if (!state)
    return errorStatus === 403 ? (
      <section className="space-y-3 rounded-2xl bg-card p-5">
        <h2 className="text-[15px] font-semibold">Use Openship from Desktop</h2>
        <p className="text-sm text-muted-foreground">
          Connect your Desktop with the same access you have here.
        </p>
        <Button variant="secondary" onClick={() => setAction("pair")}>
          Pair a Desktop
        </Button>
        {action === "pair" && (
          <InstanceMoveDialog
            action="pair"
            onClose={() => setAction(null)}
            onStarted={async () => setAction(null)}
          />
        )}
      </section>
    ) : error ? null : (
      <div className="rounded-2xl bg-card p-5 text-sm text-muted-foreground">Loading instance…</div>
    );
  const remote = ["retired", "connected"].includes(state.role) && !!state.connection;
  const retiredServer = !state.desktop && state.role === "retired";
  return (
    <section className="space-y-4 rounded-2xl bg-card p-5" aria-label="Instance location">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/40">
            <Icon name={remote ? "server" : "monitor"} className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">Instance location</h2>
            <p className="mt-0.5 break-all text-sm text-muted-foreground">
              {remote
                ? state.connection!.origin.replace(/\/api\/proxy$/, "")
                : state.desktop
                  ? "This desktop"
                  : "This server"}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          {retiredServer ? "Control moved" : remote ? "Remote control" : "Local control"}
        </span>
      </div>
      {pending(state) ? (
        <InstanceProgress state={state} refresh={refresh} />
      ) : (
        <>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {retiredServer
              ? "This server has stopped managing your projects. Receive a move to make it the active instance again."
              : remote
                ? "Your work runs on the remote instance. Desktop is connected to its live data."
                : "Move Openship to a server for always-on jobs, webhooks and team access. Your projects stay on their current servers."}
          </p>
          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {remote && state.desktop ? (
              <Button onClick={() => setAction("return")}>Move back to Desktop</Button>
            ) : (
              !remote && (
                <Button
                  onClick={() =>
                    state.desktop && state.accountReady === false
                      ? setSetupAccount(true)
                      : setAction("move")
                  }
                >
                  Move to a server
                </Button>
              )
            )}
            {state.desktop && (
              <Button variant="secondary" onClick={() => setAction("connect")}>
                {remote ? "Reconnect" : "Connect to an instance"}
              </Button>
            )}
            {state.previousInstance && (
              <Button variant="secondary" onClick={() => setAction("previous")}>
                Move to previous server
              </Button>
            )}
            {!retiredServer && (
              <Button variant="ghost" onClick={() => setAction("pair")}>
                Pair a Desktop
              </Button>
            )}
            {(!remote || retiredServer) && (
              <Button
                variant={retiredServer ? "default" : "ghost"}
                onClick={() => setAction("receive")}
              >
                Receive a move
              </Button>
            )}
            {!remote && !state.desktop && (
              <Button variant="ghost" onClick={() => setAction("send")}>
                Move to Desktop
              </Button>
            )}
            {state.role === "connected" && (
              <Button
                variant="ghost"
                onClick={() => {
                  void instanceApi
                    .disconnect()
                    .then(() => window.location.assign("/settings?tab=instance"))
                    .catch((err) => setActionError(getApiErrorMessage(err)));
                }}
              >
                Return to local instance
              </Button>
            )}
          </div>
        </>
      )}
      {action && (
        <InstanceMoveDialog
          action={action}
          localHosts={state.localHosts}
          previousOrigin={state.previousInstance?.origin}
          onClose={() => setAction(null)}
          onStarted={async () => {
            setAction(null);
            await refresh();
          }}
        />
      )}
      {setupAccount && (
        <UpgradeAuthModal
          open
          onClose={() => setSetupAccount(false)}
          onSuccess={() => {
            setSetupAccount(false);
            void refresh().then(() => setAction("move"));
          }}
        />
      )}
    </section>
  );
}

function CodeField({
  value,
  onChange,
  label,
  readOnly = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  label: string;
  readOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">
        {label}
        <textarea
          aria-label={label}
          readOnly={readOnly}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          spellCheck={false}
          className="mt-2 min-h-24 w-full resize-y rounded-xl border-0 bg-background px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {readOnly && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy code"}
        </Button>
      )}
    </div>
  );
}

export function InstanceMoveDialog({
  action,
  localHosts = [],
  previousOrigin,
  onClose,
  onStarted,
}: {
  action: Action;
  localHosts?: InstanceStatus["localHosts"];
  previousOrigin?: string;
  onClose: () => void;
  onStarted: () => Promise<void>;
}) {
  const { dialog, onKeyDown } = useDialogFocus(onClose);
  const destinationId = useId();
  const confirmationId = useId();
  const [destination, setDestination] = useState<"server" | "existing">("server");
  const [server, setServer] = useState<ServerOption | null>(null);
  const [source, setSource] = useState<ServerOption | null>(null);
  const [access, setAccess] = useState<"desktop" | "browser">("desktop");
  const [kind, setKind] = useState<"custom" | "free">("custom");
  const [hostname, setHostname] = useState("");
  const [code, setCode] = useState("");
  const [generated, setGenerated] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const mapping: InstanceHostMapping | undefined =
    source && localHosts[0]
      ? { sourceServerId: localHosts[0].id, connectionServerId: source.id }
      : undefined;
  const title = {
    move: "Move your instance",
    receive: "Receive an instance",
    send: "Move to Desktop",
    connect: "Connect to an instance",
    pair: "Pair a Desktop",
    return: "Move back to Desktop",
    previous: "Move to previous server",
  }[action];
  const description = {
    move: "Your settings, users and credentials move together. Apps and volumes stay where they run.",
    receive: "Move another instance here, or create a code for it to send its data.",
    send: "Create a move code, then open Desktop → Settings → Instance → Receive a move. Control stays here until the Desktop completes the handoff.",
    connect: "Use an existing instance from Desktop. Its data stays on the remote server.",
    pair: "Create a one-time connection code for another Desktop. It connects as your current user.",
    return:
      "Transfer the latest remote data to this Desktop. The server stops managing your projects after the handoff.",
    previous: `Move your latest data to ${previousOrigin ?? "the previous server"}. Its saved data is replaced after a recovery snapshot is created.`,
  }[action];
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (action === "pair") {
        setGenerated((await instanceApi.pair()).code);
        return;
      }
      if (action === "send") {
        setGenerated((await instanceApi.offer("source", mapping)).code);
        return;
      }
      if (action === "connect") {
        const address = parseInstanceAddress(code.trim());
        if (address) {
          await instanceApi.connectAddress(address.origin);
          window.location.assign(address.nextPath);
        } else {
          await instanceApi.connect(code.trim());
          window.location.assign("/settings?tab=instance");
        }
        return;
      }
      if (action === "previous") await instanceApi.moveToPrevious(mapping);
      else if (action === "return") await instanceApi.returnToDesktop();
      else if (action === "receive") {
        if (!code.trim()) {
          setGenerated((await instanceApi.offer("target")).code);
          return;
        }
        await instanceApi.move(code.trim());
      } else if (destination === "existing") await instanceApi.move(code.trim(), mapping);
      else {
        await instanceApi.preflight(mapping);
        await instanceApi.provision({
          serverId: server!.id,
          access,
          domain: { kind, hostname: hostname.trim() },
          mapping,
        });
      }
      await onStarted();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const needsConfirmation = action !== "pair" && action !== "connect";
  const disabled =
    busy ||
    (needsConfirmation && !confirmed) ||
    (action === "connect" && !code.trim()) ||
    (action === "move" && (destination === "server" ? !server || !hostname.trim() : !code.trim()));
  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="min(680px, calc(100vw - 32px))"
      maxHeight="90dvh"
      width="100%"
      overflow="hidden"
      showCloseButton={false}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex max-h-[90dvh] min-h-0 flex-col outline-none"
        onKeyDown={onKeyDown}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </Button>
        </div>
        <div className="min-h-0 space-y-5 overflow-y-auto px-6 pb-5">
          {action === "move" && (
            <>
              <Tabs
                tabs={[
                  { key: "server", label: "Connected server" },
                  { key: "existing", label: "Existing instance" },
                ]}
                value={destination}
                onChange={setDestination}
                idPrefix={destinationId}
                ariaLabel="Destination type"
              />
              <div
                role="tabpanel"
                id={`${destinationId}-panel-server`}
                aria-labelledby={`${destinationId}-tab-server`}
                hidden={destination !== "server"}
                className="space-y-5"
              >
                <ServerSelector
                  value={server?.id ?? null}
                  onSelect={setServer}
                  forDeployment
                  excludeIds={localHosts.map((host) => host.id)}
                  label="Destination server"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <OptionCard
                    value="desktop"
                    selected={access === "desktop"}
                    onSelect={() => setAccess("desktop")}
                    icon={<Icon name="monitor" className="size-4" />}
                    label="Use through Desktop"
                    description="Deploy the API only. Keep this interface on your computer."
                  />
                  <OptionCard
                    value="browser"
                    selected={access === "browser"}
                    onSelect={() => setAccess("browser")}
                    icon={<Icon name="globe" className="size-4" />}
                    label="Desktop + browser"
                    description="Deploy the API and dashboard for browser access too."
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Instance address</span>
                    <Tabs
                      tabs={[
                        { key: "custom", label: "Custom" },
                        { key: "free", label: "Free" },
                      ]}
                      value={kind}
                      onChange={setKind}
                      size="sm"
                      ariaLabel="Domain type"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Instance address"
                      value={hostname}
                      onChange={(e) => setHostname(e.target.value)}
                      placeholder={kind === "custom" ? "openship.example.com" : "my-openship"}
                      variant="filled"
                    />
                    {kind === "free" && (
                      <span className="text-sm text-muted-foreground">.opsh.io</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {kind === "custom"
                      ? "Point this domain to the selected server. HTTPS is checked before your data moves."
                      : "Uses the selected server’s Cloud routing connection."}
                  </p>
                </div>
              </div>
              <div
                role="tabpanel"
                id={`${destinationId}-panel-existing`}
                aria-labelledby={`${destinationId}-tab-existing`}
                hidden={destination !== "existing"}
              >
                <CodeField value={code} onChange={setCode} label="Code from the other instance" />
              </div>
            </>
          )}
          {(action === "move" || action === "send" || action === "previous") &&
            localHosts.length > 0 && (
              <div className="space-y-2 rounded-xl bg-muted/30 p-4">
                <p className="text-sm font-medium">Keep access to {localHosts[0].name}</p>
                <p className="text-xs text-muted-foreground">
                  Choose its SSH connection so the new controller can still manage apps on this
                  host.
                </p>
                <ServerSelector
                  value={source?.id ?? null}
                  onSelect={setSource}
                  requiredCapability="ssh"
                  excludeIds={localHosts.map((host) => host.id)}
                  label="Source host connection"
                />
              </div>
            )}
          {(action === "connect" || action === "receive") && !generated && (
            <CodeField
              value={code}
              onChange={setCode}
              label={
                action === "connect"
                  ? "Instance address, invitation link or connection code"
                  : "Move code from the source (optional)"
              }
            />
          )}
          {action === "connect" && (
            <p className="text-xs text-muted-foreground">
              Sign in to the instance at this address, or get a connection code from its Settings →
              Instance → Pair a Desktop. Your local instance pauses while you are connected.
            </p>
          )}
          {action === "return" && (
            <p className="rounded-xl bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              Jobs and incoming webhooks will depend on this computer being online. Your project
              containers keep running on their servers.
            </p>
          )}
          {generated && (
            <>
              <CodeField label="One-time code" value={generated} readOnly />
              <p className="text-xs text-muted-foreground">
                Valid for 10 minutes. Paste it only into the Desktop or instance you want to
                connect.
              </p>
            </>
          )}
          {needsConfirmation && !generated && (
            <div className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
              <Checkbox
                id={confirmationId}
                checked={confirmed}
                onCheckedChange={setConfirmed}
                className="mt-1"
              />
              <label htmlFor={confirmationId}>
                {action === "receive" || action === "return"
                  ? "Replace this instance’s data with the incoming instance. A recovery snapshot is saved first."
                  : "Move all workspaces, users and credentials, and pause changes during the handoff."}
              </label>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="whitespace-pre-line rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 bg-muted/20 px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            {generated ? "Done" : "Cancel"}
          </Button>
          {!generated && (
            <Button disabled={disabled} onClick={() => void submit()}>
              {busy && <Icon name="spinner" className="animate-spin" />}
              {action === "pair"
                ? "Create connection code"
                : action === "connect"
                  ? "Connect"
                  : action === "return"
                    ? "Move to Desktop"
                    : action === "receive" && !code.trim()
                      ? "Create receive code"
                      : "Move instance"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
