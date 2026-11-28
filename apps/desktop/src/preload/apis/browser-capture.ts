import type { IpcRenderer } from "electron";
import type { BrowserCaptureApi } from "../../shared/browser-capture.js";

export function createBrowserCaptureApi(ipc: IpcRenderer): { browserCapture: BrowserCaptureApi } {
	return {
		browserCapture: {
			inspect: (id, point) => ipc.invoke("vetta:browser-capture:inspect", id, point),
			capture: (id, url) => ipc.invoke("vetta:browser-capture:capture", id, url),
			scroll: (id, delta) => ipc.invoke("vetta:browser-capture:scroll", id, delta),
		},
	};
}
