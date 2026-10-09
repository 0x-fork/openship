# Structured error reporting

Openship-owned failures go through `ErrorReporter` in
[`packages/core/src/diagnostics`](../packages/core/src/diagnostics). The same implementation is used
by Cloud, self-hosted API instances, Desktop, the native worker, CLI and dashboard. Reporting observes
operations; it does not retry deployments, choose a destination, change authorization or replace their
existing return values and user messages.

The default server destination is newline-delimited JSON on stderr. There is no diagnostics database,
Redis dependency, vendor SDK or automatic transmission to Openship Cloud from a self-hosted instance.
The dashboard sends its browser failures to the API serving that dashboard. The public marketing site
uses the reporter for server failures and local browser diagnostics; it does not send visitor errors
to an authenticated customer's instance.

This is operational diagnostics, separate from the existing security audit log, deployment output and
Cloud product analytics. Customer applications' own stdout, stderr and exceptions remain their service
logs. OpenResty, Docker, SSH, database engines and the separately deployed webmail application retain
their own internal logs; errors that reach an Openship control-plane adapter are observed here.

## Event contract

Each event has `schemaVersion: 1`, a timestamp, an `eventId`, an `errorId`, a severity, a category,
`error` and `context`. The error contains its name, redacted message, optional code and stack, and bounded
causes or aggregate errors. A returned HTTP error without an exception has no invented stack trace.

Context is an allowlist: request/parent/trace identifiers, source, operation/component, HTTP method and
registered route, status, duration, authorized user/organization/resource identifiers, deployment/job/run
identifiers and safe provider failure metadata. It never serializes an execution context or request.

`component` identifies the code module that observed the failure; it is separate from the request's
route. The request boundary supplies HTTP context automatically, and the browser supplies its current
page path. Browser delivery preserves the bounded module label as untrusted metadata; it cannot assert
an authenticated identity or replace the API's own request identifier.

`eventId` identifies one observation. The same Error object keeps its `errorId` across boundaries;
repeated observations at the same boundary/request are suppressed. Reused provider Error objects can
span requests, so use request/operation identifiers when counting incidents. Identifiers are log fields,
not metric labels. Browser `eventId` becomes `context.clientEventId` and never controls the server's IDs.

Categories include authentication, authorization, validation, not found, conflict, rate limit, capacity,
billing, network, timeout, cancellation, deployment, storage, database, dependency and internal failure.
Structured status/code/cause take precedence over generic labels. Known Docker disk-exhaustion messages
also classify as storage failures when Docker supplies no error code. Categories and severity can be
overridden explicitly by a trusted operation. Cancellation is informational; recovered catches are
warnings, with common expected filesystem/abort outcomes informational.

## Boundaries and correlation

| Boundary | Coverage and behavior |
| --- | --- |
| HTTP | The first Hono middleware generates `X-Request-ID` before auth, validation, rate limits or routing. Thrown errors and explicit 4xx/5xx responses are observed, including unmatched routes. Early guards retain the intended registered route. |
| Authentication and permissions | Identity is added only from the established execution context and authorized resource scope. Input headers and body fields cannot set diagnostic identity. |
| Shared platform | All operation families are wrapped at `createPlatform`. HTTP, MCP and native SDK use that same boundary. Synchronous results, rejections and asynchronous stream iteration retain their semantics. |
| Deployments | The asynchronous worker carries request/project/deployment/server/organization context. The canonical failure lifecycle records failed outcomes, including failures expressed as strings rather than thrown exceptions. |
| Jobs and backups | Both BullMQ and in-process runners establish a fresh job context. Attempts, job/run IDs and resolved organization are carried into errors. Failed command exits are observed, not just thrown exceptions. |
| Background work | Tracked work, scheduled operations, rejections, recovery catches and `allSettled` results are observed. A cron tick does not inherit a previous request's tenant. |
| SSE and WebSocket | Observers retain the original request context after the HTTP response opens. Streamed failed results, promised SSE data, write failures and WebSocket hook errors are covered without changing frame order. |
| Dashboard | Fetch/auth failures, handled error messages, toasts, React error boundaries and global browser exceptions/rejections use the reporter. API errors keep the server's response reference. |
| Dashboard proxy | Failed upstream connections get a response reference. Requests forward a generated parent reference and preserve the upstream API's own reference when supplied. |
| Desktop | IPC handlers retain their result/rejection contract and omit arguments. Main-process fatal errors and unexpected renderer exits are observed. |
| Native worker and CLI | Operation context, network errors and shutdown failures use the reporter. CLI human messages and JSON stdout retain their existing output contract. Native `diagnostics: "silent"` still honors the caller's choice. |
| Onboarding | Rejected settings pushes and terminal readiness failures are observed without recording passwords or tunnel tokens. A successful readiness poll does not report its earlier expected connection refusals. |
| Public support | The website support adapter records returned and thrown failures, returns a request reference, and forwards it to the Cloud API. It never logs the support form or receipt. |

`AsyncLocalStorage` holds only identifiers and other allowed primitives. Parallel requests and workers
get separate frames; an authorized scope change does not change process-global identity. Incoming
request IDs must be UUIDs and are recorded only as `parentRequestId`, never accepted as the API's own ID.
References forwarded between instances provide a chain; this is not a full OpenTelemetry span exporter.

The pre-runtime CLI Node recovery launcher is an explicit exception. It must work without a supported
Node version or installed workspace dependencies, so it retains its built-in-only stderr reporting.
After it starts the actual CLI, the shared reporter is installed. Importing the reporter into this early
launcher would break the mechanism that repairs unsupported installations.

## Bounded delivery

`capture()` sanitizes a bounded snapshot and enqueues it. It never awaits a network request, database,
file write or logging destination. Normal requests must not call `flush()`.

| Bound | Default |
| --- | --- |
| Buffered events | 256 |
| Approximate serialized buffer budget | 1 MiB, plus one active batch and object overhead |
| Individual event budget | Approximately 16 KiB |
| Batch size / interval | 16 events / 100 ms |
| Exporter calls in flight | One |
| Delivery deadline | 2 seconds |
| Returned JSON error inspection | At most 16 readers, 4 KiB and 250 ms each; detached from the response |

The consumer respects stderr write backpressure. A full buffer drops new events before expensive
inspection and emits `DIAGNOSTICS_OVERFLOW` with the drop count. A failed exporter writes the sanitized
batch and `DIAGNOSTICS_DELIVERY_FAILED` to the local fallback. After three failures, or one timeout,
delivery switches to that fallback. An exporter ignoring cancellation cannot accumulate a new hung
request for every batch. An incorrectly asynchronous fallback is replaced after its first call.
The local fallback also checks stderr backpressure; it cannot grow Node's output buffer indefinitely
when the pipe is stalled. Events lost there are counted and reported as `DIAGNOSTICS_OUTPUT_DROPPED`
when a later event can be written after recovery.

There are no delivery retries inside application operations. An uncertain exporter can finish after a
timeout, so a collector should deduplicate by `eventId`. `stats()` exposes queue depth/bytes, successful
primary delivery count, dropped events and delivery failures. No success log is generated for each
ordinary request.

API shutdown drains the bounded response readers and reporter. CLI and native-worker orderly shutdown
also have bounded flushes. Fatal Node exceptions use the same redaction in a direct local emergency
write and exit nonzero; they do not wait for an exporter or continue a potentially corrupt process.
Explicit Node exits also make a bounded last-chance local write of queued and uncertain in-flight events,
so a CLI refusal using `process.exit()` does not discard its error before the first batch timer fires.
Forced Electron termination, browser closure, SIGKILL, OOM, power loss and broken local output can still lose
buffered events. This system deliberately does not promise durable or exactly-once delivery.

Zero overhead is not possible. A local Node 22.21.1 microbenchmark on 2026-10-09 measured 18–21 µs per
captured Error with context/stack, and about 15–16 µs additional time for a successful in-process Hono
request. Five samples used 2,048 errors and 2,500 HTTP requests respectively. These are local measurements,
not production latency guarantees. A synchronous burst of 10,000 events took about 3.2 ms, retaining 256
and explicitly accounting for the remaining 9,744 as dropped; it did not grow the queue indefinitely.

## Redaction and trust

Only allowlisted error/context properties are read. Bodies, cookies, headers, environment, IPC
arguments, commands, SDK configuration and arbitrary attached objects are excluded. Text is bounded
before filtering. Filters remove recognizable credentials, authorization values, private keys,
credential-bearing URLs, query strings, invitation/reset tokens, email addresses, SQL/query payloads,
environment assignments and sensitive command flags. A credential disguised as an error code is omitted.
Better Auth's internal logger uses this same serializer, including WebAuthn challenge redaction.
Provider-specific redaction remains ahead of reporting: notification webhook URLs, Telegram tokens,
ACME enrollment keys and GitHub credential verification keep their existing sanitized error boundary.
The reporter does not bypass that boundary to recover a more detailed raw error.
Custom message/stack getters and `toJSON` are not invoked; V8's captured intrinsic stack getter is allowed.

Redaction cannot identify an arbitrary secret embedded in otherwise ordinary prose. Do not construct
errors or summaries from raw configuration, process output, form contents or provider responses. Prefer
a stable error code and pass the original Error so the safe serializer can retain its stack/cause.
As with any JavaScript inspection, hostile Proxy traps are not a sandbox boundary.

The browser intake is public so failures before sign-in are observable. It accepts at most eight events
per request, a 64 KiB body and 20 batches per minute per IP; failures of its rate-limit backend reject
intake rather than bypassing the limit. No tenant, user, severity or server timestamp can be asserted.
The server marks accepted events `untrusted`, sanitizes them again, and returns only `204`. There is no
log-reading API. Browser reports must not be used as proof of payment, authorization or security events.

During a Desktop remote-instance switch, UI reports remain on the local endpoint. They cannot be queued
under one account and then forwarded under another. The remote API's authoritative failures remain in
its own diagnostics, linked through parent request references where applicable.

## Extending destinations and adding boundaries

Import browser-safe code from `@repo/core/diagnostics`. Only server entry points import
`@repo/core/diagnostics/node`; importing a library does not install fatal process handlers.

```ts
import { errorReporter, reportError, type ErrorSink } from "@repo/core/diagnostics";

// Call at the process entry point, after installNodeErrorReporting().
function configureErrors(exporter: ErrorSink) {
  errorReporter.setSink(exporter);
}

// A destination receives sanitized snapshots, not raw Error/request objects.
const exporter: ErrorSink = async (events, signal) => {
  const response = await fetch("https://logs.example.com/errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
    signal,
    redirect: "error",
  });
  if (!response.ok) throw new Error("Error exporter unavailable");
};

configureErrors(exporter);

try {
  await performOperation();
} catch (error) {
  reportError(error, { component: "my-module", operation: "my-operation", handled: true });
  throw error;
}
```

An exporter must honor its abort signal and avoid synchronous blocking work. Exporter credentials belong
in operator configuration, never event context. Install an exporter in each owning process; workers and
browsers do not share memory. No new environment variable currently enables a remote exporter.

Use `withErrorContext()` at new request/operation boundaries, `observeBackground()` for fresh jobs,
`reportCaughtError()` for recovered exceptions, and `observedAllSettled()` when intentionally collecting
multiple rejected tasks. Prefer one final outcome observation and shared boundaries over ad hoc reports
in every caller. An expected parse/probe/cancellation fallback can be documented with
`diagnostics-ignore: <specific reason>` when emitting an event would misrepresent a successful operation.

## Coverage audit and verification

The source audit covers the API, dashboard, Desktop, CLI, website, core, platform, adapters, databases,
onboarding, contracts and shared UI. On 2026-10-09 it accounts for over 4,200 catch, rejection-handler,
error-event and console-error boundaries. The HTTP source catalog contains 728 unique method/path pairs
across Cloud/local variants. The complete mounted application is also boot-tested in both modes, with
an assertion that the observer is the first middleware.

```sh
bun run errors:check
node scripts/audit-error-boundaries.mjs --json > error-boundaries.json
node scripts/audit-error-boundaries.mjs --routes > error-routes.json
```

The first JSON output identifies each file, line, boundary kind and disposition. The second inventories
each route, module, source and shared HTTP boundary, using the existing API documentation parser rather
than maintaining another route list. CI and the release gate reject newly silent catches and raw
warning/error logs. The audit is a static guard, not proof that arbitrary future code cannot fail or
that a remote collector received an event.

Regression coverage includes concurrent tenant contexts, preservation of results and rejections,
authentication/authorization responses, response IDs, streamed terminal failures, fatal Node/Bun child
processes, redaction and hostile accessors, stalled exporters, overflow, stderr backpressure, API boot,
public intake validation/size/rate limits, and a real Desktop-to-instance relay with local diagnostics.
A production dashboard build was also exercised in Chromium against a real temporary API: uncaught
browser exceptions and rejected promises arrived with request references and redacted text.
Existing deployment, rollback, migration, authentication, billing, CLI and Desktop tests continue to
exercise their original behavior in an isolated checkout. Validation never uses customer databases,
credentials or deployment destinations.
