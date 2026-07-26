import { describe, expect, it } from "vitest";
import {
	createToolExecutableResolver,
	type EnsureToolDependencies,
	ensureToolWithDependencies,
} from "../src/adapters/runtime-tools/executable-resolver.js";
import { createToolDownloadPlan } from "../src/utils/tools-manager.js";

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

describe("tool download plans", () => {
	it.each([
		["fd", "1.0.0", "darwin", "arm64", "fd-v1.0.0-aarch64-apple-darwin.tar.gz", "fd"],
		["fd", "1.0.0", "win32", "x64", "fd-v1.0.0-x86_64-pc-windows-msvc.zip", "fd.exe"],
		["rg", "14.1.0", "linux", "arm64", "ripgrep-14.1.0-aarch64-unknown-linux-gnu.tar.gz", "rg"],
		["rg", "14.1.0", "linux", "x64", "ripgrep-14.1.0-x86_64-unknown-linux-musl.tar.gz", "rg"],
	] as const)(
		"creates a stable %s %s %s/%s plan",
		(tool, version, platform, architecture, assetName, binaryFileName) => {
			const plan = createToolDownloadPlan({
				tool,
				version,
				platform,
				architecture,
				toolsDirectory: "C:/vetta/bin",
			});

			expect({
				...plan,
				archivePath: plan?.archivePath.replace(/\\/g, "/"),
				binaryPath: plan?.binaryPath.replace(/\\/g, "/"),
			}).toEqual({
				assetName,
				archivePath: `C:/vetta/bin/${assetName}`,
				binaryFileName,
				binaryPath: `C:/vetta/bin/${binaryFileName}`,
				downloadUrl: `https://github.com/${
					tool === "fd" ? "sharkdp/fd" : "BurntSushi/ripgrep"
				}/releases/download/${tool === "fd" ? "v" : ""}${version}/${assetName}`,
			});
		},
	);

	it("returns no plan for unsupported platforms", () => {
		expect(
			createToolDownloadPlan({
				tool: "rg",
				version: "14.1.0",
				platform: "freebsd",
				architecture: "x64",
				toolsDirectory: "C:/vetta/bin",
			}),
		).toBeUndefined();
	});
});
