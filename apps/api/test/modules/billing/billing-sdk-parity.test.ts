import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
const provider = vi.hoisted(() => ({
  cloudMode: true, enabled: true, topups: true,
  customer: vi.fn(), checkout: vi.fn(), portal: vi.fn(), retrieveSubscription: vi.fn(), updateSubscription: vi.fn(),
  cloudRequest: vi.fn(),
}));
vi.mock("@repo/platform/engine/config/env", async original => {
  const actual = await original<{ env: Record<string, unknown> }>();
  return { ...actual, env: { ...actual.env, get CLOUD_MODE() { return provider.cloudMode; }, get BILLING_ENABLED() { return provider.enabled; }, get BILLING_TOPUPS_ENABLED() { return provider.topups; } } };
});
vi.mock("@repo/platform/engine/lib/stripe-client", () => ({ stripe: () => ({
  customers: { create: provider.customer }, checkout: { sessions: { create: provider.checkout } },
  billingPortal: { sessions: { create: provider.portal } },
  subscriptions: { retrieve: provider.retrieveSubscription, update: provider.updateSubscription },
}) }));
vi.mock("@repo/platform/engine/lib/cloud/client", () => ({ cloudClient: () => ({ request: provider.cloudRequest }) }));
import { db, schema, repos, seedOwner, type SeededOwner } from "../jobs/_harness";
import { CREDIT_PACKS, FREE_DOMAIN_SUFFIX } from "@repo/core";
import { createShip, type VerifiedIdentity } from "@repo/sdk/native";
import { OpenshipClient } from "@repo/sdk/client";
import { getPlatformKernel } from "@repo/platform/engine/lib/platform";
import { billingPlansRoutes, billingSaasRoutes } from "../../../src/modules/billing/billing.routes";
import { healthRoutes } from "../../../src/modules/health/health.routes";
import { handleApiError } from "../../../src/middleware/error-handler";
import * as repository from "@repo/platform/engine/modules/billing/billing.repository";
import { flushAudit } from "@repo/platform/engine/lib/audit-emitter";
import { eq } from "@repo/db";

const app = new Hono().onError(handleApiError)
  .use("*", async (c, next) => { c.set("clientIp", "192.0.2.64"); await next(); })
  .route("/api/health", healthRoutes).route("/api/billing", billingPlansRoutes).route("/api/billing", billingSaasRoutes);
const fetcher = ((url, init) => app.request(url as string, init)) as typeof fetch;
async function clients(actor: SeededOwner, organizationId = actor.orgId, limits: Partial<VerifiedIdentity> = {}) {
  const user = (await repos.user.findById(actor.userId))!;
  const ship = createShip({ platform: getPlatformKernel(), identity: { resolve: async () => ({ user, sessionId: "billing", ...limits }) } });
  return {
    native: (await ship.scope({ identity: "verified", organizationId })).billing,
    remote: new OpenshipClient({ baseUrl: "http://openship.test", token: actor.token, organizationId, fetch: fetcher }).billing,
  };
}
beforeEach(() => {
  provider.cloudMode = provider.enabled = provider.topups = true;
  provider.customer.mockImplementation(async (input: { metadata: { organizationId: string } }) => ({ id: `cus_${input.metadata.organizationId}` }));
  provider.checkout.mockResolvedValue({ url: "https://checkout.stripe.test/private-session" });
  provider.portal.mockResolvedValue({ url: "https://portal.stripe.test/private-session" });
  provider.retrieveSubscription.mockResolvedValue({ items: { data: [{ id: "item_1" }] } });
  provider.updateSubscription.mockResolvedValue({ status: "active" });
  vi.stubEnv("STRIPE_PRICE_STARTER_MONTHLY", "price_starter");
  vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro");
  vi.stubEnv("STRIPE_PRICE_PACK_5K", "price_pack");
});
afterEach(async () => { await flushAudit(); vi.clearAllMocks(); vi.unstubAllEnvs(); await db.delete(schema.creditPack); });

describe("billing through the same SDK and HTTP application operations", () => {
  it("keeps localized plan discovery public and preserves monetary units and catalog secrecy", async () => {
    const c = await clients(await seedOwner());
    const remote = new OpenshipClient({ baseUrl: "http://openship.test", fetch: fetcher });
    const native = await c.native.listPlans({ locale: "ar" });
    expect(await remote.billing.listPlans({ locale: "ar" })).toEqual(native);
    expect(native.locale).toBe("ar");
    expect(native.plans.find(plan => plan.id === "starter")?.price.monthly).toBe(1000);
    expect(JSON.stringify(native)).not.toMatch(/stripeCouponEnv|oblienLimits|STRIPE_PRICE/);
    const response = await app.request("/api/billing/plans", { headers: { "Accept-Language": "de" } });
    expect(response.headers.get("Vary")).toBe("Accept-Language");
    expect((await response.json()).data.locale).toBe("de");
    expect(provider.customer).not.toHaveBeenCalled();
  });

  it("uses the selected tenant for state, checkout, portal and attribution without auditing session URLs", async () => {
    const owner = await seedOwner(), other = await seedOwner(), c = await clients(owner);
    await db.update(schema.organization).set({ planTierId: "team" }).where(eq(schema.organization.id, other.orgId));
    expect(await c.native.getState()).toEqual(await c.remote.getState());
    expect((await c.native.getState()).tier).toBe("free");
    for (const client of [c.native, c.remote]) {
      expect(await client.createSubscription({ planTierId: "starter", interval: "monthly" })).toEqual({ checkoutUrl: "https://checkout.stripe.test/private-session" });
      expect(await client.createPortal()).toEqual({ portalUrl: "https://portal.stripe.test/private-session" });
    }
    expect(provider.customer).toHaveBeenCalledOnce();
    for (const [input, options] of provider.checkout.mock.calls) {
      expect(input).toMatchObject({ customer: `cus_${owner.orgId}`, client_reference_id: owner.orgId, metadata: { organizationId: owner.orgId, planTierId: "starter" }, line_items: [{ price: "price_starter", quantity: 1 }] });
      expect(options.idempotencyKey).toContain(owner.orgId);
    }
    await flushAudit();
    const events = await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.organizationId, owner.orgId));
    expect(events.filter(row => row.eventType === "billing:write")).toHaveLength(4);
    expect(events.every(row => row.actorUserId === owner.userId)).toBe(true);
    expect(JSON.stringify(events)).not.toContain("private-session");
  });

  it("preserves in-place paid-plan changes and cancels every historical live subscription", async () => {
    const owner = await seedOwner(), c = await clients(owner), now = new Date("2026-01-01"), end = new Date("2026-02-01");
    for (const id of ["first", "second"]) await repository.upsertSubscription({ organizationId: owner.orgId, stripeSubscriptionId: `${owner.userId}-${id}`, stripePriceId: "price_starter", planTierId: "starter", interval: "monthly", status: "active", currentPeriodStart: now, currentPeriodEnd: end });
    for (const client of [c.native, c.remote]) {
      await client.createSubscription({ planTierId: "pro", interval: "monthly" });
      expect(await client.cancelSubscription()).toEqual({ cancelAt: end.toISOString() });
    }
    expect(provider.checkout).not.toHaveBeenCalled();
    expect(provider.updateSubscription.mock.calls.filter(([, input]) => input.items)).toHaveLength(2);
    expect(provider.updateSubscription.mock.calls.filter(([, input]) => input.cancel_at_period_end === true)).toHaveLength(4);
  });

  it("enforces membership, billing grants, read-only limits and feature switches before Stripe", async () => {
    const owner = await seedOwner(), member = await seedOwner({ bound: false });
    await db.insert(schema.member).values({ id: `billing-${member.userId}`, organizationId: owner.orgId, userId: member.userId, role: "admin" });
    const forbidden = await clients(member, owner.orgId);
    for (const client of [forbidden.native, forbidden.remote]) await expect(client.getState()).rejects.toMatchObject({ statusCode: 404 });
    const readonly = await clients(owner, owner.orgId, { credential: { organizationId: owner.orgId, readOnly: true } });
    await expect(readonly.native.createPortal()).rejects.toMatchObject({ code: "TOKEN_READ_ONLY" });
    provider.enabled = false;
    const c = await clients(owner);
    for (const client of [c.native, c.remote]) {
      await expect(client.createSubscription({ planTierId: "starter", interval: "monthly" })).rejects.toMatchObject({ code: "BILLING_NOT_ENABLED" });
      await expect(client.createTopup({ packId: CREDIT_PACKS[0]!.id })).rejects.toMatchObject({ code: "BILLING_NOT_ENABLED" });
      await expect(client.createPortal()).rejects.toMatchObject({ code: "BILLING_NOT_ENABLED" });
      expect((await client.getState()).billing.enabled).toBe(false);
    }
    expect(provider.customer).not.toHaveBeenCalled();
    expect(provider.checkout).not.toHaveBeenCalled();
    expect(provider.portal).not.toHaveBeenCalled();
  });

  it("normalizes synced credit packs and enforces the independent top-up switch", async () => {
    const owner = await seedOwner(), c = await clients(owner), pack = CREDIT_PACKS[0]!;
    const fallback = await c.native.listTopupPacks();
    await db.insert(schema.creditPack).values({ id: pack.id, name: pack.name, creditsMilli: pack.credits_milli, priceCents: pack.price_cents, sortOrder: pack.sortOrder, stripePriceId: "price_pack", stripeProductId: "product_pack", active: true });
    for (const client of [c.native, c.remote]) {
      expect(await client.listTopupPacks()).toEqual([fallback.find(value => value.id === pack.id)]);
      expect(await client.createTopup({ packId: pack.id })).toEqual({ checkoutUrl: "https://checkout.stripe.test/private-session" });
    }
    expect(provider.checkout.mock.calls.every(([input]) => input.mode === "payment")).toBe(true);
    provider.topups = false;
    for (const client of [c.native, c.remote]) await expect(client.createTopup({ packId: pack.id })).rejects.toMatchObject({ code: "BILLING_TOPUPS_NOT_ENABLED" });
  });

  it("bounds usage ranges and hides projects a billing-only reader cannot access", async () => {
    const owner = await seedOwner(), member = await seedOwner({ bound: false });
    const input = { organizationId: owner.orgId, name: "Private project", slug: `billing-${owner.userId.replaceAll("_", "-")}` };
    const group = await repos.projectGroup.create(input);
    const project = await repos.project.create({ ...input, groupId: group.id });
    await repos.domain.create({ projectId: project.id, hostname: `${input.slug}${FREE_DOMAIN_SUFFIX}` });
    await db.insert(schema.member).values({ id: `billing-reader-${member.userId}`, organizationId: owner.orgId, userId: member.userId, role: "restricted" });
    await repos.resourceGrant.upsert({ organizationId: owner.orgId, userId: member.userId, resourceType: "billing", resourceId: "*", permissions: ["read"], grantedByUserId: owner.userId });
    const c = await clients(member, owner.orgId);
    for (const client of [c.native, c.remote]) {
      expect((await client.listAllowanceDetail()).freeSubdomains.items).toEqual([]);
      expect(await client.getUsage({ from: "2026-01-01", to: "2026-01-02", groupBy: "day" })).toEqual({ from: "2026-01-01T00:00:00.000Z", to: "2026-01-02T00:00:00.000Z", groupBy: "day", usage: null });
      await expect(client.getUsage({ from: "2026-02-01", to: "2026-01-01" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      await expect(client.getUsage({ from: "2000-01-01", to: "2026-01-01" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect((await (await clients(owner)).native.listAllowanceDetail()).freeSubdomains.items.map(item => item.projectId)).toEqual([project.id]);
  });

  it("does not forward a fixed local tenant through an unverified owner cloud link", async () => {
    provider.cloudMode = false;
    const c = await clients(await seedOwner());
    for (const client of [c.native, c.remote]) {
      await expect(client.getState()).rejects.toMatchObject({ code: "CLOUD_SCOPE_UNAVAILABLE" });
      await expect(client.createSubscription({ planTierId: "starter", interval: "monthly" })).rejects.toMatchObject({ code: "CLOUD_SCOPE_UNAVAILABLE" });
      expect((await client.listPlans()).plans.length).toBeGreaterThan(0);
    }
    expect(provider.cloudRequest).not.toHaveBeenCalled();
  });

  it("preserves legacy cloud proxy responses and normalizes credit packs from older servers", async () => {
    const owner = await seedOwner();
    const state = await (await clients(owner)).native.getState();
    provider.cloudMode = false;
    const legacy = new OpenshipClient({ baseUrl: "http://openship.test", token: owner.token, fetch: fetcher });
    provider.cloudRequest.mockImplementation(async () => Response.json({ data: state }));
    expect(await legacy.billing.getState()).toEqual(state);
    expect(provider.cloudRequest).toHaveBeenCalledWith("/api/billing/state", { method: "GET", body: undefined });
    const pack = CREDIT_PACKS[0]!;
    provider.cloudRequest.mockImplementation(async () => Response.json({ data: [{ id: pack.id, name: pack.name, creditsMilli: pack.credits_milli, priceCents: pack.price_cents, sortOrder: pack.sortOrder, explains: pack.explains, stripePriceId: "private-provider-field" }] }));
    expect(await legacy.billing.listTopupPacks()).toEqual([pack]);
    provider.cloudRequest.mockImplementation(async () => Response.json({ error: "expired upstream" }, { status: 401 }));
    await expect(legacy.billing.getState()).rejects.toMatchObject({ status: 401, code: "cloud_session_expired" });
    provider.cloudRequest.mockImplementation(async () => new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(legacy.billing.getState()).rejects.toMatchObject({ status: 502, code: "cloud_invalid_response" });
    provider.cloudRequest.mockResolvedValue(null);
    await expect(legacy.billing.getState()).rejects.toMatchObject({ status: 403, code: "cloud_not_connected" });
  });
});
