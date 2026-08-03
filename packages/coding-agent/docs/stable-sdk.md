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
		skills: [
			{
				name: "project-review",
				description: "Review this project",
				content: "Preserve behavior and report regressions.",
			},
		],
		skillPolicy: { exclude: { names: ["deprecated-skill"] } },
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

Dynamic Skill and Extension sources use revisions and invalidation rather than exposing a loader:

```typescript
let revision = 1;
let paths = ["./skills/review/SKILL.md"];

const { session } = await createCodingAgentSession({
  skillSources: [
    {
      id: "project-skills",
      read: () => ({ revision, paths }),
    },
  ],
});

paths = ["./skills/release/SKILL.md"];
revision += 1;
await session.reload();
```

A source subscription only marks its revision stale. The current Turn keeps its acquired capabilities; the source is
read before the next ordinary prompt or by explicit `session.reload()`. Steering and follow-up input do not replace
resources inside an active Turn. Skill-only changes reapply the Skill slice, while Extension changes use the existing
Extension reload transaction. Closing the Session unsubscribes and disposes its sources.

Inline Extension factories and direct loader replacement remain on the package-root compatibility API. Stable
Extension sources contribute paths; Extension module loading and execution stay owned by the product Host.

## Tools

Built-in tools are selected by name and are resolved against the Session `cwd`:

```typescript
const { session } = await createCodingAgentSession({
  cwd: "/path/to/project",
  activeTools: ["read", "grep", "glob", "find", "ls", "dir_tree"],
});
```

`customTools` accepts Session-private tool definitions. Their TypeBox schemas and invocation inputs are validated at
the product boundary. Tool execution receives a stable capability context for common UI interaction, cancellation,
context usage, compaction and permission requests; it does not expose concrete session or model managers. Optional
tool renderers use structural Theme and Component contracts instead of the Extension implementation types. Runtime
tools can be added, replaced or removed later with `session.reconfigureCustomTools()`.

Extensions that need the complete registration API, mutable provider discovery or complex host UI composition should
use `@vetta/coding-agent/extensions` or the package-root compatibility API. Those capabilities are not folded into the
stable Session tool context.

## Session capabilities

The returned stable Session supports:

- prompting, steering, follow-up messages, events and abort;
- model, thinking-level, mode and active-tool changes;
- queue inspection, compaction, retry and context usage;
- native new, switch, fork and tree-navigation operations;
- Skill, prompt-template, task, todo, memory, MCP and resource reload views;
- Bash execution and HTML export.

Concrete model registries, settings managers, resource loaders, session managers and Extension runners are not Session
properties.

## Host services and compatibility

Authentication, custom provider registration and persistent settings are host concerns:

```typescript
import {
  AuthStorage,
  createCodingAgentHostWithServices,
  ModelRegistry,
  SettingsManager,
} from "@vetta/coding-agent/host-services";

const authStorage = AuthStorage.inMemory();
const modelRegistry = new ModelRegistry(authStorage);
const settingsManager = SettingsManager.inMemory();

const host = createCodingAgentHostWithServices({
  authStorage,
  modelRegistry,
  settingsManager,
});
const { session } = await host.createSession({ storage: { kind: "memory" } });
await host.close();
```

The Host owns every Session it creates and rejects new Sessions after closing starts. A Session closed directly is
released from Host ownership; `host.close()` waits for admitted creations and closes the remaining Sessions. Concrete
services passed to `createCodingAgentHostWithServices()` are borrowed and remain caller-owned.

`createCodingAgentHost()` from `@vetta/coding-agent/sdk` provides the same multi-Session lifecycle with normal product
defaults. Session defaults are shallowly overridden by each `createSession()` call. Storage and dynamic Skill/Extension
sources are intentionally per-Session and cannot be placed in Host defaults.

Complete ResourceLoader or Composition replacement remains on the package-root compatibility API. See the
[compatibility reference](sdk.md); concrete managers are not exposed as Session properties.

## Examples

See [`examples/sdk`](../examples/sdk/README.md). Its table labels each example as stable SDK, host service or
compatibility usage.
