import { copyFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, type SaveDialogOptions } from "electron";
import { buildDiagnosticsBundle, diagnosticsBundleFileName } from "../diagnostics-bundle.js";
import { getAppLogBaseDir } from "../logger.js";

const DIAGNOSTICS_CHANNELS = {
	EXPORT: "vetta:diagnostics:export",
	GET_LOG_DIR: "vetta:diagnostics:get-log-dir",
} as const;

export { DIAGNOSTICS_CHANNELS };

export interface DiagnosticsExportOptions {
	/** 系统保存对话框的标题，由界面按当前语言传入。 */
	readonly dialogTitle?: string;
}

export type DiagnosticsExportResult =
	| { readonly canceled: true }
	| { readonly canceled: false; readonly zipPath: string };

export interface DiagnosticsExportDeps {
	/** 让用户选保存位置；取消时返回 null。 */
	readonly chooseSavePath: (defaultPath: string) => Promise<string | null>;
	/** 打包到临时位置，返回临时 zip 路径。 */
	readonly buildBundle: () => Promise<string>;
	readonly copyFile: (from: string, to: string) => Promise<void>;
	readonly removeFile: (path: string) => Promise<void>;
	readonly defaultPath: string;
}

/**
 * 先问保存位置再打包：用户取消就什么都不做。
 * 打包落在临时目录，写完整后才拷到用户选的位置，失败时不会在那里留下半截文件。
 */
export async function exportDiagnosticsWithSaveDialog(deps: DiagnosticsExportDeps): Promise<DiagnosticsExportResult> {
	const chosen = await deps.chooseSavePath(deps.defaultPath);
	if (!chosen) return { canceled: true };
	const zipPath = extname(chosen).toLowerCase() === ".zip" ? chosen : `${chosen}.zip`;
	const tempPath = await deps.buildBundle();
	try {
		await deps.copyFile(tempPath, zipPath);
	} finally {
		await deps.removeFile(tempPath).catch(() => {});
	}
	return { canceled: false, zipPath };
}

function parseExportOptions(value: unknown): DiagnosticsExportOptions {
	if (typeof value !== "object" || value === null) return {};
	const title = (value as { dialogTitle?: unknown }).dialogTitle;
	return typeof title === "string" && title.trim() ? { dialogTitle: title.trim().slice(0, 200) } : {};
}

export function registerDiagnosticsIpc(): () => void {
	ipcMain.handle(DIAGNOSTICS_CHANNELS.EXPORT, async (event, rawOptions: unknown): Promise<DiagnosticsExportResult> => {
		const options = parseExportOptions(rawOptions);
		const owner = BrowserWindow.fromWebContents(event.sender);
		return exportDiagnosticsWithSaveDialog({
			defaultPath: join(app.getPath("downloads"), diagnosticsBundleFileName()),
			chooseSavePath: async (defaultPath) => {
				const dialogOptions: SaveDialogOptions = {
					...(options.dialogTitle ? { title: options.dialogTitle } : {}),
					defaultPath,
					filters: [{ name: "Zip", extensions: ["zip"] }],
					properties: ["createDirectory", "showOverwriteConfirmation"],
				};
				const result = owner
					? await dialog.showSaveDialog(owner, dialogOptions)
					: await dialog.showSaveDialog(dialogOptions);
				return result.canceled || !result.filePath ? null : result.filePath;
			},
			buildBundle: async () => (await buildDiagnosticsBundle()).zipPath,
			copyFile: (from, to) => copyFile(from, to),
			removeFile: (path) => rm(path, { force: true }),
		});
	});

	ipcMain.handle(DIAGNOSTICS_CHANNELS.GET_LOG_DIR, (): string => getAppLogBaseDir());

	return () => {
		ipcMain.removeHandler(DIAGNOSTICS_CHANNELS.EXPORT);
		ipcMain.removeHandler(DIAGNOSTICS_CHANNELS.GET_LOG_DIR);
	};
}
