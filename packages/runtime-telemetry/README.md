# @vetta/runtime-telemetry

Minimal telemetry contract for runtime and host packages.

## What It Owns

- `RuntimeLogger` interface
- `ConsoleRuntimeLogger` default implementation
- structured logger context shape
- platform-neutral `RuntimeTracer` / `RuntimeObservation` interfaces
- optional Langfuse exporter in `@vetta/runtime-telemetry/langfuse`

## What It Does Not Own

- metrics pipelines
- business analytics

## Langfuse

```ts
import { createLangfuseRuntimeTracerFromEnv } from "@vetta/runtime-telemetry/langfuse";

const tracer = createLangfuseRuntimeTracerFromEnv();
```

Set `VETTA_TRACING=langfuse` plus Langfuse credentials (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, optional `LANGFUSE_BASE_URL`) to enable it.

## Who Depends On It

- runtime and host packages that want a narrow logging abstraction without committing to a full observability stack
