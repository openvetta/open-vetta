// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { frameBrowserScreenshot } from "./capture-image";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.documentElement.style.removeProperty("--primary");
	document.documentElement.style.removeProperty("--color-browser-selection");
});

it.each([1, 2])("exports the vivid capture marker at 3 CSS pixels with image scale %s", async (scale) => {
	document.documentElement.style.setProperty("--primary", "#cccccc");
	document.documentElement.style.setProperty("--color-browser-selection", "#008cff");
	vi.stubGlobal(
		"Image",
		class {
			naturalWidth = 600 * scale;
			naturalHeight = 400 * scale;
			src = "";
			decode = async () => undefined;
		},
	);
	const strokes: { color: string; width: number; rect: number[] }[] = [];
	const context = {
		strokeStyle: "",
		lineWidth: 1,
		drawImage: () => undefined,
		strokeRect(...rect: number[]) {
			strokes.push({ color: this.strokeStyle, width: this.lineWidth, rect });
		},
	};
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
	vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,cG5n");
	const result = await frameBrowserScreenshot(
		"cG5n",
		{ x: 10, y: 20, width: 100, height: 40 },
		{ width: 600, height: 400 },
	);
	expect(result).toEqual({ data: "cG5n", width: 600 * scale, height: 400 * scale });
	expect(strokes).toEqual([
		{
			color: "#008cff",
			width: 3 * scale,
			rect: [11.5 * scale, 21.5 * scale, 97 * scale, 37 * scale],
		},
	]);
});
