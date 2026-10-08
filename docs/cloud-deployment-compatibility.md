# Managed Cloud deployment compatibility

Openship Cloud builds and runs applications on isolated containers and serves static output through Pages. Importing `vercel.json` is a configuration compatibility feature; it does not provide Vercel's Functions, Edge runtime or storage APIs.

## Automatic Node behavior

For generated Cloud Node images, Openship selects a compatible image from `package.json`'s `engines.node` requirement. The default major is retained if the complete major satisfies the range; otherwise a compatible major, minor or exact version is selected. An explicit project image remains authoritative. Build and runtime retain the same official Node image pin. Bun retains its own runtime.

A managed Node runtime adapter makes an application's declared public ports reachable when its Node server binds to `localhost`, `127.0.0.1` or `::1`. It adapts `net.Server.listen()` at runtime, supporting positional and options-object signatures. This covers Node HTTP/HTTPS servers and frameworks using those APIs. It does not edit repository files, alter ports, scan for services, use host networking or create another proxy container.

Only ports published for that workload are adapted. Other private listeners, Unix sockets, handles, ephemeral port-zero listeners and explicit non-loopback bind addresses retain their behavior. The public port must still agree with the application; Openship does not guess which of several servers should be public. The adapter is activated by the Cloud runtime, remains active across environment refreshes, and preserves existing `NODE_OPTIONS`. Build/install commands execute before the runtime adapter is installed.

Static builds, workers without published ports, custom Dockerfiles, prebuilt images and non-Node runtimes keep their existing startup contracts. A custom Dockerfile should bind its public service to `0.0.0.0` or an equivalent reachable interface. Exporting a generated image outside Cloud does not activate the listener adaptation unless its managed public-port environment is retained.

## Imported configuration

| Configuration                                                                        | Behavior                                                                                                                                                            |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `installCommand`, `buildCommand`                                                     | Imported; explicit empty strings disable the step and are represented internally as a shell no-op.                                                                  |
| `outputDirectory`, supported `framework` presets                                     | Used during detection. Explicit native Openship configuration takes precedence over imported metadata.                                                              |
| `rewrites`, `redirects`                                                              | Supported literal paths and the shared compiler's trailing wildcard/capture syntax are compiled for the Cloud edge. Unsupported syntax is reported by the compiler. |
| `headers`                                                                            | Safe literal header names/values, with exact literal-path matches and supported prefix wildcard matches.                                                            |
| `cleanUrls`, `trailingSlash`                                                         | Compiled to the edge's URL policies.                                                                                                                                |
| Conditional `has` / `missing` rules                                                  | Not imported as unconditional rules; surfaced as configuration warnings.                                                                                            |
| `functions`, legacy `builds` / `routes`, `regions`, `crons`, `env`, `build`, `fluid` | Not emulated; surfaced as compatibility warnings. Configure the corresponding Openship feature where available.                                                     |

This is a supported subset, not a promise to execute every Vercel project unchanged. Middleware, framework-specific platform APIs, custom regular expressions, function packaging, scheduling and external services require their own compatible implementation. Review configuration diagnostics before deployment.

For example, a `server.mjs` using Node SQLite is a server application even if it also has a `public` directory. The application must run to answer `/api/*`; serving its static assets alone cannot supply that API. Persistent SQLite also requires a persistent volume and an application-configured database path. Openship does not infer which arbitrary files should survive deployments or manufacture missing provider credentials.

## Deployment and verification

Cloud web deployments include their configured managed hostname in the route plan. Replacing a container republishes the edge route against its current host port; this is independent of local OpenResty routing. Readiness configuration remains explicit and is preserved.

Regression coverage includes Node engine ranges, runtime image pins, real Node listener behavior, Cloud environment activation/refresh, metadata precedence, conditional-rule diagnostics, exact headers, and managed hostname planning. An isolated Docker network check also verifies that the unchanged localhost-bound public listener is reachable through port publishing while an unconfigured private listener remains inaccessible.
