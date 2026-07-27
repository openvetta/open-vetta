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
- acquire/release Runtime Snapshot lifecycle with atomic Feature-topology switching
- per-model-call prompt and tool materialization through Model Call Contribution Providers
- `AgentCoreTurnEngine` adapter for the `@vetta/agent-core` model and tool loop
- session-owned steering/follow-up queues with configurable consumption modes
- explicit Greenfield session backend for prompt/continue/abort, mapped events and repository-backed state
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
- `RuntimeSessionBackend` and `LegacyCodingAgentSessionBackend` for composition-root session creation
- `GreenfieldRuntimeSessionBackend` for parallel Kernel composition without impersonating the legacy session
- `RuntimeSessionObservationEvent` and Greenfield Kernel-to-`SessionEvent` adapters
- session event and state contracts from `src/contracts.ts`
- shared runtime error helpers
- `@vetta/runtime-core/kernel` for the new `AgentSession`, `TurnPipeline`,
  `FeatureCompiler`, `AtomicRuntimeSnapshotProvider`, `AgentCoreTurnEngine` and
  Port contracts
