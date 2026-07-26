# @vetta/runtime-core

Runtime contracts and host integration for Agent sessions.

The existing root entry continues to expose the production `RuntimeHost`. The
greenfield kernel is developed behind the explicit `@vetta/runtime-core/kernel`
entry until downstream adapters are ready to switch.

## What It Owns

- session lifecycle facade (`createSession`, `prompt`, `continue`, `abort`)
- runtime-safe event contract for hosts
- state snapshots and session history listing
- isolated Session state machine, Typed Turn Pipeline and Feature Compiler under `./kernel`
- acquire/release Runtime Snapshot lifecycle with atomic Turn-boundary switching
- `AgentCoreTurnEngine` adapter for the `@vetta/agent-core` model and tool loop
- runtime-owned tool execution and policy contracts

## What It Does Not Own

- provider implementations
- terminal UI
- Electron IPC wiring
- business-specific APIs or permissions

## Who Depends On It

- [packages/cli-app](../cli-app)
- [packages/desktop-app](../desktop-app)

## Main Exports

- `RuntimeHost`
- session event and state contracts from `src/contracts.ts`
- shared runtime error helpers
- `@vetta/runtime-core/kernel` for the new `AgentSession`, `TurnPipeline`,
  `FeatureCompiler`, `AtomicRuntimeSnapshotProvider`, `AgentCoreTurnEngine` and
  Port contracts
