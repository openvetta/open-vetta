# Package Conventions

This document defines low-intrusion conventions for adding or refactoring code in this monorepo.

## Package-Level Rules

### Package README requirements

Each top-level package should explain three things:

- `What it owns`
- `What it does not own`
- `Who depends on it`

If a package has no README yet, add one before making it a shared dependency.

### Import direction

- app packages may depend on runtime and library packages
- runtime packages may depend on `coding-agent`
- shared libraries must not depend on app packages
- business packages must not depend on coding-agent internals unless the package explicitly exists for host integration

### Public entrypoints

- expose supported APIs from `src/index.ts`
- avoid cross-package deep imports when a public entrypoint exists
- if a deep import is unavoidable, add a short comment explaining why

## Directory-Level Rules

### `core/`

Use `core/` only for package-defining orchestration code. Do not use it as a generic dumping ground.

Good examples:

- session orchestration
- event bus
- runtime host facade

Bad examples:

- one-off formatters
- UI helpers
- local adapters that belong under a narrower domain folder

### `utils/`

`utils/` should contain stateless helpers with narrow responsibilities.

- prefer pure functions
- avoid hidden global state
- avoid business workflows
- split by topic once a file grows beyond a single concern

### `components/`, `hooks/`, `services/`

- `components/`: rendering and interaction only
- `hooks/`: UI state composition only
- `services/`: IO, transport, persistence, or orchestration behind a stable interface

If a React component file starts performing transport or persistence directly, move that logic into a service or hook.

## Shared Code Extraction

Before copying code between packages:

1. check whether the repeated logic is pure
2. extract the pure logic first
3. leave package-specific wiring where it is

Preferred extraction order:

- pure helper
- view model / shape transformer
- reusable UI component
- shared service

Avoid extracting entire pages or workflows unless the behavior is already aligned.

## Logging And Errors

- library and runtime packages should prefer injected or wrapped loggers over raw `console.log`
- UI packages should surface user-facing errors near the boundary, not deep in shared code
- catch blocks should default to `unknown`, then narrow

## Types

- avoid `any` in production code unless the source is truly dynamic
- prefer `unknown` at boundaries and narrow it
- for third-party libraries, define small local adapter types instead of spreading `any`

## Refactoring Safety Checklist

For low-risk structural changes:

1. preserve file exports
2. preserve route names, IPC channels, and API contracts
3. extract helpers without changing behavior
4. add or update docs in the same change
5. run repository checks after each cluster of edits

## Current Priorities

These are good candidates for future low-risk cleanup:

- shared file preview helpers inside `packages/web-ui`
- shared flowing graph presentation logic between `packages/admin` and `packages/desktop-app`
- stronger runtime path validation at host boundaries
- replacing high-value `any` usages in runtime-facing types
