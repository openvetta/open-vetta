import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfficialDialogApi } from "./plugin-official-dialog.js";

afterEach(() => {
	Reflect.deleteProperty(globalThis, "window");
});

describe("createOfficialDialogApi", () => {
	it("opens a directory through the host folder picker after the official gate", async () => {
		const selectFolder = vi.fn().mockResolvedValue("/picked");
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { vetta: { dialog: { selectFolder } } },
		});
		const assertOfficial = vi.fn();
		const api = createOfficialDialogApi(assertOfficial);

		await expect(api.openDirectory()).resolves.toBe("/picked");
		expect(assertOfficial).toHaveBeenCalledTimes(1);
		expect(selectFolder).toHaveBeenCalledTimes(1);
	});

	it("does not open the folder picker when the official gate rejects", async () => {
		const selectFolder = vi.fn();
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { vetta: { dialog: { selectFolder } } },
		});
		const api = createOfficialDialogApi(() => {
			throw new Error("not official");
		});

		await expect(api.openDirectory()).rejects.toThrow("not official");
		expect(selectFolder).not.toHaveBeenCalled();
	});
});
