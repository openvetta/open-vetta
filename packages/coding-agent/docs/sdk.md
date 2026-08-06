# Coding Agent SDK entrypoints

The package root, `@vetta/coding-agent`, is the stable Extension authoring facade. It is not a general SDK
aggregate. Application hosts should import each capability from its explicit public subpath.

## Create a session

```typescript
import { createCodingAgentSession } from "@vetta/coding-agent/sdk";

const { session } = await createCodingAgentSession({
  storage: { kind: "memory" },
});

await session.prompt("What files are in the current directory?");
```

See the [stable SDK reference](stable-sdk.md) for session, host, storage, model, tool, resource, and lifecycle
contracts. Working examples live in [examples/sdk](../examples/sdk/).

## Public boundaries

| Need | Import path |
| --- | --- |
| Write an Extension | `@vetta/coding-agent` or `@vetta/coding-agent/extensions` |
| Embed Coding Agent sessions | `@vetta/coding-agent/sdk` |
| Integrate RPC | `@vetta/coding-agent/rpc` |
| Compose runtime capabilities | `@vetta/coding-agent/runtime` |
| Provide host services | `@vetta/coding-agent/host-services` |
| Read or write settings | `@vetta/coding-agent/settings` |
| Work with profiles | `@vetta/coding-agent/profile` |
| Load session resources | `@vetta/coding-agent/resources` |
| Query or migrate historical sessions | `@vetta/coding-agent/historical-sessions` |

The retired package-root `createAgentSession`, `SessionManager`, `SettingsManager`, `ModelRegistry`, and
`DefaultResourceLoader` APIs are not compatibility requirements for the rewritten architecture. Their user-visible
behaviors are available through the stable SDK and the explicit host/resource/session boundaries above.
