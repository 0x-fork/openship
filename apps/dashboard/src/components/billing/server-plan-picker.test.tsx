// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRICING, pricingUi, resolvePlan, type CustomServerResources, type PlanTierId } from "@repo/core";
import type { BillingCustomQuote, BillingSubscription, CloudWorkspaceSummary } from "@repo/contracts";
import { I18nProvider } from "@/components/i18n-provider";
import { PlatformProvider } from "@/context/PlatformContext";
import { ModalProvider } from "@/context/ModalContext";
import { baseDictionary } from "@/i18n";
import { BillingPlanSummary } from "@/app/(dashboard)/billing/_components/billing-shared";
import { ManagedServerPurchase } from "@/components/servers/managed/ManagedServerPurchase";
import { ManagedServerSetup } from "@/components/servers/ServerAcquisition";
import { useAddServerModal } from "@/components/servers/add-server-modal";
import { BillingWorkspaceProvider } from "./BillingWorkspaceContext";
import { CloudPlanPicker } from "./CloudPlanPicker";
import type { ApiPlan } from "./PricingCards";
import type { BillingState } from "@/lib/api/billing";

const h = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), create: vi.fn(), available: vi.fn(), connect: vi.fn(), readServer: vi.fn(), selected: vi.fn(),
  user: "user-a", org: "org-a", connected: true,
}));
vi.mock("@/lib/api/client", async original => ({ ...await original<typeof import("@/lib/api/client")>(), api: { get: h.get, post: h.post } }));
vi.mock("@/lib/api/system", () => ({ systemApi: { createManagedServer: h.create, availableManagedServers: h.available, connectManagedServer: h.connect, getServerById: h.readServer } }));
vi.mock("@/lib/auth-client", () => ({ useSession: () => ({ data: { user: { id: h.user }, session: { activeOrganizationId: h.org } } }) }));
vi.mock("@/context/CloudContext", () => ({ useCloud: () => ({ connected: h.connected, startConnect: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const copy = baseDictionary.billing;
const plans: ApiPlan[] = (["hobby", "starter", "pro", "team"] as const).map(id => {
  const source = resolvePlan(id);
  return { ...source, features: [...source.features], resourceLimits: source.oblienLimits,
    listPrice: { monthly: source.price.monthly }, effectivePrice: { monthly: source.price.monthly }, campaign: null };
});
const offer = (id: PlanTierId) => plans.find(plan => plan.id === id)!;
const catalog = { data: { plans, custom: PRICING.custom, ui: pricingUi("en"), annual: { enabled: false, monthsFree: 0 } } };
const subscription = (tier: PlanTierId): BillingSubscription => ({
  tier, configuration: "preset", status: "active", interval: "monthly", offerReference: `saved-${tier}`,
  currentPeriod: { start: "2026-10-01T00:00:00Z", end: "2026-11-01T00:00:00Z" },
  cancelAtPeriodEnd: false, canceledAt: null,
});
const server: CloudWorkspaceSummary = {
  id: "cws-new", serverId: "server-new", name: "Production", planTierId: "free", subscriptionStatus: "active",
  state: "needs_plan", projectCount: 0, operation: null, resources: null, createdAt: "2026-10-01T00:00:00Z",
};
function customQuote(resources: CustomServerResources): BillingCustomQuote {
  return { basePlanTierId: "team", reference: `quoted-${resources.cpuCores}-${resources.memoryMb}-${resources.diskGb}`,
    resources, priceCents: 9900 + (resources.cpuCores - 8) * 500, currency: "usd", monthlyCredits: offer("team").monthlyCredits!,
    breakdown: { basePriceCents: 9900, cpuCents: (resources.cpuCores - 8) * 500, memoryCents: 0, diskCents: 0 } };
}
let root: Root;
let host: HTMLDivElement;
let popup: { opener: object | null; closed: boolean; location: { href: string }; close: ReturnType<typeof vi.fn> };
const render = (node: ReactNode, selfHosted = false) => act(async () => root.render(
  <I18nProvider><PlatformProvider selfHosted={selfHosted}>{node}</PlatformProvider></I18nProvider>,
));
const buttons = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].filter(button => button.textContent?.trim() === label);
const click = (label: string) => act(async () => {
  const button = buttons(label)[0]; expect(button, label).toBeDefined(); button!.click();
});
const planNames = () => [...host.querySelectorAll("article h3")].map(heading => heading.textContent);
function input(label: string) {
  const field = [...host.querySelectorAll("label")].find(node => node.textContent?.includes(label));
  return field?.querySelector("input") ?? document.getElementById(field?.htmlFor ?? "") as HTMLInputElement | null;
}
async function edit(field: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const flushQuote = () => act(async () => { await vi.advanceTimersByTimeAsync(250); });
function picker(tier: PlanTierId, extra: Partial<React.ComponentProps<typeof CloudPlanPicker>> = {}) {
  return <CloudPlanPicker workspaceId="cws-production" currentPlan={tier} currentOffer={offer(tier)}
    subscription={subscription(tier)} billingEnabled canChangeSubscription {...extra} />;
}

function AddServerFromProject() {
  const addServer = useAddServerModal();
  return <><input aria-label="Project name" defaultValue="Keep this project" /><button onClick={() => addServer(h.selected)}>Add a destination</button></>;
}

beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.user = "user-a"; h.org = "org-a"; h.connected = true;
  h.get.mockImplementation(async (path, options) => path.endsWith("/quote")
    ? { data: customQuote(options.params) } : catalog);
  h.create.mockResolvedValue(server);
  h.readServer.mockResolvedValue({ id: server.serverId, name: server.name, managed: server });
  h.available.mockResolvedValue({ servers: [] });
  h.post.mockResolvedValue({ data: { checkoutUrl: "https://checkout.example.test/new-server" } });
  popup = { opener: {}, closed: false, location: { href: "about:blank" }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("plans for an existing server", () => {
  it("shows the saved paid plan once and offers only larger presets by default", async () => {
    await render(<><BillingPlanSummary compact state={{ tier: "starter", status: "active", plan: offer("starter"), subscription: subscription("starter") } as BillingState} />{picker("starter")}</>);
    expect(host.querySelector('section[aria-label="Current plan"]')?.textContent).toContain("Starter");
    expect(host.querySelector('section[aria-label="Current plan"]')?.textContent).toContain("$20");
    expect(planNames()).toEqual(["Pro", "Scale"]);
    expect(host.textContent).toContain(copy.plansRoute.upgradeServer);
    expect(h.post).not.toHaveBeenCalled();
  });

  it("keeps lower-cost choices behind Other plans and reviews them against the selected server", async () => {
    // No allocated disk in this fixture: the preview still validates actual disk size.
    await render(picker("starter"));
    await click(copy.plansRoute.otherPlans);
    expect(planNames()).toContain("Hobby");
    expect(host.textContent).toContain(copy.plansRoute.otherPlansHint);
    h.post.mockRejectedValueOnce(new Error("Preview offline"));
    await click(copy.planChange.review);
    expect(h.post).toHaveBeenCalledWith("billing/subscription/change/preview", expect.objectContaining({ workspaceId: "cws-production", planTierId: "hobby" }));
    await click(copy.plansRoute.backToUpgrades);
    expect(planNames()).toEqual(["Pro", "Scale"]);
  });

  it("opens Custom from Scale with the saved resources and disables an unchanged purchase", async () => {
    vi.useFakeTimers();
    await render(picker("team", { allocatedDiskGb: 256 }));
    expect(host.querySelector('form[aria-label="Size your server"]')).not.toBeNull();
    expect(input(copy.custom.cpu)?.value).toBe("8");
    expect(input(copy.custom.memory)?.value).toBe("32");
    expect(input(copy.custom.disk)?.value).toBe("256");
    await flushQuote();
    expect(buttons(copy.pricing.currentPlan)[0]?.disabled).toBe(true);
    await edit(input(copy.custom.cpu)!, "9");
    expect(buttons(copy.planChange.review)[0]?.disabled).toBe(true);
    await flushQuote();
    h.post.mockRejectedValueOnce(new Error("Preview offline"));
    await click(copy.planChange.review);
    expect(h.post).toHaveBeenCalledExactlyOnceWith("billing/subscription/change/preview", expect.objectContaining({
      workspaceId: "cws-production", custom: { resources: { cpuCores: 9, memoryMb: 32768, diskGb: 256 }, quoteReference: "quoted-9-32768-256" },
    }));
    expect(h.post.mock.calls.some(([path]) => path === "billing/subscription")).toBe(false);
  });

  it("resets custom inputs and pending quotes when switching to another server", async () => {
    vi.useFakeTimers();
    await render(picker("team")); await flushQuote();
    await edit(input(copy.custom.cpu)!, "12");
    await render(picker("pro", { workspaceId: "cws-staging" }));
    expect(planNames()).toEqual(["Scale"]);
    await click(copy.custom.name); await flushQuote();
    expect(input(copy.custom.cpu)?.value).toBe("4");
    expect(input(copy.custom.memory)?.value).toBe("16");
    expect(h.post).not.toHaveBeenCalled();
  });

  it("restores an inactive server through its own checkout without offering smaller disks", async () => {
    await render(picker("free", { currentOffer: null, subscription: null, preserveProject: true, allocatedDiskGb: 32 }));
    expect(planNames()).toEqual(["Starter", "Pro", "Scale"]);
    await click("Choose Starter");
    expect(h.post).toHaveBeenCalledWith("billing/subscription", expect.objectContaining({ workspaceId: "cws-production", planTierId: "starter" }));
    expect(h.create).not.toHaveBeenCalled();
  });

  it("keeps pending payment visible and blocks a second plan change", async () => {
    const pendingChange = {
      id: "change-a", direction: "upgrade" as const, status: "payment_pending" as const, currency: "usd" as const,
      current: { name: "Starter", priceCents: 2000 }, next: { name: "Pro", priceCents: 3900 },
      effectiveAt: "2026-10-03T00:00:00Z", amountDueNow: 1250, paymentUrl: "https://checkout.example.test/upgrade",
      paymentExpiresAt: null, errorCode: null, cancelable: true, appliedAt: null,
    };
    await render(picker("starter", { subscription: { ...subscription("starter"), pendingChange } }));
    expect(host.textContent).toContain(copy.planChange.paymentPending);
    expect(host.querySelector('a[href="https://checkout.example.test/upgrade"]')).not.toBeNull();
    expect(buttons("Choose Pro")[0]?.disabled).toBe(true);
    expect(h.post).not.toHaveBeenCalled();
  });
});

describe("buying another managed server", () => {
  it("opens the shared plans inside a destination dialog and preserves the project when dismissed", async () => {
    await render(<ModalProvider><AddServerFromProject /></ModalProvider>);
    await click("Add a destination");
    const dialog = document.querySelector('[role="dialog"]')!;
    expect([...dialog.querySelectorAll("article h3")].map(heading => heading.textContent)).toEqual(["Hobby", "Starter", "Pro", "Scale"]);
    expect(dialog.querySelector("header h2")?.textContent).toBe(baseDictionary.servers.setup.addServer);
    expect(h.create).not.toHaveBeenCalled(); expect(h.post).not.toHaveBeenCalled();
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Project name"]')?.value).toBe("Keep this project");
  });

  it("starts with plans and creates nothing while browsing or editing its name", async () => {
    await render(<ManagedServerPurchase preserveProject />);
    expect(planNames()).toEqual(["Hobby", "Starter", "Pro", "Scale"]);
    await edit(input(copy.plansRoute.serverName)!, "Staging");
    expect(h.create).not.toHaveBeenCalled();
    expect(h.post).not.toHaveBeenCalled();
  });

  it.each([false, true])("keeps checkout and the selected destination through the status handoff (popup blocked: %s)", async (blocked) => {
    if (blocked) vi.mocked(window.open).mockReturnValueOnce(null);
    let billing: BillingState = { tier: "free", status: "credit_exhausted", overQuota: true, subscription: null,
      currentPeriod: { start: null, end: null }, monthlyCreditLimit: 0, buildTimeMinutes: 0,
      balance: { total: 0, quotaLimit: 0, quotaUsed: 0, quotaRemaining: 0 },
      workspace: server, billing: { enabled: true } };
    h.get.mockImplementation(async path => path === "billing/state" ? { data: billing } : catalog);
    const location = window.location.href;
    await render(<ModalProvider><AddServerFromProject /></ModalProvider>);
    await click("Add a destination");
    await click("Choose Hobby");
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.post).toHaveBeenCalledExactlyOnceWith("billing/subscription", expect.objectContaining({ workspaceId: server.id }));
    expect(h.readServer).toHaveBeenCalledExactlyOnceWith(server.serverId);
    expect(h.selected).toHaveBeenCalledWith(expect.objectContaining({ id: server.serverId }));
    expect(h.get).toHaveBeenCalledWith("billing/state", { params: { workspaceId: server.id } });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.querySelector('[role="dialog"] article')).toBeNull();
    const link = document.querySelector<HTMLAnchorElement>('a[href="https://checkout.example.test/new-server"]');
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toBe("noopener noreferrer");
    expect(window.location.href).toBe(location);
    await click(copy.deployGate.checkPlan);
    expect(document.body.textContent).toContain(copy.deployGate.pending);
    billing = { ...billing, tier: "hobby", status: "active", overQuota: false, plan: offer("hobby"), subscription: subscription("hobby") };
    await click(copy.deployGate.checkPlan);
    expect(document.body.textContent).toContain(copy.workspaces.serverPlanReady);
    expect(document.querySelector('a[href="https://checkout.example.test/new-server"]')).toBeNull();
    await click(copy.workspaces.returnToSetup);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Project name"]')?.value).toBe("Keep this project");
    expect(h.post).toHaveBeenCalledOnce();
  });

  it("creates one explicit server and reuses it and the checkout attempt after an uncertain response", async () => {
    let created!: (value: CloudWorkspaceSummary) => void;
    h.create.mockReturnValueOnce(new Promise(resolve => { created = resolve; }));
    h.post.mockRejectedValueOnce(new Error("Checkout response lost"));
    const started = vi.fn();
    await render(<BillingWorkspaceProvider workspaceId="cws-already-paid"><ManagedServerPurchase preserveProject onCheckoutStarted={started} /></BillingWorkspaceProvider>);
    await edit(input(copy.plansRoute.serverName)!, "Staging");
    await act(async () => { buttons("Choose Starter")[0]!.click(); buttons("Choose Starter")[0]!.click(); });
    expect(h.create).toHaveBeenCalledExactlyOnceWith({ name: "Staging" });
    expect(h.post).not.toHaveBeenCalled();
    await act(async () => created(server));
    expect(h.post).toHaveBeenCalledWith("billing/subscription", expect.objectContaining({ workspaceId: server.id, planTierId: "starter" }));
    expect(host.textContent).toContain("Checkout response lost");
    await click("Choose Starter");
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.post.mock.calls[1]).toEqual(h.post.mock.calls[0]);
    expect(started).toHaveBeenCalledWith(server, "https://checkout.example.test/new-server");
    expect(popup.location.href).toBe("https://checkout.example.test/new-server");
    expect(popup.opener).toBeNull();
  });

  it("does not start checkout from an old organization after its server creation completes", async () => {
    let created!: (value: CloudWorkspaceSummary) => void;
    h.create.mockReturnValueOnce(new Promise(resolve => { created = resolve; }));
    const purchase = <ManagedServerPurchase preserveProject />;
    await render(purchase); await click("Choose Hobby");
    h.org = "org-b";
    await render(<ManagedServerPurchase preserveProject />);
    await act(async () => created(server));
    expect(h.post).not.toHaveBeenCalled();
    expect(popup.close).toHaveBeenCalled();
    h.create.mockResolvedValueOnce({ ...server, id: "cws-org-b" });
    await click("Choose Hobby");
    expect(h.post).toHaveBeenCalledWith("billing/subscription", expect.objectContaining({ workspaceId: "cws-org-b" }));
  });

  it("keeps the form editable after creation fails and starts no checkout", async () => {
    h.create.mockRejectedValueOnce(new Error("Server could not be created"));
    await render(<ManagedServerPurchase preserveProject />); await click("Choose Hobby");
    expect(input(copy.plansRoute.serverName)?.disabled).toBe(false);
    expect(host.textContent).toContain("Server could not be created");
    expect(h.post).not.toHaveBeenCalled();
  });

  it("reuses existing Cloud server linking on self-hosted installations", async () => {
    const availableServer = { id: server.serverId, name: "Existing managed server", connection: "cloud", managed: { ...server, state: "running" }, capabilities: {} };
    h.available.mockResolvedValueOnce({ servers: [availableServer] });
    h.connect.mockResolvedValueOnce({ ...server, state: "running" });
    const ready = vi.fn();
    await render(<ManagedServerSetup onReady={ready} />, true);
    expect(host.textContent).toContain("Existing managed server");
    expect(planNames()).toEqual([]);
    await click(baseDictionary.servers.acquire.useServer);
    expect(h.connect).toHaveBeenCalledExactlyOnceWith({ serverId: server.serverId });
    expect(ready).toHaveBeenCalledWith(expect.objectContaining({ id: server.id }), false);
    expect(h.create).not.toHaveBeenCalled(); expect(h.post).not.toHaveBeenCalled();
  });
});
