# @vetta/runtime-tools

Runtime-owned Agent tools and transitional compatibility exports.

The package root temporarily keeps the built-in tool exports from
`@vetta/coding-agent`. New tools are implemented independently under
`@vetta/runtime-tools/coding`.

## What It Owns

- TypeBox-backed Runtime Tool definitions
- coding tool registration metadata and scenario selection
- the greenfield Coding Tools Feature
- host executable resolution Port for `rg` and `fd`
- transitional re-exports of legacy coding tools

## What It Does Not Own

- tool execution policy
- agent state
- app-specific permission UX
- model or provider selection
- downloading or updating host executables

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

Host executable discovery follows the same boundary. A host may inject a
`CodingToolExecutableResolver` into grep/find; the Runtime receives only the
resolved path and never downloads or updates binaries:

```ts
const executableResolver = createLocalCodingToolExecutableResolver({
	binDirectory: managedBinDirectory,
});

createGrepToolRegistration(cwd, { executableResolver });
createFindToolRegistration(cwd, { executableResolver });
```

Hosts that manage downloads can implement the same Port by delegating to their
own downloader. The resolver is called at tool execution time, so a host can
replace or remove a binary without rebuilding the Runtime Snapshot.

The registry supports dynamic `register()` and `unregister()`. The Feature keeps
a long-lived Model Call Contribution Provider. Before every LLM call it reads
the latest versioned membership snapshot, so a registry change does not
recompile the Runtime Snapshot or reinitialize unrelated Features.

An advertised Coding Tool is resolved against the live Catalog immediately
before execution. Removal produces a recoverable tool error. Replacing a tool
under the same name cannot route an old-schema call into the new implementation.
The next LLM call receives the refreshed tool list.

Each tool has its own `src/coding/tools/<tool-name>/` directory. Model-visible
descriptions are exported from `description.ts` files so bundlers receive plain
TypeScript modules without a text-file generation step.

Runtime Tool definitions stay scenario-agnostic. Coding-only metadata such as
legacy `scope_use` and `category` lives in registrations. The composition root
owns the registry, tool-specific dependencies, and activation mode. Agent
Profile IDs are not treated as conversation scopes.
