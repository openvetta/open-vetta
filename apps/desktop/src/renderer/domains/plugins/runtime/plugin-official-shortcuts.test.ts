import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfficialShortcutsApi } from "./plugin-official-shortcuts.js";

afterEach(() => {
	Reflect.deleteProperty(globalThis, "window");
});

describe("createOfficialShortcutsApi", () => {
	it("keeps the action catalog local and routes settings through the capability session", async () => {
		const settings = { bindings: [] };
		const shortcuts = {
			getSettings: vi.fn().mockResolvedValue(settings),
			setBinding: vi.fn().mockResolvedValue({ bindings: [] }),
			resetBinding: vi.fn().mockResolvedValue({ bindings: [], shortcut: "mod+n" }),
			resetAllBindings: vi.fn().mockResolvedValue({ bindings: [] }),
		};
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { vetta: { plugins: { internalCapabilities: { shortcuts } } } },
		});
		const assertOfficial = vi.fn();
		const api = createOfficialShortcutsApi(assertOfficial, "capability-session");

		expect(api.listAvailableActions()).toEqual([
			{ id: "new-session", defaultShortcut: "mod+n" },
			{ id: "open-project", defaultShortcut: "mod+o" },
			{ id: "open-settings", defaultShortcut: "mod+," },
			{ id: "open-command-menu", defaultShortcut: "mod+t" },
			{ id: "open-model-selector", defaultShortcut: "mod+p" },
			{ id: "save-file", defaultShortcut: "mod+s" },
			{ id: "steer-message", defaultShortcut: "mod+enter" },
			{ id: "toggle-plan-mode", defaultShortcut: "shift+tab" },
		]);
		await expect(api.get()).resolves.toEqual(settings);
		await expect(api.setBinding("new-session", "mod+shift+n")).resolves.toEqual({ bindings: [] });
		await expect(api.resetBinding("new-session")).resolves.toEqual({ bindings: [], shortcut: "mod+n" });
		await expect(api.resetAllBindings()).resolves.toEqual({ bindings: [] });

		expect(assertOfficial).toHaveBeenCalledTimes(5);
		expect(shortcuts.getSettings).toHaveBeenCalledWith("capability-session");
		expect(shortcuts.setBinding).toHaveBeenCalledWith("capability-session", "new-session", "mod+shift+n");
		expect(shortcuts.resetBinding).toHaveBeenCalledWith("capability-session", "new-session");
		expect(shortcuts.resetAllBindings).toHaveBeenCalledWith("capability-session");
	});
});
