import { describe, expect, it } from "vitest";
import {
	initialPetVideoScreen,
	normalizePetContentSize,
	petWindowBoundsForAnchor,
	petWindowBoundsForScreen,
	squarePetContent,
	videoScreenRectFromWindow,
} from "./pet-widget-bounds.js";

const workArea = { x: 0, y: 25, width: 1440, height: 875 };

describe("normalizePetContentSize", () => {
	it("treats a bare number as a square edge", () => {
		expect(normalizePetContentSize(180)).toEqual({ width: 180, height: 180 });
		expect(squarePetContent(180.4)).toEqual({ width: 180, height: 180 });
	});

	it("rounds fractional report sizes up and never collapses to zero", () => {
		expect(normalizePetContentSize({ width: 219.2, height: 0 })).toEqual({ width: 220, height: 1 });
	});
});

describe("petWindowBoundsForScreen", () => {
	it("sizes the window to the reported content and keeps the requested top-left", () => {
		expect(
			petWindowBoundsForScreen({
				workArea,
				screen: { x: 400, y: 300 },
				content: { width: 220, height: 260 },
			}),
		).toEqual({ x: 400, y: 300, width: 220, height: 260 });
	});

	it("clamps the window inside the work area instead of letting the sprite leave the screen", () => {
		expect(
			petWindowBoundsForScreen({
				workArea,
				screen: { x: 1400, y: 1000 },
				content: { width: 220, height: 220 },
			}),
		).toEqual({ x: 1220, y: 680, width: 220, height: 220 });
		expect(
			petWindowBoundsForScreen({
				workArea,
				screen: { x: -50, y: -50 },
				content: { width: 220, height: 220 },
			}),
		).toEqual({ x: 0, y: 25, width: 220, height: 220 });
	});

	it("keeps the sprite's top-left when the reported content grows", () => {
		const small = petWindowBoundsForScreen({ workArea, screen: { x: 400, y: 300 }, content: squarePetContent(180) });
		const large = petWindowBoundsForScreen({
			workArea,
			screen: { x: small.x, y: small.y },
			content: squarePetContent(240),
		});

		expect(large).toEqual({ x: 400, y: 300, width: 240, height: 240 });
	});
});

describe("petWindowBoundsForAnchor", () => {
	it("centers the window on the drag anchor", () => {
		expect(
			petWindowBoundsForAnchor({ workArea, anchor: { x: 700, y: 500 }, content: squarePetContent(220) }),
		).toEqual({ x: 590, y: 390, width: 220, height: 220 });
	});

	it("clamps a drag past the screen edge without moving the anchor off-screen", () => {
		expect(
			petWindowBoundsForAnchor({ workArea, anchor: { x: 1430, y: 890 }, content: squarePetContent(220) }),
		).toEqual({ x: 1220, y: 680, width: 220, height: 220 });
	});
});

describe("initialPetVideoScreen", () => {
	it("docks the pet in the bottom-right corner of the work area", () => {
		expect(initialPetVideoScreen(workArea, 220, 24)).toEqual({
			x: 1440 - 220 - 24,
			y: 900 - 220 - 24,
			width: 220,
			height: 220,
		});
	});
});

describe("videoScreenRectFromWindow", () => {
	it("offsets the hitbox by the window position", () => {
		expect(
			videoScreenRectFromWindow(
				{ x: 100, y: 200, width: 240, height: 240 },
				{ x: 10, y: 20, width: 220, height: 220 },
			),
		).toEqual({ x: 110, y: 220, width: 220, height: 220 });
	});

	it("falls back to the window rect when the hitbox is not measured yet", () => {
		expect(videoScreenRectFromWindow({ x: 100, y: 200, width: 240, height: 240 }, undefined)).toEqual({
			x: 100,
			y: 200,
			width: 240,
			height: 240,
		});
	});
});
