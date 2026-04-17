# @vetta/runtime-telemetry

Minimal telemetry contract for runtime and host packages.

## What It Owns

- `RuntimeLogger` interface
- `ConsoleRuntimeLogger` default implementation
- structured logger context shape

## What It Does Not Own

- metrics pipelines
- tracing backends
- business analytics

## Who Depends On It

- runtime and host packages that want a narrow logging abstraction without committing to a full observability stack
