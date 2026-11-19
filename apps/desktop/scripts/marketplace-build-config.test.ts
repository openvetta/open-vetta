import type * as Vite from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mainConfig from "../vite.main.config";

vi.mock("vite", async (importOriginal) => ({
	...(await importOriginal<typeof Vite>()),
	loadEnv: () => ({}),
}));

beforeEach(() => {
	for (const key of Object.keys(process.env)) {
		if (key.startsWith("VETTA_")) vi.stubEnv(key, undefined);
	}
	vi.stubEnv("VETTA_SPEECH_INPUT_ENABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("independent marketplace build configuration", () => {
	it.each(["development", "production"])(
		"leaves the official repository and ref to runtime defaults in %s",
		async (mode) => {
		if (typeof mainConfig !== "function") throw new Error("Expected a main config factory");
		const config = await mainConfig({ command: "build", mode });
		expect(config.define).toMatchObject({
			"process.env.VETTA_OPEN_MARKETPLACE_REPOSITORY": JSON.stringify(""),
			"process.env.VETTA_OPEN_MARKETPLACE_REF": "undefined",
			"process.env.VETTA_OPEN_MARKETPLACE_ARCHIVE_URL": JSON.stringify(""),
		});
		},
	);

	it("treats an explicitly blank repository as no default source", async () => {
		vi.stubEnv("VETTA_OPEN_MARKETPLACE_REPOSITORY", "   ");
		if (typeof mainConfig !== "function") throw new Error("Expected a main config factory");
		const config = await mainConfig({ command: "build", mode: "production" });
		expect(config.define?.["process.env.VETTA_OPEN_MARKETPLACE_REPOSITORY"]).toBe(JSON.stringify(""));
	});

	it("leaves a custom distribution ref unset so the runtime can fall back to main", async () => {
		vi.stubEnv("VETTA_OPEN_MARKETPLACE_REPOSITORY", "example/fork");
		if (typeof mainConfig !== "function") throw new Error("Expected a main config factory");
		const config = await mainConfig({ command: "build", mode: "production" });
		expect(config.define).toMatchObject({
			"process.env.VETTA_OPEN_MARKETPLACE_REPOSITORY": JSON.stringify("example/fork"),
			"process.env.VETTA_OPEN_MARKETPLACE_REF": "undefined",
		});
	});

	it("preserves explicit distribution overrides", async () => {
		vi.stubEnv("VETTA_OPEN_MARKETPLACE_REPOSITORY", "example/fork");
		vi.stubEnv("VETTA_OPEN_MARKETPLACE_REF", "stable");
		if (typeof mainConfig !== "function") throw new Error("Expected a main config factory");
		const config = await mainConfig({ command: "build", mode: "production" });
		expect(config.define).toMatchObject({
			"process.env.VETTA_OPEN_MARKETPLACE_REPOSITORY": JSON.stringify("example/fork"),
			"process.env.VETTA_OPEN_MARKETPLACE_REF": JSON.stringify("stable"),
		});
	});
});
