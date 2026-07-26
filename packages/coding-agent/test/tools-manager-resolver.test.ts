import { describe, expect, it } from "vitest";
import {
	createToolExecutableResolver,
	type EnsureToolDependencies,
	ensureToolWithDependencies,
} from "../src/adapters/runtime-tools/executable-resolver.js";

function createDependencies(overrides: Partial<EnsureToolDependencies> = {}): EnsureToolDependencies {
	return {
		getPath: () => null,
		isOffline: () => false,
		platform: () => "linux",
		download: async (tool) => `${tool}-downloaded`,
		...overrides,
	};
}

describe("legacy tool executable resolver adapter", () => {
	it("delegates resolution silently and preserves resolved paths", async () => {
		const calls: Array<{ readonly tool: "fd" | "rg"; readonly silent: boolean | undefined }> = [];
		const resolver = createToolExecutableResolver(async (tool, silent) => {
			calls.push({ tool, silent });
			return `${tool}-path`;
		});

		await expect(resolver.resolve("rg")).resolves.toBe("rg-path");
		await expect(resolver.resolve("fd")).resolves.toBe("fd-path");
		expect(calls).toEqual([
			{ tool: "rg", silent: true },
			{ tool: "fd", silent: true },
		]);
	});

	it("preserves unavailable tools as undefined", async () => {
		const resolver = createToolExecutableResolver(async () => undefined);

		await expect(resolver.resolve("rg")).resolves.toBeUndefined();
	});
});

describe("ensureTool host behavior", () => {
	it("returns an existing executable without downloading", async () => {
		let downloads = 0;
		const dependencies = createDependencies({
			getPath: () => "/managed/rg",
			download: async () => {
				downloads += 1;
				return "/downloaded/rg";
			},
		});

		await expect(ensureToolWithDependencies("rg", true, dependencies)).resolves.toBe("/managed/rg");
		expect(downloads).toBe(0);
	});

	it("skips downloads in offline mode", async () => {
		let downloads = 0;
		const dependencies = createDependencies({
			isOffline: () => true,
			download: async () => {
				downloads += 1;
				return "/downloaded/rg";
			},
		});

		await expect(ensureToolWithDependencies("rg", true, dependencies)).resolves.toBeUndefined();
		expect(downloads).toBe(0);
	});

	it("skips downloads on Android/Termux", async () => {
		let downloads = 0;
		const dependencies = createDependencies({
			platform: () => "android",
			download: async () => {
				downloads += 1;
				return "/downloaded/fd";
			},
		});

		await expect(ensureToolWithDependencies("fd", true, dependencies)).resolves.toBeUndefined();
		expect(downloads).toBe(0);
	});

	it("returns downloaded paths and converts download failures to unavailable", async () => {
		const dependencies = createDependencies({
			download: async (tool) => `/downloaded/${tool}`,
		});
		await expect(ensureToolWithDependencies("fd", true, dependencies)).resolves.toBe("/downloaded/fd");

		const failedDependencies = createDependencies({
			download: async () => {
				throw new Error("network unavailable");
			},
		});
		await expect(ensureToolWithDependencies("rg", true, failedDependencies)).resolves.toBeUndefined();
	});
});
