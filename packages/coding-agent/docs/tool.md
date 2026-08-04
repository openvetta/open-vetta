# Built-in Tool Integration

Built-in Tool implementations belong to `@vetta/runtime-tools/coding`. `coding-agent` owns only product composition,
host adapters and activation policy; it must not define or re-export concrete built-in Tool factories.

## Implement the Tool

Create `packages/runtime-tools/src/coding/tools/<tool-name>/` with separate modules for:

- `description.ts`: model-facing description as a TypeScript constant.
- `<tool-name>-tool.ts`: TypeBox input schema, Runtime Tool definition and narrow Operations ports.
- `registration.ts`: scope, capability requirements, category and optional model order.
- `index.ts`: the Tool-local public surface.

The Tool implementation may depend on Runtime contracts and injected Operations. It must not import `coding-agent`.
Stateful behavior remains owned by the Session or product host and is injected through a Store or Operations port.

## Compose the Tool

Export the Tool from `packages/runtime-tools/src/coding/index.ts`. Product composition roots register it with the dynamic
`CodingToolRegistry`; `coding-agent` may provide host capabilities and product activation names, but must not wrap the
Tool in a second implementation.

Runtime Catalog membership is dynamic. Registration or removal affects subsequent model calls without rebuilding the
whole Agent Runtime; an in-flight model call continues to use its acquired capability binding.

## Preserve Behavior

When replacing an existing Tool, test the observable contract before deleting the old implementation:

- name, label, description and TypeBox schema;
- scope, capability requirements, category and model order;
- result content, details and exact error text;
- cancellation, progress, state sequencing and side effects;
- CLI, SDK, RPC and IM activation behavior.

The old implementation may be used temporarily as a test Oracle, but new production code must not call it. Delete the
old implementation and structural tests after the native replacement is verified.

## Verify

Run targeted tests from the owning package, then the repository quality gates:

```bash
cd packages/runtime-tools
bunx vitest --run test/coding/<tool-name>.test.ts

cd ../..
bun run check:quick
bun run check
```

The rewrite guard must report zero Runtime-to-`coding-agent` backedges. Once a migrated legacy domain reaches zero,
update its baseline to zero so future imports fail the guard.
