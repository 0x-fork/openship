import { Command } from "commander";
import {
  ResizeManagedServerInputSchema,
  RemoveManagedServerInputSchema,
  parseInput,
} from "@repo/contracts";
import { getShipClient } from "../lib/ship-client";
import { confirmOrExit, printResult } from "../lib/cmd-helpers";

export const managedServerCommand = new Command("managed").description(
  "Manage subscription-owned Cloud servers and connected Cloud destinations",
);
managedServerCommand
  .command("list")
  .alias("ls")
  .description("List managed servers visible to this connection")
  .action(() =>
    printResult(async () => {
      const { servers } = await getShipClient().servers.destinations();
      return servers.filter(
        (server) => server.managed || server.connection === "cloud" || server.source === "cloud",
      );
    }),
  );
managedServerCommand
  .command("available")
  .description("List Cloud servers available to link to this installation")
  .action(() => printResult(() => getShipClient().servers.availableManaged()));
managedServerCommand
  .command("connect")
  .argument("<id>", "Authorized Cloud server ID")
  .description("Connect an existing Cloud server using the verified installation binding")
  .action((serverId: string) =>
    printResult(() => getShipClient().servers.connectManaged({ serverId })),
  );
managedServerCommand
  .command("create")
  .argument("<name>", "New managed server name")
  .description(
    "Create a managed server entry; use billing subscription create to purchase its plan",
  )
  .action((name: string) => printResult(() => getShipClient().servers.createManaged({ name })));
managedServerCommand
  .command("ensure")
  .argument("<id>", "Managed server ID")
  .description("Ensure this subscribed server is provisioned through its lifecycle worker")
  .action((id: string) => printResult(() => getShipClient().servers.ensure(id)));
managedServerCommand
  .command("resize-preview")
  .argument("<id>", "Managed server ID")
  .description("Inspect pending capacity changes, their revision and affected projects")
  .action((id: string) => printResult(() => getShipClient().servers.previewResize(id)));
managedServerCommand
  .command("resize")
  .argument("<id>", "Managed server ID")
  .description("Apply the exact reviewed capacity revision through the existing server worker")
  .requiredOption("--revision <hash>", "Revision from resize-preview")
  .requiredOption("--idempotency-key <key>", "Stable key for this resize")
  .requiredOption("--confirm-restart", "Acknowledge the affected-project restarts")
  .option("-y, --yes", "Confirm this resize")
  .action((id: string, opts) =>
    printResult(async () => {
      const input = parseInput(ResizeManagedServerInputSchema, {
        revision: opts.revision,
        confirmRestart: opts.confirmRestart,
        idempotencyKey: opts.idempotencyKey,
      });
      await confirmOrExit(
        opts.yes,
        `Apply this capacity revision and restart the listed projects on ${id}?`,
      );
      return getShipClient().servers.resize(id, input);
    }),
  );
managedServerCommand
  .command("retry")
  .argument("<id>", "Managed server ID")
  .description("Retry the existing lifecycle operation without replacing its retained disk")
  .action((id: string) => printResult(() => getShipClient().servers.retry(id)));
managedServerCommand
  .command("remove")
  .alias("rm")
  .argument("<id>", "Managed server ID")
  .description("Request managed server deletion through its guarded lifecycle workflow")
  .requiredOption("--idempotency-key <key>", "Stable key for this deletion")
  .option("-y, --yes", "Confirm server deletion")
  .action((id: string, opts) =>
    printResult(async () => {
      const input = parseInput(RemoveManagedServerInputSchema, {
        confirmDelete: true,
        idempotencyKey: opts.idempotencyKey,
      });
      await confirmOrExit(opts.yes, `Delete managed server ${id}?`);
      return getShipClient().servers.removeManaged(id, input);
    }),
  );
