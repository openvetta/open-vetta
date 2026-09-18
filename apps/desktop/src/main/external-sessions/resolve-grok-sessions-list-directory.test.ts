import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(() => {
	vi.resetModules();
	vi.unmock("../config/desktop-config-store.js");
	vi.unmock("./grok-session-locator.js");
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("resolveGrokSessionsListDirectory", () => {
	it("returns nothing when Grok import is disabled", async () => {
		const root = createRoot();
		await mockResolution({ grokEnabled: false, detectedPath: root });
		const { resolveGrokSessionsListDirectory } = await import("./resolve-grok-sessions-list-directory.js");
		expect(resolveGrokSessionsListDirectory()).toBeUndefined();
	});

	it("prefers the detected directory when import is enabled", async () => {
		const root = createRoot();
		await mockResolution({ grokEnabled: true, detectedPath: root, manualPath: join(root, "manual") });
		const { resolveGrokSessionsListDirectory } = await import("./resolve-grok-sessions-list-directory.js");
		expect(resolveGrokSessionsListDirectory()).toBe(root);
	});

	it("uses the manual directory only after detection fails", async () => {
		const root = createRoot();
		await mockResolution({ grokEnabled: true, manualPath: root });
		const { resolveGrokSessionsListDirectory } = await import("./resolve-grok-sessions-list-directory.js");
		expect(resolveGrokSessionsListDirectory()).toBe(root);
	});

	it("recognizes both detected and manual roots so neither is treated as a project", async () => {
		const detected = createRoot();
		const manual = createRoot();
		await mockResolution({ grokEnabled: true, detectedPath: detected, manualPath: manual });
		const { isGrokSessionsListDirectory, resolveGrokSessionsListDirectory } = await import(
			"./resolve-grok-sessions-list-directory.js"
		);
		expect(resolveGrokSessionsListDirectory()).toBe(detected);
		expect(isGrokSessionsListDirectory(detected)).toBe(true);
		expect(isGrokSessionsListDirectory(manual)).toBe(true);
		expect(isGrokSessionsListDirectory(createRoot())).toBe(false);
	});
});

function createRoot(): string {
	const directory = mkdtempSync(join(tmpdir(), "vetta-grok-list-dir-"));
	temporaryDirectories.push(directory);
	return directory;
}

async function mockResolution(input: {
	grokEnabled: boolean;
	detectedPath?: string;
	manualPath?: string;
}): Promise<void> {
	vi.doMock("../config/desktop-config-store.js", () => ({
		readConfigSync: () => ({
			sessionImport: { grokEnabled: input.grokEnabled, grokSessionDir: input.manualPath },
		}),
	}));
	vi.doMock("./grok-session-locator.js", () => ({
		detectGrokSessionsDirectory: () => ({ path: input.detectedPath }),
	}));
}
