import { type IpcMainEvent, ipcMain } from "electron";
import {
	APP_LIFECYCLE_RENDERER_BOOT_PAINTED_CHANNEL,
	APP_LIFECYCLE_WHEN_READY_CHANNEL,
} from "../shared/app-lifecycle-ipc.js";

const DEFAULT_BOOT_PAINT_TIMEOUT_MS = 10_000;

export type RendererBootPaintResult = "painted" | "timeout";

export interface AppLifecycleController {
	waitForRendererBootPaint(timeoutMs?: number): Promise<RendererBootPaintResult>;
	markReady(): void;
}

export function registerAppLifecycleIpc(): AppLifecycleController {
	let isReady = false;
	let isRendererBootPainted = false;
	let resolveReady: (() => void) | undefined;
	let resolveRendererBootPainted: (() => void) | undefined;

	const readyPromise = new Promise<void>((resolve) => {
		resolveReady = resolve;
	});
	const rendererBootPaintedPromise = new Promise<void>((resolve) => {
		resolveRendererBootPainted = resolve;
	});

	const handleRendererBootPainted = (_event: IpcMainEvent): void => {
		if (isRendererBootPainted) return;
		isRendererBootPainted = true;
		resolveRendererBootPainted?.();
	};

	ipcMain.on(APP_LIFECYCLE_RENDERER_BOOT_PAINTED_CHANNEL, handleRendererBootPainted);
	ipcMain.handle(APP_LIFECYCLE_WHEN_READY_CHANNEL, async () => {
		await readyPromise;
	});

	return {
		waitForRendererBootPaint(timeoutMs = DEFAULT_BOOT_PAINT_TIMEOUT_MS) {
			if (isRendererBootPainted) return Promise.resolve("painted");
			return new Promise<RendererBootPaintResult>((resolve) => {
				const timeout = setTimeout(() => resolve("timeout"), timeoutMs);
				void rendererBootPaintedPromise.then(() => {
					clearTimeout(timeout);
					resolve("painted");
				});
			});
		},
		markReady() {
			if (isReady) return;
			isReady = true;
			resolveReady?.();
		},
	};
}
