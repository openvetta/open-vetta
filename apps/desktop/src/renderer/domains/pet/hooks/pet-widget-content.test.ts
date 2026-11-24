import { describe, expect, it } from "vitest";
import { clientRectToHitbox, measurePetContentSize, samePetContentSize } from "./pet-widget-content";

describe("measurePetContentSize", () => {
	it("sizes the widget window to the rendered pet content", () => {
		expect(measurePetContentSize({ width: 360, height: 300 })).toEqual({ width: 360, height: 300 });
	});

	it("rounds fractional layout sizes up and never reports an empty window", () => {
		expect(measurePetContentSize({ width: 219.2, height: 0 })).toEqual({ width: 220, height: 1 });
	});
});

describe("samePetContentSize", () => {
	it("only treats identical content sizes as unchanged", () => {
		const base = measurePetContentSize({ width: 220, height: 220 });
		expect(samePetContentSize(base, { width: 220, height: 220 })).toBe(true);
		expect(samePetContentSize(base, { width: 220, height: 240 })).toBe(false);
		expect(samePetContentSize(undefined, base)).toBe(false);
	});
});

describe("clientRectToHitbox", () => {
	it("clips the sprite to the current window viewport", () => {
		expect(clientRectToHitbox({ left: -10, top: 8, right: 230, bottom: 228 }, { width: 220, height: 300 })).toEqual({
			x: 0,
			y: 8,
			width: 220,
			height: 220,
		});
	});
});
