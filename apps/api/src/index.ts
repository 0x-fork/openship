import { loadInstanceEnvironment } from "./lib/instance-environment";

// Integration credentials must be loaded before auth/providers are constructed.
await loadInstanceEnvironment();
await import("./server");
