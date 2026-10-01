import type { CloudWorkspaceOperations } from "@repo/contracts";
import { api } from "./client";

type Result<K extends keyof CloudWorkspaceOperations> = Awaited<
  ReturnType<CloudWorkspaceOperations[K]>
>;
const path = (id: string, suffix = "") => `workspaces/${encodeURIComponent(id)}${suffix}`;
const data = async <T>(request: Promise<{ data: T }>): Promise<T> => (await request).data;
export const cloudWorkspacesApi = {
  list: () => data(api.get<{ data: Result<"list"> }>("workspaces")),
  create: (input: Parameters<CloudWorkspaceOperations["create"]>[0]) =>
    data(api.post<{ data: Result<"create"> }>("workspaces", input)),
  get: (id: string) => data(api.get<{ data: Result<"get"> }>(path(id))),
  usage: (id: string) =>
    data(api.get<{ data: Result<"getUsage"> }>(path(id, "/usage"), { timeout: 45_000 })),
  rename: (id: string, name: string) =>
    data(api.patch<{ data: Result<"rename"> }>(path(id), { name })),
  ensure: (id: string) => data(api.post<{ data: Result<"ensure"> }>(path(id, "/ensure"))),
  previewResize: (id: string) =>
    data(api.get<{ data: Result<"previewResize"> }>(path(id, "/resize"))),
  resize: (id: string, input: Parameters<CloudWorkspaceOperations["resize"]>[1]) =>
    data(api.post<{ data: Result<"resize"> }>(path(id, "/resize"), input)),
  retry: (id: string) => data(api.post<{ data: Result<"retry"> }>(path(id, "/retry"))),
  remove: (id: string, input: Parameters<CloudWorkspaceOperations["remove"]>[1]) =>
    data(api.delete<{ data: Result<"remove"> }>(path(id), { body: input })),
};
