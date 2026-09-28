import { describe, expect, it } from "vitest";
import { resolvePasskeyRpId } from "./passkey-config";

describe("resolvePasskeyRpId", () => {
  it("binds a passkey to the configured public hostname", () => {
    expect(resolvePasskeyRpId("https://ship.ven.com.au/api/auth")).toBe("ship.ven.com.au");
  });

  it("keeps localhost valid while dropping its port", () => {
    expect(resolvePasskeyRpId(undefined, "http://localhost:4000")).toBe("localhost");
  });

  it("falls back safely when configured URLs are invalid", () => {
    expect(resolvePasskeyRpId("not a URL")).toBe("localhost");
  });
});
