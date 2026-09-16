import "../mail/_setup-env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const domainRepo = vi.hoisted(() => ({
  findPendingVerification: vi.fn(),
  findPendingSsl: vi.fn(),
  findById: vi.fn(),
}));
const projectRepo = vi.hoisted(() => ({
  findById: vi.fn(),
}));
const ssl = vi.hoisted(() => ({
  manageDomainSsl: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  repos: {
    domain: domainRepo,
    project: projectRepo,
  },
}));

vi.mock("@repo/platform/engine/lib/domain-ssl", () => ({
  manageDomainSsl: ssl.manageDomainSsl,
  tlsIssuedElsewhere: () => null,
  installDomainCert: vi.fn(),
  provisionDomainCertForVerify: vi.fn(),
  verifyExistingCert: vi.fn(),
}));

vi.mock("../../../src/lib/controller-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/lib/controller-helpers")>();
  return {
    ...actual,
    platform: () => ({ target: "desktop", runtime: {} }),
  };
});

vi.mock("@repo/platform/engine/lib/route-apply.service", () => ({
  reconcileProjectRoutes: vi.fn(),
}));

vi.mock("@repo/platform/engine/lib/server-target", () => ({
  resolveProjectServerHost: vi.fn(),
}));

vi.mock("@repo/platform/engine/lib/ssh-manager", () => ({
  sshManager: {
    probeReachable: vi.fn(),
    withExecutor: vi.fn(),
    withHostExecutor: vi.fn(),
  },
}));

import { verifyPendingDomains } from "@repo/platform/engine/modules/domains/domain.service";

describe("automatic SSL completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domainRepo.findPendingVerification.mockResolvedValue([]);
    projectRepo.findById.mockResolvedValue({
      id: "proj_1",
      organizationId: "org_1",
    });
  });

  it("retries issuance for a verified domain whose first certificate attempt failed", async () => {
    domainRepo.findPendingSsl.mockResolvedValue([
      {
        id: "dom_issue",
        projectId: "proj_1",
        hostname: "app.example.com",
        domainType: "custom",
        verified: true,
        sslStatus: "provisioning",
        externalIngress: false,
        manualSsl: false,
      },
    ]);
    ssl.manageDomainSsl.mockResolvedValue({
      domain: "app.example.com",
      verified: true,
      expiresAt: "2026-10-01T00:00:00.000Z",
      issuer: "Let's Encrypt",
    });
    domainRepo.findById.mockResolvedValue({
      id: "dom_issue",
      sslStatus: "active",
    });

    const result = await verifyPendingDomains();

    expect(ssl.manageDomainSsl).toHaveBeenCalledWith("app.example.com", {
      action: "provision",
      projectId: "proj_1",
    });
    expect(result.sslIssued).toBe(1);
    expect(result.sslRetrying).toBe(0);
  });

  it("backs off a failed automatic issuance instead of requiring a redeploy", async () => {
    domainRepo.findPendingSsl.mockResolvedValue([
      {
        id: "dom_retry",
        projectId: "proj_1",
        hostname: "retry.example.com",
        domainType: "custom",
        verified: true,
        sslStatus: "provisioning",
        externalIngress: false,
        manualSsl: false,
      },
    ]);
    ssl.manageDomainSsl.mockRejectedValue(new Error("ACME temporarily unavailable"));

    const result = await verifyPendingDomains();

    expect(result.sslIssued).toBe(0);
    expect(result.sslRetrying).toBe(1);
  });

  it("keeps both sweep phases inside the caller's organization", async () => {
    const foreign = {
      id: "dom_foreign",
      projectId: "proj_foreign",
      hostname: "other-tenant.example.com",
    };
    domainRepo.findPendingVerification.mockResolvedValue([foreign]);
    domainRepo.findPendingSsl.mockResolvedValue([foreign]);
    projectRepo.findById.mockResolvedValue({ id: "proj_foreign", organizationId: "org_2" });

    const result = await verifyPendingDomains({ organizationId: "org_1", limit: 12 });

    expect(domainRepo.findPendingVerification).toHaveBeenCalledWith(expect.any(Date), 12, "org_1");
    expect(domainRepo.findPendingSsl).toHaveBeenCalledWith(12, "org_1");
    expect(ssl.manageDomainSsl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ total: 0, details: [], sslIssued: 0, sslRetrying: 0 });
  });

  it("rechecks caller access before issuing TLS for an already verified domain", async () => {
    domainRepo.findPendingSsl.mockResolvedValue([{
      id: "dom_revoked",
      projectId: "proj_1",
      hostname: "revoked.example.com",
    }]);
    const contextFor = vi.fn().mockResolvedValue(null);

    await verifyPendingDomains({ organizationId: "org_1" }, contextFor);

    expect(contextFor).toHaveBeenCalledWith("dom_revoked", "provision");
    expect(ssl.manageDomainSsl).not.toHaveBeenCalled();
  });
});

// The application seams moved with the shared engine.
vi.mock("@repo/platform/engine/lib/platform-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/lib/controller-helpers")>();
  return {
    ...actual,
    platform: () => ({ target: "desktop", runtime: {} }),
  };
});

vi.mock("@repo/platform/engine/lib/resource-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/lib/controller-helpers")>();
  return {
    ...actual,
    platform: () => ({ target: "desktop", runtime: {} }),
  };
});
