import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/components/i18n-provider";
import { DEFAULT_CONFIG, type DeploymentConfig } from "@/context/deployment/types";
import type { PrepareProjectSource } from "@/lib/api/deploy";
import type EnvironmentVariables from "./EnvironmentVariables";
import ComposeServices from "./ComposeServices";

type EditorProps = ComponentProps<typeof EnvironmentVariables>;
const h = vi.hoisted(() => ({
  config: {} as DeploymentConfig,
  update: vi.fn(),
  editors: [] as EditorProps[],
  prepared: vi.fn(), upload: vi.fn(), stored: vi.fn(),
}));
vi.mock("@/context/DeploymentContext", () => ({
  useDeployment: () => ({ config: h.config, updateConfig: h.update }),
  useOptionalDeployment: () => undefined,
}));
vi.mock("@/context/PlatformContext", () => ({ usePlatform: () => ({ baseDomain: "test.invalid" }) }));
vi.mock("@/lib/api/deploy", () => ({ deployApi: { revealPreparedEnv: h.prepared } }));
vi.mock("@/lib/api/folder", () => ({ folderApi: { reveal: h.upload } }));
vi.mock("@/lib/api/services", () => ({ servicesApi: { revealEnv: h.stored } }));
// Mount modal contents during server rendering; the real editor and the card's
// callback wiring run unchanged. Browser interaction is checked separately.
vi.mock("@/components/ui/Modal", () => ({ Modal: ({ children }: { children: ReactNode }) => children }));
vi.mock("./EnvironmentVariables", async importOriginal => {
  const { default: Editor } = await importOriginal<typeof import("./EnvironmentVariables")>();
  return { default: (props: EditorProps) => { h.editors.push(props); return <Editor {...props} />; } };
});

const MASK = "••••••••";
beforeEach(() => {
  vi.clearAllMocks();
  h.editors.length = 0;
  h.config = {
    ...structuredClone(DEFAULT_CONFIG), projectName: "app", owner: "acme", repo: "app",
    projectType: "services", serviceDeploymentMode: "services",
    services: [
      { name: "db", image: "postgres:16", ports: [], dependsOn: [], volumes: [], environment: { POSTGRES_PASSWORD: MASK } },
      { name: "worker", image: "node:22", ports: [], dependsOn: [], volumes: [], environment: { API_TOKEN: MASK } },
    ],
  };
  h.prepared.mockResolvedValue({ environment: { POSTGRES_PASSWORD: "source-secret" } });
  h.upload.mockResolvedValue({ environment: { POSTGRES_PASSWORD: "upload-secret" } });
  h.stored.mockResolvedValue({ environment: { POSTGRES_PASSWORD: "stored-secret" } });
});

function render() {
  const html = renderToStaticMarkup(<I18nProvider><ComposeServices /></I18nProvider>);
  const editor = h.editors.find(props => props.envVars?.some(row => row.key === "POSTGRES_PASSWORD"));
  expect(editor).toBeDefined();
  return { html, editor: editor! };
}

describe("Compose environment editor sources", () => {
  it.each<PrepareProjectSource>([
    { owner: "acme", repo: "app", branch: "preview", composePath: "deploy/stack.yml", env: { PASSWORD: "typed" } },
    { source: "local", path: "/work/app", composePath: "deploy/stack.yml" },
  ])("gives a first scan reveal controls and scopes its request to one service", async source => {
    h.config.preparedSource = source;
    const { html, editor } = render();
    expect(html.match(/aria-label="Show value"/g)).toHaveLength(2);
    expect(editor.revealOnOpen).toBe(true);
    expect(editor.onReveal).toBeTypeOf("function");
    expect(await editor.onReveal!(["POSTGRES_PASSWORD"])).toEqual({ POSTGRES_PASSWORD: "source-secret" });
    expect(h.prepared).toHaveBeenCalledExactlyOnceWith(source, "db", ["POSTGRES_PASSWORD"]);
    expect(h.stored).not.toHaveBeenCalled();
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.config.services[0]!.environment.POSTGRES_PASSWORD).toBe(MASK);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("keeps an uploaded scan as the reveal source when editing an existing project", async () => {
    h.config.uploadSessionId = "upload-session";
    h.config.projectId = "project-id";
    h.config.services[0]!.serviceId = "service-id";
    const { editor } = render();
    expect(await editor.onReveal!(["POSTGRES_PASSWORD"])).toEqual({ POSTGRES_PASSWORD: "upload-secret" });
    expect(h.upload).toHaveBeenCalledExactlyOnceWith("upload-session", "db", ["POSTGRES_PASSWORD"]);
    expect(h.stored).not.toHaveBeenCalled();
    expect(h.prepared).not.toHaveBeenCalled();
  });

  it("uses saved values when opening a persisted service without a fresh scan", async () => {
    h.config.projectId = "project-id";
    h.config.services[0]!.serviceId = "service-id";
    const { editor } = render();
    expect(await editor.onReveal!(["POSTGRES_PASSWORD"])).toEqual({ POSTGRES_PASSWORD: "stored-secret" });
    expect(h.stored).toHaveBeenCalledExactlyOnceWith("project-id", "service-id", ["POSTGRES_PASSWORD"]);
    expect(h.prepared).not.toHaveBeenCalled();
  });
});
