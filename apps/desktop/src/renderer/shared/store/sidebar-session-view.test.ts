// @vitest-environment jsdom
import { createStore } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { parseSidebarSessionView, sidebarSessionViewAtom } from "./project-atoms";

const STORAGE_KEY = "vetta-sidebar-session-view";

afterEach(() => localStorage.removeItem(STORAGE_KEY));

describe("sidebar session view preference", () => {
	it("defaults to project grouping sorted by latest reply", () => {
		expect(createStore().get(sidebarSessionViewAtom)).toEqual({ grouping: "project", sort: "updated" });
	});

	it("updates one field at a time and persists the whole view", () => {
		const store = createStore();
		store.set(sidebarSessionViewAtom, { grouping: "flat" });
		store.set(sidebarSessionViewAtom, { sort: "created" });

		expect(store.get(sidebarSessionViewAtom)).toEqual({ grouping: "flat", sort: "created" });
		expect(parseSidebarSessionView(JSON.parse(localStorage.getItem(STORAGE_KEY) as string))).toEqual({
			grouping: "flat",
			sort: "created",
		});
	});

	it("falls back field by field for unusable stored values", () => {
		expect(parseSidebarSessionView(null)).toEqual({ grouping: "project", sort: "updated" });
		expect(parseSidebarSessionView({ schemaVersion: 99, grouping: "flat", sort: "created" })).toEqual({
			grouping: "project",
			sort: "updated",
		});
		expect(parseSidebarSessionView({ schemaVersion: 1, grouping: "flat", sort: "nope" })).toEqual({
			grouping: "flat",
			sort: "updated",
		});
	});
});
