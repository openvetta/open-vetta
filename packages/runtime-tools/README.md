# @vetta/runtime-tools

Runtime-owned Agent tools and transitional compatibility exports.

The package root temporarily keeps the built-in tool exports from
`@vetta/coding-agent`. New tools are implemented independently under
`@vetta/runtime-tools/coding`.

## What It Owns

- TypeBox-backed Runtime Tool definitions
- coding tool registration metadata and scenario selection
- the greenfield Coding Tools Feature
- transitional re-exports of legacy coding tools

## What It Does Not Own

- tool execution policy
- agent state
- app-specific permission UX
- model or provider selection

## Who Depends On It

- runtime hosts that want the default tool set without reaching into `coding-agent` internals

## Main Exports

- `codingTools`
- `readOnlyTools`
- individual tool factories such as `createReadTool`, `createBashTool`, `createTreeTool`
- `createCodingToolsFeature`, `createCurrentTimeTool`, `createReadTool`, and
  `createLsTool` from
  `@vetta/runtime-tools/coding`
- `createCurrentTimeToolRegistration`, `createReadToolRegistration`,
  `createLsToolRegistration`, `InMemoryCodingToolRegistry`,
  `selectCodingTools`, and `selectCodingToolsForScope` for
  composing scenario-specific Coding Tool snapshots

Greenfield tools are only published after their model-visible schema,
description, results, errors, side effects, and path behavior pass differential
tests against the legacy implementation.

The greenfield `read` implementation and the legacy implementation run the same
18-case behavior contract covering text, GB18030, path fallbacks, anchors,
truncation, images, binary hints, injected operations, and cancellation. Their
definitions, registrations, text results, and binary hints are also compared
directly. The greenfield Coding Tools Feature now contributes both
`current_time` and `read`.

The package root `createReadTool` remains the legacy compatibility export.
Import `createReadTool` from `@vetta/runtime-tools/coding` to use the independent
Runtime implementation. Production hosts have not switched to the greenfield
Feature yet.

The greenfield and legacy `ls` implementations run the same 15-case behavior
contract. It covers definition metadata, dotfiles, directory suffixes,
case-insensitive sorting, path fallbacks, default/custom entry limits, byte
truncation, injected operations, errors, and cancellation.

Legacy `ls` has an empty `scope_use`, meaning it is available for explicit
selection but inactive by default. Its greenfield registration preserves that
empty scope. Register it in a `CodingToolRegistry`, then use scope activation or
an explicit tool-name set when creating the Coding Tools Feature.

Tool-specific options belong to the registration composition root, not
`CodingToolsFeatureOptions`:

```ts
const registry = new InMemoryCodingToolRegistry([
	createCurrentTimeToolRegistration(),
	createReadToolRegistration(cwd, readOptions),
	createLsToolRegistration(cwd, lsOptions),
]);

createCodingToolsFeature({
	catalog: registry,
	activation: { mode: "scope", scope: "project" },
});
```

The registry supports dynamic `register()` and `unregister()`. Each Feature
compilation binds one versioned membership snapshot. After a registry change,
the composition root compiles and atomically publishes a new Runtime Snapshot;
an already running turn keeps its existing Snapshot lease.

Each tool has its own `src/coding/tools/<tool-name>/` directory. Model-visible
descriptions are exported from `description.ts` files so bundlers receive plain
TypeScript modules without a text-file generation step.

Runtime Tool definitions stay scenario-agnostic. Coding-only metadata such as
legacy `scope_use` and `category` lives in registrations. The composition root
owns the registry, tool-specific dependencies, and activation mode. Agent
Profile IDs are not treated as conversation scopes.
