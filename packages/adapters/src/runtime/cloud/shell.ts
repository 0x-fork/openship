import { PassThrough, Writable } from "node:stream";
import type { Runtime } from "oblien";
import type { ShellOptions, ShellSession } from "../../types";

/** Shared provider PTY adapter for service and managed-server terminals. */
export async function openCloudShell(rt: Runtime, opts?: ShellOptions): Promise<ShellSession> {
  const cols = clampShellWindow(opts?.cols, 80, 1000);
  const rows = clampShellWindow(opts?.rows, 24, 500);
  const session = await rt.terminal.create({ shell: "/bin/sh", cols, rows });
  const terminalId = String(session.id);
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const listeners = new Set<(code: number | null, signal?: string) => void>();
  let exit: { code: number | null; signal?: string } | null = null;
  let cleanup: Promise<void> | undefined;
  let socket: ReturnType<Runtime["ws"]> | undefined;
  let rejectOpen: (error: Error) => void = () => {};

  stdout.on("error", () => {
    void finish();
  });
  stderr.on("error", () => {
    void finish();
  });
  stdout.on("close", () => {
    void finish();
  });
  stderr.on("close", () => {
    void finish();
  });

  function finish(code: number | null = null, signal?: string): Promise<void> {
    if (exit) return cleanup ?? Promise.resolve();
    exit = { code, signal };
    cleanup = Promise.resolve()
      .then(() => rt.terminal.close(terminalId))
      .then(
        () => {},
        () => {},
      );
    rejectOpen(new Error("The server terminal connection closed before it was ready"));
    try {
      socket?.close();
    } catch {
      /* socket already gone */
    }
    stdout.end();
    stderr.end();
    for (const listener of listeners) {
      try {
        listener(code, signal);
      } catch {
        /* isolate subscriber failures */
      }
    }
    listeners.clear();
    return cleanup;
  }

  try {
    socket = rt.ws({ reconnect: false });
    const ws = socket;
    ws.onTerminalOutput((id, bytes) => {
      if (id !== terminalId || exit) return;
      // No flow-control method exists in the provider socket. Bound output while
      // the consumer attaches or stalls instead of buffering indefinitely.
      if (stdout.readableLength + stdout.writableLength + bytes.byteLength > 1024 * 1024) {
        void finish(null, "output_overflow");
        return;
      }
      stdout.write(Buffer.from(bytes));
    });
    ws.onTerminalExit((id, code) => {
      if (id === terminalId) void finish(code ?? null);
    });
    ws.onClose(() => {
      void finish();
    });
    ws.onError(() => {
      void finish();
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        rejectOpen = reject;
        ws.onOpen(resolve);
        timeout = setTimeout(
          () => reject(new Error("The server terminal connection timed out")),
          15_000,
        );
        ws.connect();
      });
      if (exit) throw new Error("The server terminal connection closed before it was ready");
    } finally {
      clearTimeout(timeout);
    }

    const stdin = new Writable({
      write(chunk, _encoding, callback) {
        if (exit) {
          callback(new Error("The server terminal is closed"));
          return;
        }
        try {
          ws.writeTerminalInput(terminalId, chunk);
          callback();
        } catch (error) {
          callback(error instanceof Error ? error : new Error("Terminal input failed"));
        }
      },
      final(callback) {
        void finish().then(() => callback());
      },
    });
    stdin.on("error", () => {
      void finish();
    });
    return {
      stdin,
      stdout,
      stderr,
      setWindow(c, r) {
        if (exit) return;
        try {
          ws.resizeTerminal(
            terminalId,
            clampShellWindow(c, 80, 1000),
            clampShellWindow(r, 24, 500),
          );
        } catch {
          void finish();
        }
      },
      close: async () => {
        await finish();
      },
      onClose(listener) {
        if (exit) listener(exit.code, exit.signal);
        else listeners.add(listener);
      },
    };
  } catch (error) {
    await finish();
    throw error;
  }
}

function clampShellWindow(value: number | undefined, fallback: number, max: number): number {
  return Math.max(1, Math.min(max, Math.floor(Number.isFinite(value) ? value! : fallback)));
}
