import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, BrowserWindow: {}, dialog: {}, ipcMain: {} }));
vi.mock("../diagnostics-bundle.js", () => ({ buildDiagnosticsBundle: vi.fn(), diagnosticsBundleFileName: vi.fn() }));
vi.mock("../logger.js", () => ({ getAppLogBaseDir: vi.fn() }));

import { type DiagnosticsExportDeps, exportDiagnosticsWithSaveDialog } from "./diagnostics";

// 用一个假的文件系统记下发生了什么：打了几次包、哪些文件最后留在了哪里。
function createFakeDeps(chosenPath: string | null, options: { copyFails?: boolean } = {}) {
	const files = new Set<string>();
	let builds = 0;
	let offeredDefault: string | undefined;
	const deps: DiagnosticsExportDeps = {
		defaultPath: "/Users/me/Downloads/vetta-diagnostics.zip",
		chooseSavePath: async (defaultPath) => {
			offeredDefault = defaultPath;
			return chosenPath;
		},
		buildBundle: async () => {
			builds += 1;
			files.add("/tmp/bundle.zip");
			return "/tmp/bundle.zip";
		},
		copyFile: async (from, to) => {
			if (options.copyFails) throw new Error("disk full");
			if (!files.has(from)) throw new Error(`missing ${from}`);
			files.add(to);
		},
		removeFile: async (path) => {
			files.delete(path);
		},
	};
	return { deps, files, builds: () => builds, offeredDefault: () => offeredDefault };
}

describe("导出诊断包", () => {
	it("用户选好位置后，诊断包出现在那里，临时文件被清掉", async () => {
		const fake = createFakeDeps("/Users/me/Desktop/report.zip");
		const result = await exportDiagnosticsWithSaveDialog(fake.deps);

		expect(result).toEqual({ canceled: false, zipPath: "/Users/me/Desktop/report.zip" });
		expect([...fake.files]).toEqual(["/Users/me/Desktop/report.zip"]);
		expect(fake.offeredDefault()).toBe("/Users/me/Downloads/vetta-diagnostics.zip");
	});

	it("用户在保存对话框里取消时不打包、不写任何文件", async () => {
		const fake = createFakeDeps(null);
		const result = await exportDiagnosticsWithSaveDialog(fake.deps);

		expect(result).toEqual({ canceled: true });
		expect(fake.builds()).toBe(0);
		expect(fake.files.size).toBe(0);
	});

	it("用户删掉了扩展名时补上 .zip", async () => {
		const fake = createFakeDeps("/Users/me/Desktop/report");
		const result = await exportDiagnosticsWithSaveDialog(fake.deps);

		expect(result).toEqual({ canceled: false, zipPath: "/Users/me/Desktop/report.zip" });
	});

	it("写到目标位置失败时报错，也不留下临时文件", async () => {
		const fake = createFakeDeps("/Users/me/Desktop/report.zip", { copyFails: true });

		await expect(exportDiagnosticsWithSaveDialog(fake.deps)).rejects.toThrow("disk full");
		expect(fake.files.size).toBe(0);
	});
});
