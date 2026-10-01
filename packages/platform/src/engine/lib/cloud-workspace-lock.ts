import { createProvisionLock } from "./provision-lock";

/** Workloads/builds and host resize share one admission lock. Docker's short
 * network/port locks remain separate so nested deployment steps cannot deadlock. */
export function withCloudWorkspaceActivity<T>(
  workspaceId: string | null | undefined,
  work: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return workspaceId
    ? createProvisionLock(`cloud:workspace-activity:${workspaceId}`).run(work, signal)
    : work();
}
