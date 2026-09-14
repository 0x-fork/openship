import { describe, expect, it } from "vitest";
import { envRevealSource } from "./env-reveal-source";
import type { PrepareProjectSource } from "@/lib/api/deploy";

const base = { serviceName: "postgres" };

describe("envRevealSource", () => {
  it("prefers the upload session while a scan is open", () => {
    // The scanned values are the ones on screen and may not be saved anywhere yet, so
    // a service row would be answering about a different, older set.
    expect(
      envRevealSource({ ...base, uploadSessionId: "sess_1", projectId: "p1", serviceId: "s1" }),
    ).toEqual({ kind: "upload", sessionId: "sess_1", service: "postgres" });
  });

  it("scopes an upload reveal to the one service", () => {
    const src = envRevealSource({ ...base, uploadSessionId: "sess_1" });
    // Carried through so the request names ONE service — a session-wide reveal would
    // hand back every sibling's secrets too.
    expect(src).toMatchObject({ service: "postgres" });
  });

  it("falls back to the persisted service's stored env", () => {
    // The regression this file exists for: an edit of an existing compose project had
    // no source at all, so its masked rows rendered with no way to reveal them.
    expect(envRevealSource({ ...base, projectId: "p1", serviceId: "s1" })).toEqual({
      kind: "service",
      projectId: "p1",
      serviceId: "s1",
    });
  });

  it("needs BOTH ids for the service source", () => {
    // The endpoint is addressed by service id UNDER a project; either alone is not a
    // question we can ask.
    expect(envRevealSource({ ...base, projectId: "p1" })).toBeNull();
    expect(envRevealSource({ ...base, serviceId: "s1" })).toBeNull();
  });

  it.each<PrepareProjectSource>([
    { owner: "acme", repo: "app", branch: "preview", composePath: "deploy/stack.yml", env: { PASSWORD: "typed" } },
    { source: "local", path: "/work/app", composePath: "deploy/stack.yml" },
  ])("reveals a fresh scan without requiring a saved project or upload", preparedSource => {
    expect(envRevealSource({ ...base, preparedSource })).toEqual({
      kind: "prepared", source: preparedSource, service: "postgres",
    });
  });

  it("uses the newly scanned source even when a service id was retained", () => {
    const preparedSource = { owner: "acme", repo: "app", branch: "next" };
    expect(envRevealSource({ ...base, preparedSource, projectId: "p1", serviceId: "s1" })).toEqual({
      kind: "prepared", source: preparedSource, service: "postgres",
    });
    expect(envRevealSource({ ...base, preparedSource, uploadSessionId: "sess_2" })).toEqual({
      kind: "upload", sessionId: "sess_2", service: "postgres",
    });
  });

  it("has no source when no scan or saved row is known", () => {
    expect(envRevealSource(base)).toBeNull();
  });

  it("treats empty strings as absent, not as ids", () => {
    // A blank id would build a request to `/projects//services//env-reveal`.
    expect(envRevealSource({ ...base, uploadSessionId: "" })).toBeNull();
    expect(envRevealSource({ ...base, projectId: "", serviceId: "s1" })).toBeNull();
    expect(envRevealSource({ ...base, projectId: "p1", serviceId: "" })).toBeNull();
  });
});
