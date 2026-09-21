import { safeErrorMessage } from "@repo/core";
import type { ExecutionContext } from "../../../context";
import type { EventSubscription } from "../../../event-stream";
import { audit, operationAuditContext } from "../../lib/audit-emitter";
import { trackBackgroundWork } from "../../lib/background-work";
import { canRouteSelfApp } from "../../lib/self-app-routing";
import { verifyProjectRoutingDomains } from "../domains/domain.operations";
import { retryProjectRouting } from "./project-runtime.service";

/** JSON and streaming callers run exactly the same repair and checks. */
export async function retryProjectRoutingOperation(
  ctx: ExecutionContext,
  id: string,
  onLog?: (message: string) => void,
) {
  const isSelfApp = await canRouteSelfApp(ctx, id);
  const result = await retryProjectRouting(id, ctx.organizationId, {
    isSelfApp,
    onLog,
    verifyDomains: () => verifyProjectRoutingDomains(ctx, id, onLog),
  });
  audit.recordAsync(operationAuditContext(ctx), {
    eventType: "project.updated",
    resourceType: "project",
    resourceId: id,
    after: { action: "routing_retried", ok: result.ok },
  });
  return result;
}

export function subscribeRoutingRetry(ctx: ExecutionContext, id: string): EventSubscription {
  return (write) => {
    let closed = false;
    const emit = (event: string, data: unknown) => {
      if (!closed) write(event, JSON.stringify(data));
    };
    emit("session", { type: "session" });
    // Closing the log viewer stops delivery, not a route write or certificate
    // order already in flight. The instance drains the work during shutdown.
    void trackBackgroundWork(
      (async () => {
        try {
          const result = await retryProjectRoutingOperation(ctx, id, (message) => {
            emit("log", { type: "log", message, level: "info" });
          });
          emit("log", {
            type: "log",
            message: result.warning ?? "Routing and domain checks completed.",
            level: result.ok ? "info" : "error",
          });
          emit("complete", { type: "complete", status: result.ok ? "completed" : "failed" });
        } catch (error) {
          emit("log", { type: "log", message: safeErrorMessage(error), level: "error" });
          emit("complete", { type: "complete", status: "failed" });
        }
      })(),
    );
    return {
      success: true,
      unsubscribe: () => {
        closed = true;
      },
    };
  };
}
