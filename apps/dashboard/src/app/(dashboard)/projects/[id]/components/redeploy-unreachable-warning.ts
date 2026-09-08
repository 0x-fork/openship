import type { Service } from "@/lib/api/services";

export interface ProjectDomainLike {
  serviceId?: string | null;
  targetPort?: number | string | null;
  hostname?: string;
  domain?: string;
}

export function serviceMatchesPort(
  service: Pick<Service, "ports" | "exposedPort">,
  port: number | string,
): boolean {
  const p = String(port).trim();
  if (!p) return false;
  if (String(service.exposedPort ?? "").trim() === p) return true;
  return (service.ports ?? []).some((spec) => {
    const parts = spec.split(":");
    const container = (parts[parts.length - 1] ?? "").split("/")[0];
    const host = (parts[parts.length - 2] ?? "").split("/")[0];
    return container === p || host === p;
  });
}

export function hasConnectedDomain(
  service: Service,
  domains?: ProjectDomainLike[] | null,
): boolean {
  if (!service.exposed) return false;

  if (domains && domains.length > 0) {
    const hasMatchingDomain = domains.some((d) => {
      const hostname = (d.hostname ?? d.domain ?? "").trim();
      if (!hostname) return false;
      if (d.serviceId && d.serviceId === service.id) return true;
      if (d.targetPort != null && serviceMatchesPort(service, d.targetPort)) return true;
      if (!d.serviceId && d.targetPort == null) return true;
      return false;
    });
    if (hasMatchingDomain) return true;
  }

  if (service.publicEndpoints && service.publicEndpoints.length > 0) {
    const hasEndpointDomain = service.publicEndpoints.some((ep) =>
      ep.domainType === "custom"
        ? Boolean(ep.customDomain?.trim())
        : Boolean(ep.domain?.trim()),
    );
    if (hasEndpointDomain) return true;
  }

  if (service.domainType === "custom") return Boolean(service.customDomain?.trim());
  return Boolean(service.domain?.trim() || service.name?.trim());
}

export function isPotentiallyPublicService(service: Service): boolean {
  return service.enabled && (service.ports?.length ?? 0) > 0;
}

export function shouldWarnAboutUnreachableServices(
  services: Service[],
  domains?: ProjectDomainLike[] | null,
): boolean {
  const candidateServices = services.filter(isPotentiallyPublicService);
  if (candidateServices.length === 0) return false;
  return candidateServices.every((service) => !hasConnectedDomain(service, domains));
}
