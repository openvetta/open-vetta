import { app, Menu, nativeImage, Tray } from "electron";
import { getMainWindow, iconPath, showMainWindow } from "./window-manager.js";

const isWindows = process.platform === "win32";

let tray: Tray | null = null;
let hideToTrayOnClose = true;

export function getHideToTrayOnClose(): boolean {
	return hideToTrayOnClose;
}

export function setHideToTrayOnClose(value: boolean): void {
	hideToTrayOnClose = value;
	rebuildTrayContextMenu();
}

export function getTray(): Tray | null {
	return tray;
}

function buildTrayMenu(): Electron.Menu {
	const mainWindow = getMainWindow();
	const isVisible = mainWindow?.isVisible() ?? false;
	return Menu.buildFromTemplate([
		{
			label: isVisible ? "隐藏窗口" : "显示窗口",
			click: () => {
				const win = getMainWindow();
				if (!win) return;
				if (win.isVisible()) {
					win.hide();
				} else {
					showMainWindow();
				}
				rebuildTrayContextMenu();
			},
		},
		{
			label: hideToTrayOnClose ? "退出" : "隐藏到托盘",
			click: () => {
				(app as typeof app & { isQuitting?: boolean }).isQuitting = true;
				if (tray) {
					tray.destroy();
					tray = null;
				}
				app.quit();
			},
		},
	]);
}

export function createTray(): void {
	if (tray) return;

	const iconFilePath = iconPath[process.platform];
	console.log(`[tray] Loading icon from: ${iconFilePath}`);
	const icon = nativeImage.createFromPath(iconFilePath);
	console.log(`[tray] Icon loaded: isEmpty=${icon.isEmpty()}`);
	if (icon.isEmpty()) {
		console.warn("[tray] Icon not found, skipping tray creation");
		return;
	}

	const trayIcon = isWindows ? icon.resize({ width: 16, height: 16 }) : icon.resize({ width: 22, height: 22 });

	tray = new Tray(trayIcon);
	console.log("[tray] Created successfully");
	tray.setToolTip("Vetta");
	tray.setContextMenu(buildTrayMenu());

	tray.on("click", () => {
		const win = getMainWindow();
		if (!win) return;
		if (win.isVisible()) {
			win.hide();
		} else {
			showMainWindow();
		}
		rebuildTrayContextMenu();
	});
}

export function rebuildTrayContextMenu(): void {
	if (!tray) return;
	tray.setContextMenu(buildTrayMenu());
}
