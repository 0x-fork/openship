// @vitest-environment happy-dom
import { errorReporter } from "@repo/core/diagnostics";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  installClientErrorReporting,
  reportClientError,
} from "./error-reporting";

vi.mock("./api/urls", () => ({
  getRestApiBaseUrl: () => "https://selected-instance.example/api",
}));

beforeAll(() => installClientErrorReporting());
beforeEach(async () => {
  await errorReporter.flush();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  );
  window.dispatchEvent(new Event("online"));
});
afterEach(async () => {
  await errorReporter.flush();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browser error delivery", () => {
  it("batches sanitized client failures to the current instance without third-party telemetry", async () => {
    const error = Object.assign(new Error("password=browser-private-913"), {
      request: { cookie: "private-cookie-913" },
    });
    reportClientError(error);
    reportClientError(error);
    expect(fetch).not.toHaveBeenCalled();
    await errorReporter.flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe(
      "https://selected-instance.example/api/diagnostics/client-errors",
    );
    expect(request).toMatchObject({
      credentials: "include",
      redirect: "error",
      keepalive: true,
    });
    const payload = JSON.parse(request!.body as string);
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].stack).toBeTruthy();
    expect(JSON.stringify(payload)).not.toMatch(
      /browser-private-913|private-cookie-913|organizationId|userId/,
    );
  });

  it("uses the API's existing request reference instead of creating another client incident", async () => {
    reportClientError(
      Object.assign(new Error("API failed"), {
        requestId: "6315f874-6066-4c1b-84b2-1f1aa73391bb",
      }),
    );
    await errorReporter.flush();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records global runtime errors without changing browser error handling", async () => {
    const event = new ErrorEvent("error", {
      error: new Error("Uncaught UI failure"),
      cancelable: true,
    });
    window.dispatchEvent(event);
    await errorReporter.flush();
    expect(event.defaultPrevented).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = vi.mocked(fetch).mock.calls[0]![1]!;
    expect(JSON.parse(request.body as string).events[0].message).toBe(
      "Uncaught UI failure",
    );
  });

  it("does not recursively report or retry failed telemetry delivery", async () => {
    const local = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetch).mockRejectedValue(new Error("Network offline"));
    for (let i = 0; i < 4; i++) {
      reportClientError(new Error(`failure-${i}`));
      await errorReporter.flush();
    }
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(local).toHaveBeenCalled();
    // Connectivity recovery re-enables the same destination without replaying
    // old events or delaying user actions until the exporter returns.
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    window.dispatchEvent(new Event("online"));
    reportClientError(new Error("new failure"));
    await errorReporter.flush();
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
