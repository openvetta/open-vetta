import { ipcMain, type WebContents } from "electron";
import { BrowserCaptureService } from "../browser-capture/capture-service.js";

export function registerBrowserCaptureIpc(owner: WebContents): () => void {
	const service = new BrowserCaptureService(owner);
	const channels = ["inspect", "capture", "scroll"] as const;
	for (const action of channels) {
		ipcMain.handle(`vetta:browser-capture:${action}`, (event, id, input) => {
			if (event.sender !== owner || event.senderFrame !== owner.mainFrame)
				throw new Error("Untrusted browser capture caller");
			return service[action](id, input);
		});
	}
	return () => {
		for (const action of channels) ipcMain.removeHandler(`vetta:browser-capture:${action}`);
	};
}
