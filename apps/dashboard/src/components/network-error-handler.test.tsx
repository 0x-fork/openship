// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { api, ApiError } from "@/lib/api/client";
import { NetworkErrorHandler } from "./network-error-handler";

vi.mock("@/lib/api/urls", () => ({ getRestApiBaseUrl: () => "http://openship.test/api" }));
let node: HTMLDivElement;
let root: Root;
const fetcher = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  node = document.createElement("div");
  document.body.appendChild(node);
  root = createRoot(node);
  await act(async () =>
    root.render(
      <I18nProvider>
        <NetworkErrorHandler />
      </I18nProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
  vi.unstubAllGlobals();
});

it("shows one connection notice for concurrent request failures and clears it after an HTTP response", async () => {
  fetcher.mockRejectedValue(new TypeError("Failed to fetch"));
  await act(async () => {
    await Promise.allSettled([api.get("/a"), api.get("/b"), api.get("/c")]);
  });
  expect(node.querySelectorAll('[role="status"]')).toHaveLength(1);
  expect(node.textContent).toContain("Connection to Openship interrupted");
  expect(node.textContent).toContain("apps may still be running");

  // A workload failure returned by a reachable API is not a browser connection failure.
  fetcher.mockResolvedValueOnce(
    new Response('{"message":"service check failed"}', { status: 503 }),
  );
  await act(async () => {
    await expect(api.get("/healthy-connection")).rejects.toBeInstanceOf(ApiError);
  });
  expect(node.querySelector('[role="status"]')).toBeNull();
});

it("detects browser disconnection across pages without starting a probe or operation", async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  await act(async () => window.dispatchEvent(new Event("offline")));
  expect(node.textContent).toContain("This device is offline");
  expect(fetcher).not.toHaveBeenCalled();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(node.querySelector('[role="status"]')).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
