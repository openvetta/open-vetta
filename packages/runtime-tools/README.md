# @vetta/runtime-tools

Runtime-owned Agent tools and transitional compatibility exports.

The package root temporarily keeps the built-in tool exports from
`@vetta/coding-agent`. New tools are implemented independently under
`@vetta/runtime-tools/coding`.

## What It Owns

- TypeBox-backed Runtime Tool definitions
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
- `createCodingToolsFeature` and `createCurrentTimeTool` from
  `@vetta/runtime-tools/coding`
