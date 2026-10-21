import { describe, expect, it } from "vitest";
import { getRuntimeVersionProbe, parseRuntimeVersionProbe } from "../src/runtime-verification";

describe("deployed interpreter probes", () => {
  it.each([
    [{ framework: "nextjs" }, "node"],
    [{ framework: "nextjs", packageManager: "bun" }, "bun"],
    [{ framework: "fastapi" }, "python"],
    [{ framework: "laravel" }, "php"],
    [{ framework: "rails" }, "ruby"],
    [{ framework: "springboot" }, "java"],
    [{ framework: "dotnet" }, "dotnet"],
    [{ framework: "phoenix" }, "elixir"],
    [{ imageRef: "wordpress:7.1.3-php8.3-apache" }, "php"],
    [{ imageRef: "denoland/deno:latest" }, "deno"],
  ])("selects existing runtime policy for %j", (input, runtime) => {
    expect(getRuntimeVersionProbe(input)).toMatchObject({
      runtime,
      command: expect.stringContaining("head -c 128"),
    });
  });

  it.each(["go", "gin", "rust", "axum"])(
    "does not pretend a compiler in %s is its production runtime",
    (framework) => {
      expect(getRuntimeVersionProbe({ framework })).toMatchObject({
        reason: expect.stringContaining("Compiled application"),
      });
      expect(getRuntimeVersionProbe({ framework })).not.toHaveProperty("command");
    },
  );

  it("does not interpolate unknown image/configuration text into fixed discovery commands", () => {
    const probe = getRuntimeVersionProbe({
      framework: "unknown; print secret",
      imageRef: "registry.test/app:$(cat /secret)",
    });
    expect(probe.runtime).toBeNull();
    expect(probe.command).not.toContain("secret");
    expect(probe.command).not.toContain("registry.test");
    expect(probe.command).toContain("command -v php");
  });

  it.each([
    "node:22.20.0",
    "bun:1.3.14",
    "deno:2.5.0",
    "python:3.13.9",
    "php:8.4.15",
    "ruby:3.4.6",
    "java:21.0.9+10-LTS",
    "dotnet:8.0.21",
    "elixir:1.18.4",
  ])("parses an observed %s version", (value) => {
    const [runtime, version] = value.split(":");
    expect(parseRuntimeVersionProbe(`openship-runtime:${value}\n`)).toEqual({ runtime, version });
  });

  it.each([
    "PHP 8.4.15",
    "openship-runtime:php:8.4.15 secret",
    "openship-runtime:php:8.4.15\u0000",
    `openship-runtime:node:${"1".repeat(81)}`,
    "x".repeat(1025),
  ])("ignores arbitrary or oversized command output", (output) => {
    expect(parseRuntimeVersionProbe(output)).toBeNull();
  });
});
