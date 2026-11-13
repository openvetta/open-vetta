// 不引 electron：只测路径解析。
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ nativeImage: { createFromPath: vi.fn() } }));

import { resolveAppBundlePath } from "./app-icon";

const dirs = ["/Applications", "/System/Applications"];

describe("resolveAppBundlePath", () => {
	it("finds the bundle in the first directory that has it", () => {
		const exists = (path: string) => path === "/System/Applications/Terminal.app";
		expect(resolveAppBundlePath("Terminal", exists, dirs)).toBe("/System/Applications/Terminal.app");
	});

	it("returns null when the app is not installed", () => {
		expect(resolveAppBundlePath("Zed", () => false, dirs)).toBeNull();
	});

	it("rejects names that could escape the application folders", () => {
		const exists = () => true;
		for (const name of ["../etc/passwd", "a/b", ".hidden", "", "x".repeat(65), "Zed\n"]) {
			expect(resolveAppBundlePath(name, exists, dirs)).toBeNull();
		}
	});

	it("accepts normal names with spaces and punctuation", () => {
		const exists = () => true;
		expect(resolveAppBundlePath("Visual Studio Code", exists, dirs)).toBe("/Applications/Visual Studio Code.app");
	});
});
