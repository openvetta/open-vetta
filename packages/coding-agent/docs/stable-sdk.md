# Stable Coding Agent SDK

`@vetta/coding-agent/sdk` is the product-level embedding contract. It exposes Session values and capabilities while
keeping authentication, settings, resource loading, persistence implementations and Runtime composition internal.

## Quick start

```typescript
import { createCodingAgentSession } from "@vetta/coding-agent/sdk";

const { session, diagnostics } = await createCodingAgentSession({
  storage: { kind: "memory" },
});

const unsubscribe = session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("What files are in the current directory?");
unsubscribe();
await session.close();

for (const diagnostic of diagnostics) {
  console.error(`${diagnostic.source}: ${diagnostic.message}`);
}
```

The model and credentials are resolved by the product host when `model` is omitted. A caller may also pass a
`Model` value from `@vetta/ai` without injecting a model registry.

## Storage and session catalog

Session creation accepts storage intent instead of a storage manager:

```typescript
import { join } from "node:path";
import {
  createCodingAgentSession,
  createCodingAgentSessionCatalog,
} from "@vetta/coding-agent/sdk";

const cwd = process.cwd();
const conversationDir = join(cwd, ".vetta", "conversations");

const created = await createCodingAgentSession({
  cwd,
  storage: { kind: "file-create", conversationDir },
});
await created.session.close();

const catalog = createCodingAgentSessionCatalog({ cwd, conversationDir });
const recent = await catalog.findRecent();

if (recent) {
  const resumed = await createCodingAgentSession({
    cwd,
    storage: { kind: "file-resume", conversationDir, sessionPath: recent.path },
  });
  await resumed.session.close();
}
```

The catalog is an offline query capability. It does not own an active Session, acquire its lifecycle, or become an
injection parameter of `createCodingAgentSession()`.

## Resource contributions

Explicit resources are values and paths, not a resource loader:

```typescript
const { session } = await createCodingAgentSession({
  appendSystemPrompt: "Keep answers concise.",
  resources: {
    systemPrompt: "You are a project coding assistant.",
    extensionPaths: ["./extensions/audit.ts"],
    skillPaths: ["./skills/release/SKILL.md"],
    promptTemplatePaths: ["./prompts/review.md"],
    promptTemplates: [
      {
        name: "check",
        description: "Check the current change",
        content: "Review the current change for correctness and regressions.",
      },
    ],
    contextFiles: [
      {
        path: "/virtual/SDK_CONTEXT.md",
        content: "Use strict TypeScript and preserve existing behavior.",
      },
    ],
  },
});
```

Calling `session.reload()` re-discovers path resources. Removing or adding a local Skill, prompt template or Extension
therefore affects the next resolved runtime view; the SDK does not retain a permanent startup copy of path content.
Inline context and prompt-template contributions remain attached to that Session composition.

Arbitrary discovery filtering, inline Extension factories and direct loader replacement remain on the package-root
compatibility API until they have stable capability-specific contracts.

## Tools

Built-in tools are selected by name and are resolved against the Session `cwd`:

```typescript
const { session } = await createCodingAgentSession({
  cwd: "/path/to/project",
  activeTools: ["read", "grep", "glob", "find", "ls", "dir_tree"],
});
```

`customTools` accepts Session-private tool definitions. Their TypeBox schemas and invocation inputs are validated at
the product boundary. Runtime tools can be added, replaced or removed later with `session.reconfigureCustomTools()`.

## Session capabilities

The returned stable Session supports:

- prompting, steering, follow-up messages, events and abort;
- model, thinking-level, mode and active-tool changes;
- queue inspection, compaction, retry and context usage;
- native new, switch, fork and tree-navigation operations;
- prompt-template, task, todo, memory, MCP and resource reload views;
- Bash execution and HTML export.

Concrete model registries, settings managers, resource loaders, session managers and Extension runners are not Session
properties.

## Host services and compatibility

Authentication, custom provider registration and persistent settings are host concerns:

```typescript
import { AuthStorage, ModelRegistry, SettingsManager } from "@vetta/coding-agent/host-services";
```

Consumers that must inject those concrete services into Session creation should keep using package-root
`createAgentSession()` during migration. See the [compatibility reference](sdk.md). The stable SDK does not silently
ignore unsupported manager injection.

## Examples

See [`examples/sdk`](../examples/sdk/README.md). Its table labels each example as stable SDK, host service or
compatibility usage.
