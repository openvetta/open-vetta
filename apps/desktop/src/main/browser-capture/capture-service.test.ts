import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ webContents: { fromId: () => undefined } }));

import { BrowserCaptureService } from "./capture-service";

describe("browser capture ownership", () => {
	it("captures only an owned guest and rejects navigation races", async () => {
		const owner = {} as WebContents;
		let url = "https://example.test/";
		const guest = {
			hostWebContents: owner,
			isDestroyed: () => false,
			getType: () => "webview",
			getURL: () => url,
			capturePage: async () => ({
				isEmpty: () => false,
				getSize: () => ({ width: 800, height: 600 }),
				toPNG: () => Buffer.from("png"),
			}),
		} as unknown as WebContents;
		const service = new BrowserCaptureService(owner, () => guest);
		expect(await service.capture(1, url)).toEqual({ data: "cG5n", width: 800, height: 600 });
		url = "https://other.test/";
		await expect(service.capture(1, "https://example.test/")).rejects.toThrow("page changed");
		await expect(new BrowserCaptureService({} as WebContents, () => guest).capture(1, url)).rejects.toThrow(
			"Untrusted",
		);
	});
});
