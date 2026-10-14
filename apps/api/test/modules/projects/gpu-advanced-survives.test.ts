import { describe, expect, it } from "vitest";
import { mergeAdvanced } from "@repo/platform/engine/modules/services/service.service";

/**
 * `advanced.gpus` rides in the same JSONB blob as the other compose-owned keys. Adopting a running
 * container layers LIVE healthcheck/resources on top of the repo spec through `mergeAdvanced`, so
 * the GPU request must survive that merge or the next recreate would drop the card (the container
 * would come back on CPU, silently).
 */
describe("advanced.gpus through mergeAdvanced", () => {
  const gpus = { driver: "nvidia", count: "all" as const, capabilities: ["gpu"] };

  it("survives a live healthcheck/resources overlay (the adopt path)", () => {
    const next = mergeAdvanced(
      { gpus },
      { healthcheck: { test: "true" }, resources: { memoryMb: 512 } },
    );
    expect(next.gpus).toEqual(gpus);
    expect(next.healthcheck).toEqual({ test: "true" });
  });

  it("survives a PATCH that never mentions it", () => {
    expect(mergeAdvanced({ gpus }, { stopSignal: "SIGINT" }).gpus).toEqual(gpus);
  });

  it("is removed only by an explicit null", () => {
    expect(mergeAdvanced({ gpus }, { gpus: null }).gpus).toBeUndefined();
  });
});
