import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { dialog, ipcMain } from "electron";
import { allowProjectRoot } from "./fs.js";

const IMAGE_MIME: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".bmp": "image/bmp",
};

export function registerDialogIpc(): () => void {
	ipcMain.handle("vetta:dialog:select-images", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile", "multiSelections"],
			title: "Select Images",
			filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] }],
		});
		if (result.canceled || result.filePaths.length === 0) return [];
		const images = await Promise.all(
			result.filePaths.map(async (filePath) => {
				const buffer = await readFile(filePath);
				const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
				return {
					data: buffer.toString("base64"),
					mimeType: IMAGE_MIME[ext] || "image/png",
					name: basename(filePath),
				};
			}),
		);
		return images;
	});

	ipcMain.handle("vetta:dialog:select-folder", async () => {
		const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "Select Project Folder" });
		if (result.canceled || result.filePaths.length === 0) return null;
		const selectedPath = result.filePaths[0];
		allowProjectRoot(selectedPath);
		return selectedPath;
	});

	ipcMain.handle("vetta:dialog:select-folders", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory", "multiSelections"],
			title: "Select Folders",
		});
		if (result.canceled || result.filePaths.length === 0) return [];
		for (const p of result.filePaths) {
			allowProjectRoot(p);
		}
		return result.filePaths;
	});

	return () => {
		ipcMain.removeHandler("vetta:dialog:select-images");
		ipcMain.removeHandler("vetta:dialog:select-folder");
		ipcMain.removeHandler("vetta:dialog:select-folders");
	};
}
