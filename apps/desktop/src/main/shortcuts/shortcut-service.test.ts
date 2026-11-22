import { describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../../shared/notification-preferences.js";
import type { DesktopConfig } from "../config/desktop-config-store.js";
import { ShortcutService } from "./shortcut-service.js";

vi.mock("electron", () => ({
	BrowserWindow: { getAllWindows: () => [] },
}));

function createFixture(initial?: Partial<DesktopConfig>) {
	let config: DesktopConfig = {
		schemaVersion: 2,
		projects: [],
		archivedProjects: [],
		workspacePath: "C:\\workspace",
		defaultExecutionMode: "full-access",
		notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
		shortcuts: { bindings: {} },
		...initial,
	};
	const broadcastBindings = vi.fn();
	const service = new ShortcutService({
		readConfig: async () => structuredClone(config),
		updateConfig: async (update) => {
			config = structuredClone(await update(structuredClone(config)));
			return structuredClone(config);
		},
		broadcastBindings,
	});
	return {
		broadcastBindings,
		getConfig: () => config,
		service,
	};
}

describe("ShortcutService", () => {
	it("normalizes bindings and rejects conflicts with effective defaults", async () => {
		const fixture = createFixture();

		await expect(fixture.service.setBinding("new-session", "mod+o")).rejects.toThrow(
			'Shortcut "mod+o" is already bound to "open-project".',
		);
		await expect(fixture.service.setBinding("new-session", "")).rejects.toThrow("Invalid shortcut combo: ");
		expect(fixture.broadcastBindings).not.toHaveBeenCalled();
	});

	it("persists custom bindings and removes overrides that match the default", async () => {
		const fixture = createFixture();

		await fixture.service.setBinding("new-session", "shift+mod+n");
		expect(fixture.getConfig().shortcuts?.bindings).toEqual({ "new-session": "mod+shift+n" });
		expect(fixture.broadcastBindings).toHaveBeenLastCalledWith({ "new-session": "mod+shift+n" });

		await fixture.service.setBinding("new-session", "mod+n");
		expect(fixture.getConfig().shortcuts?.bindings).toEqual({});
		expect(fixture.broadcastBindings).toHaveBeenLastCalledWith({});
	});

	it("reports only shortcut bindings in settings snapshots", async () => {
		const fixture = createFixture({ shortcuts: { bindings: { "new-session": "mod+shift+n" } } });

		const settings = await fixture.service.getSettings();
		expect(Object.keys(settings)).toEqual(["bindings"]);
		expect(settings.bindings).toContainEqual(expect.objectContaining({ id: "new-session", shortcut: "mod+shift+n" }));
	});
});
