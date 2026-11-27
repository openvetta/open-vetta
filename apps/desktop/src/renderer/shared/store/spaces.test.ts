// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readSpaces, spaceShowsSiblingProjects } from "./spaces";

const icon = { kind: "solar" as const, value: "code" as const };

describe("spaces store: sibling project switch", () => {
	it("is on unless explicitly turned off", () => {
		expect(spaceShowsSiblingProjects({})).toBe(true);
		expect(spaceShowsSiblingProjects({ siblingProjects: true })).toBe(true);
		expect(spaceShowsSiblingProjects({ siblingProjects: false })).toBe(false);
	});

	it("keeps an explicit off and drops anything else when reading stored spaces", () => {
		const state = readSpaces({
			spaces: [
				{ id: "a", name: "A", icon, siblingProjects: false },
				{ id: "b", name: "B", icon, siblingProjects: true },
				{ id: "c", name: "C", icon, siblingProjects: "no" },
				{ id: "d", name: "D", icon },
			],
		});
		expect(state.spaces).toEqual([
			{ id: "a", name: "A", icon, siblingProjects: false },
			{ id: "b", name: "B", icon },
			{ id: "c", name: "C", icon },
			{ id: "d", name: "D", icon },
		]);
	});
});
