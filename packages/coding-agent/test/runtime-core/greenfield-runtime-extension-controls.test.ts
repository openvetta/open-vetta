import { describe, expect, it, vi } from "vitest";
import type { CodingAgentGreenfieldExtensionEventBridge } from "../../src/adapters/runtime-core/greenfield.js";
import {
	createGreenfieldRuntimeExtensionControls,
	type GreenfieldExtensionToolHostPort,
} from "../../src/composition/greenfield-runtime-extension-controls.js";
import { InMemoryGreenfieldSessionValueIndex } from "../../src/composition/greenfield-session-resource-index.js";
import type { ExtensionRunner } from "../../src/core/extensions/runner.js";
import type { Extension } from "../../src/core/extensions/types.js";

describe("Greenfield Runtime Extension Controls", () => {
	it("binds live Event Bridge and Tool Runtime ports with the existing cleanup order", () => {
		const cleanupOrder: string[] = [];
		const bindEvents = vi.fn(() => () => cleanupOrder.push("events"));
		const bridge = {
			bind: bindEvents,
			readSystemPrompt: () => "extension prompt",
		} as unknown as CodingAgentGreenfieldExtensionEventBridge;
		const bindTools = vi.fn(() => () => cleanupOrder.push("tools"));
		const refresh = vi.fn();
		const extensionToolRuntime = { bindRunner: bindTools, refresh } satisfies GreenfieldExtensionToolHostPort;
		const extensionEventBridges =
			new InMemoryGreenfieldSessionValueIndex<CodingAgentGreenfieldExtensionEventBridge>();
		const controls = createGreenfieldRuntimeExtensionControls({
			indexes: { extensionEventBridges },
			extensionToolRuntime,
		});
		extensionEventBridges.set("session", bridge);
		const runner = {} as ExtensionRunner;
		const bindingOptions = { replaceExisting: true };
		const extensions: Extension[] = [];

		const binding = controls.bindExtensionRunner("session", runner, bindingOptions);
		controls.refreshExtensionTools(extensions);

		expect(binding.readSystemPrompt()).toBe("extension prompt");
		expect(bindEvents).toHaveBeenCalledWith(runner, bindingOptions);
		expect(bindTools).toHaveBeenCalledWith("session", runner, bindingOptions);
		expect(refresh).toHaveBeenCalledWith(extensions);
		binding.dispose();
		expect(cleanupOrder).toEqual(["tools", "events"]);
	});

	it("preserves missing-bridge errors and optional Tool Runtime behavior", () => {
		const extensionEventBridges =
			new InMemoryGreenfieldSessionValueIndex<CodingAgentGreenfieldExtensionEventBridge>();
		const controls = createGreenfieldRuntimeExtensionControls({ indexes: { extensionEventBridges } });
		const runner = {} as ExtensionRunner;

		expect(() => controls.bindExtensionRunner("missing", runner)).toThrow(
			"Greenfield Extension event bridge not found: missing",
		);
		expect(() => controls.refreshExtensionTools([])).not.toThrow();
	});
});
