import { describe, expect, it } from "vitest";
import { parsePluginManifest } from "../src/manifest.js";

const baseManifest = {
	id: "permissions-test",
	name: "Permissions test",
	version: "1.0.0",
	pluginApiVersion: "^2.8.0",
	entry: "dist/index.js",
	moduleFederation: { remoteName: "permissions_test", expose: "./plugin" },
};

describe("plugin manifest permissions", () => {
	it("accepts terminal.run alongside the bottom panel slot", () => {
		const manifest = parsePluginManifest({ ...baseManifest, permissions: ["ui.slot.bottom-panel", "terminal.run"] });
		expect(manifest.permissions).toEqual(["ui.slot.bottom-panel", "terminal.run"]);
	});

	it("accepts the conversation header action slot at Plugin API 2.9", () => {
		const manifest = parsePluginManifest({
			...baseManifest,
			pluginApiVersion: "^2.9.0",
			permissions: ["ui.slot.header-action", "agent.command.run"],
			commands: ["open"],
		});
		expect(manifest.permissions).toEqual(["ui.slot.header-action", "agent.command.run"]);
	});

	it("rejects permission strings the host does not know", () => {
		expect(() => parsePluginManifest({ ...baseManifest, permissions: ["terminal.exec"] })).toThrow();
	});
});
