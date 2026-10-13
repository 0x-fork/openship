import { describe, expect, it } from "vitest";
import { isComposeDuration, parseComposeDurationNs } from "./duration";

const S = 1_000_000_000;

describe("compose durations", () => {
  it("reads compose/Go durations and bare seconds", () => {
    expect(parseComposeDurationNs("90s")).toBe(90 * S);
    expect(parseComposeDurationNs("1m30s")).toBe(90 * S);
    expect(parseComposeDurationNs("1h2m3s")).toBe(3723 * S);
    expect(parseComposeDurationNs("500ms")).toBe(S / 2);
    expect(parseComposeDurationNs("1.5s")).toBe(1.5 * S);
    expect(parseComposeDurationNs("30")).toBe(30 * S);
    expect(parseComposeDurationNs(30)).toBe(30 * S);
    expect(parseComposeDurationNs(" 90s ")).toBe(90 * S);
    expect(parseComposeDurationNs("0s")).toBe(0);
  });

  // The bug this exists for: a scan for unit groups read these as SOME duration,
  // shorter than or unrelated to what was written, and applied it silently.
  it("reads a partial match as no duration at all, never as part of one", () => {
    for (const value of ["1m30", "abc5s", "5s junk", "10 m", "1m 30s", "30S", "-5s", ".5s"]) {
      expect(parseComposeDurationNs(value), value).toBeUndefined();
    }
  });

  it("treats absent and blank as unset", () => {
    expect(parseComposeDurationNs(undefined)).toBeUndefined();
    expect(parseComposeDurationNs(null)).toBeUndefined();
    expect(parseComposeDurationNs("")).toBeUndefined();
    expect(parseComposeDurationNs("   ")).toBeUndefined();
  });

  it("validates exactly what it parses", () => {
    for (const value of ["90s", "1m30s", "500ms", "30", "1m30", "soon", "abc5s"]) {
      expect(isComposeDuration(value), value).toBe(parseComposeDurationNs(value) !== undefined);
    }
  });
});
