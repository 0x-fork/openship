import { AppError } from "@repo/core";
import { reportCaughtError } from "@repo/core/diagnostics";
import { inspectDockerSwarm } from "@repo/adapters";
import type { ServerDependencies } from "../../../servers";
import { createServerDockerRuntime } from "../../lib/deployment-runtime";
import { assertServerExecution, requireSelfHostedServer } from "./server-access";

export const serverSwarmResources = {
  async inspectSwarm(ctx, id, input = {}) {
    const server = await requireSelfHostedServer(ctx, id);
    await assertServerExecution(server);
    const runtime = await createServerDockerRuntime(id, ctx.organizationId);
    try {
      return await inspectDockerSwarm(runtime.docker, input.details === true);
    } catch (error) {
      if (error instanceof AppError) throw error;
      reportCaughtError(error, "platform/engine/modules/system/server-swarm.operations");
      throw new AppError(
        "Could not inspect Docker Swarm. Check the server connection and Docker daemon, then try again.",
        502,
        "SWARM_INSPECTION_UNAVAILABLE",
      );
    } finally {
      await runtime.dispose();
    }
  },
} satisfies Pick<ServerDependencies["resources"], "inspectSwarm">;
