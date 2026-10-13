import { expect, it } from "vitest";
import { normalizeComposeServices } from "../src/compose";

it("keeps Compose host mappings in the SDK sync payload", () => {
  const [service] = normalizeComposeServices(
    {
      services: {
        webmail: { image: "webmail:test", extra_hosts: { "mail.example.com": "host-gateway" } },
      },
    },
    "/tmp",
  );
  expect(service?.advanced?.extraHosts).toEqual({ "mail.example.com": "host-gateway" });
});
it("refuses invalid Compose host mappings instead of dropping them", () => {
  expect(() =>
    normalizeComposeServices(
      { services: { webmail: { image: "webmail:test", extra_hosts: { mail: "invalid" } } } },
      "/tmp",
    ),
  ).toThrow(/addresses/);
});
