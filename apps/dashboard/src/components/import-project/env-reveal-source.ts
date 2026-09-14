import type { PrepareProjectSource } from "@/lib/api/deploy";

/** The source that owns the masked Compose values currently displayed. */
export type EnvRevealSource =
  | { kind: "upload"; sessionId: string; service: string }
  | { kind: "prepared"; source: PrepareProjectSource; service: string }
  | { kind: "service"; projectId: string; serviceId: string }
  | null;

export function envRevealSource(input: {
  uploadSessionId?: string;
  preparedSource?: PrepareProjectSource;
  projectId?: string;
  serviceId?: string;
  serviceName: string;
}): EnvRevealSource {
  // Fresh scans take precedence over saved rows: the displayed values may
  // have changed in the source or may belong to a service not saved yet.
  if (input.uploadSessionId) {
    return { kind: "upload", sessionId: input.uploadSessionId, service: input.serviceName };
  }
  if (input.preparedSource) {
    return { kind: "prepared", source: input.preparedSource, service: input.serviceName };
  }
  if (input.projectId && input.serviceId) {
    return { kind: "service", projectId: input.projectId, serviceId: input.serviceId };
  }
  return null;
}
