import { ipcMain } from "electron";
import { listThemes } from "../themes/theme-store.js";

export function registerThemesIpc(): () => void {
	ipcMain.handle("vetta:themes:list", () => listThemes());
	return () => ipcMain.removeHandler("vetta:themes:list");
}
