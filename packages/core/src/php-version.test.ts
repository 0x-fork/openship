import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PHP_VERSIONS,
  phpNeedsInstall,
  assertPhpVersionTarget,
  phpProjectUpdate,
  resolvePhpImages,
} from "./php-version";
import { parseOpenshipConfig } from "./openship-config/parse";

describe("PHP selection", () => {
  it("keeps the editor schema in sync with the supported version catalog", () => {
    const schema = JSON.parse(
      readFileSync(
        new URL("../../../apps/web/public/openship.schema.json", import.meta.url),
        "utf8",
      ),
    );
    expect(schema.properties.phpVersion.enum).toEqual([...PHP_VERSIONS]);
  });
  it("requires Composer for selected PHP sources without changing legacy defaults", () => {
    expect(phpNeedsInstall("8.3", "composer install")).toBe(true);
    expect(phpNeedsInstall(undefined, "composer install")).toBe(false);
    expect(phpNeedsInstall("8.3", "")).toBe(false);
  });

  it.each(["8.3", "8.4"])("resolves a matching %s pair", (version) => {
    expect(resolvePhpImages(version)).toEqual({
      phpVersion: version,
      buildImage: `php:${version}-cli-bookworm`,
      runtimeImage: `dunglas/frankenphp:1-php${version}-bookworm`,
    });
    expect(parseOpenshipConfig({ phpVersion: version }).errors).toEqual([]);
  });
  it.each(["8.1", "8.5", "8", "8.3.1", "8.3\nFROM evil", 8.3])(
    "refuses unsupported selection %s",
    (version) => {
      expect(() => resolvePhpImages(version)).toThrow(/Unsupported phpVersion/);
      expect(parseOpenshipConfig({ phpVersion: version }).errors).not.toEqual([]);
    },
  );
  it("keeps a custom matching builder and rejects an incompatible one", () => {
    expect(resolvePhpImages("8.3", "php:8.3.30-cli-bookworm").buildImage).toBe(
      "php:8.3.30-cli-bookworm",
    );
    expect(resolvePhpImages("8.3", "example/php-builder:custom").buildImage).toBe(
      "example/php-builder:custom",
    );
    expect(() => resolvePhpImages("8.3", "php:8.4-cli")).toThrow(/uses PHP 8.4/);
    expect(() => resolvePhpImages("8.3", "php:8.3-cli\nRUN echo bad")).toThrow(
      /valid Docker image/,
    );
  });
  it("preserves omission and only replaces a previously managed default", () => {
    expect(phpProjectUpdate({ buildImage: "php:8.4-cli" }, {})).toEqual({});
    expect(phpProjectUpdate({ buildImage: "php:8.4-cli" }, { phpVersion: "8.3" })).toEqual({
      phpVersion: "8.3",
      buildImage: "php:8.3-cli-bookworm",
    });
    expect(
      phpProjectUpdate(
        { phpVersion: "8.3", buildImage: "php:8.3-cli-bookworm" },
        { phpVersion: "8.4" },
      ),
    ).toEqual({ phpVersion: "8.4", buildImage: "php:8.4-cli-bookworm" });
    expect(() =>
      phpProjectUpdate(
        { phpVersion: "8.3", buildImage: "php:8.3.30-cli-bookworm" },
        { phpVersion: "8.4" },
      ),
    ).toThrow(/uses PHP 8.3/);
    expect(
      phpProjectUpdate(
        { phpVersion: "8.3", buildImage: "php:8.3-cli-bookworm" },
        { phpVersion: null },
      ),
    ).toEqual({ phpVersion: null, buildImage: "php:8.4-cli" });
    expect(
      phpProjectUpdate(
        { phpVersion: "8.3", buildImage: "example/php-builder:custom" },
        { phpVersion: null },
      ),
    ).toEqual({ phpVersion: null, buildImage: "example/php-builder:custom" });
  });
  it.each([
    { runtimeMode: "bare" },
    { framework: "node" },
    { projectType: "monorepo" },
    { composePath: "compose.yml" },
    { sourceKind: "image" },
    { buildKind: "dockerfile" },
    { workloadType: "static" },
  ])("refuses unsupported targets %j", (override) => {
    expect(() =>
      assertPhpVersionTarget({ phpVersion: "8.3", framework: "laravel", ...override }),
    ).toThrow(/generated PHP Docker/);
    expect(() => assertPhpVersionTarget({ ...override })).not.toThrow();
  });
});
