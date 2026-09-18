// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { baseDictionary } from "@/i18n";
import { setDemoMode } from "@/lib/demo-mode";
import { NetworkFirewallRules, type NetworkFirewallServer } from "./NetworkFirewallRules";

const f = baseDictionary.servers.clusters.managed.firewallRules;
const servers: NetworkFirewallServer[] = [
  {
    serverId: "a",
    name: "Alpha",
    endpoint: "192.0.2.10",
    listenPort: 51820,
    providerId: "hetzner-dedicated",
  },
  { serverId: "b", name: "Beta", endpoint: "203.0.113.20", listenPort: 53000, providerId: "ovh" },
  {
    serverId: "c",
    name: "Gamma",
    endpoint: "198.51.100.30",
    listenPort: 54000,
    providerId: "custom",
  },
];
let root: Root;
let host: HTMLDivElement;
const write = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  write.mockReset().mockResolvedValue(undefined);
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(write);
  setDemoMode(false);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  setDemoMode(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(members = servers) {
  await act(async () =>
    root.render(
      <I18nProvider>
        <NetworkFirewallRules servers={members} />
      </I18nProvider>,
    ),
  );
}
function button(text: string) {
  const value = [...host.querySelectorAll("button")].find((node) => node.textContent === text);
  expect(value).toBeDefined();
  return value!;
}

describe("firewall rule guidance", () => {
  it("shows incoming and outgoing destination ports and copies both directions together", async () => {
    await render();
    expect(host.querySelector("tbody")?.textContent).toContain("203.0.113.20/32");
    expect(
      [...host.querySelectorAll("tbody tr td:last-child")].map((cell) => cell.textContent),
    ).toEqual(["51820", "51820"]);
    await act(async () => button(f.outbound).click());
    expect(
      [...host.querySelectorAll("tbody tr td:last-child")].map((cell) => cell.textContent),
    ).toEqual(["53000", "54000"]);
    await act(async () => button(f.copyRules).click());
    const template = write.mock.calls[0]![0] as string;
    expect(template).toContain("inbound\tallow\tudp\t203.0.113.20/32\tany\t192.0.2.10/32\t51820");
    expect(template).toContain("outbound\tallow\tudp\t192.0.2.10/32\tany\t198.51.100.30/32\t54000");
    expect(template).not.toContain("0.0.0.0/0");
    expect(button(f.copied)).toBeDefined();
  });

  it("waits for unresolved peers before allowing a complete copy, then updates in place", async () => {
    await render([servers[0]!, { ...servers[1]!, endpoint: "beta.example.test" }, servers[2]!]);
    expect(button(f.copyRules).disabled).toBe(true);
    expect(host.textContent).toContain(f.pending);
    expect(host.textContent).not.toContain("beta.example.test/32");
    await render();
    expect(button(f.copyRules).disabled).toBe(false);
    expect(host.textContent).not.toContain(f.pending);
  });

  it("reports a clipboard failure without claiming success", async () => {
    write.mockRejectedValue(new Error("Clipboard denied"));
    await render();
    await act(async () => button(f.copyRules).click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(f.copyFailed);
    expect(host.querySelector('[role="status"]')?.textContent).toBe("");
    expect(button(f.copyRules).disabled).toBe(false);
  });

  it("keeps addresses blurred in demo mode and copies the actual requested CIDR", async () => {
    setDemoMode(true);
    await render();
    expect([...host.querySelectorAll('[class*="blur-"]')].map((item) => item.textContent)).toEqual([
      "192.0.2.10/32",
      "203.0.113.20/32",
      "198.51.100.30/32",
    ]);
    const copy = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${f.copy} ${f.sourceCidr}"]`,
    )!;
    await act(async () => copy.click());
    expect(write).toHaveBeenCalledWith("203.0.113.20/32");
    expect(copy.getAttribute("title")).not.toContain("203.0.113.20");
  });
});
