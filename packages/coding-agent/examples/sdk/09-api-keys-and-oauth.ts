/**
 * API Keys and OAuth
 *
 * Configure API key resolution via AuthStorage and ModelRegistry.
 */

import { AuthStorage, createCodingAgentHostWithServices, ModelRegistry } from "@vetta/coding-agent/host-services";

// Default: AuthStorage uses ~/.pi/agent/auth.json
// ModelRegistry loads built-in + custom models from ~/.pi/agent/models.json
const authStorage = AuthStorage.create();
const modelRegistry = new ModelRegistry(authStorage);

const defaultHost = createCodingAgentHostWithServices({
	authStorage,
	modelRegistry,
});
await defaultHost.createSession({ storage: { kind: "memory" } });
await defaultHost.close();
console.log("Session with default auth storage and model registry");

// Custom auth storage location
const customAuthStorage = AuthStorage.create("/tmp/my-app/auth.json");
const customModelRegistry = new ModelRegistry(customAuthStorage, "/tmp/my-app/models.json");

const customHost = createCodingAgentHostWithServices({
	authStorage: customAuthStorage,
	modelRegistry: customModelRegistry,
});
await customHost.createSession({ storage: { kind: "memory" } });
await customHost.close();
console.log("Session with custom auth storage location");

// Runtime API key override (not persisted to disk)
authStorage.setRuntimeApiKey("anthropic", "sk-my-temp-key");
const runtimeKeyHost = createCodingAgentHostWithServices({
	authStorage,
	modelRegistry,
});
await runtimeKeyHost.createSession({ storage: { kind: "memory" } });
await runtimeKeyHost.close();
console.log("Session with runtime API key override");

// No models.json - only built-in models
const simpleRegistry = new ModelRegistry(authStorage); // null = no models.json
const simpleHost = createCodingAgentHostWithServices({
	authStorage,
	modelRegistry: simpleRegistry,
});
await simpleHost.createSession({ storage: { kind: "memory" } });
await simpleHost.close();
console.log("Session with only built-in models");
