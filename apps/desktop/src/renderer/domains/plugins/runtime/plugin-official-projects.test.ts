// @vitest-environment jsdom

import { INITIAL_SPACES, spaceOf, spacesAtom } from "@shared/store/spaces";
import { getDefaultStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfficialProjectsApi } from "./plugin-official-projects";

const DESIGN_SPACE = {
	...INITIAL_SPACES,
	spaces: [{ id: "design", name: "设计", icon: { kind: "solar" as const, value: "palette" as const } }],
	selected: "design",
};

afterEach(() => {
	getDefaultStore().set(spacesAtom, INITIAL_SPACES);
	Reflect.deleteProperty(globalThis, "window");
});

function installProjects(projects: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }) {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { vetta: { plugins: { internalCapabilities: { projects, sessions: {} } } } },
	});
	return createOfficialProjectsApi(vi.fn(), "capability-session");
}

describe("createOfficialProjectsApi", () => {
	it("把设计侧栏新建的项目记入当前工作空间，并且不切走当前空间", async () => {
		const store = getDefaultStore();
		store.set(spacesAtom, DESIGN_SPACE);
		const api = installProjects({
			list: vi.fn().mockResolvedValue({ workspacePath: "/w", projects: [], archivedProjects: [] }),
			create: vi.fn().mockResolvedValue({ path: "/w/My-Design", name: "My-Design" }),
		});

		await expect(api.create("My Design")).resolves.toEqual({ path: "/w/My-Design", name: "My-Design" });

		const state = store.get(spacesAtom);
		expect(spaceOf(state, { kind: "project", key: "/w/My-Design" })).toBe("design");
		expect(state.selected).toBe("design");
	});

	it("当前就在主工作区时，新建项目仍归主工作区", async () => {
		const store = getDefaultStore();
		store.set(spacesAtom, INITIAL_SPACES);
		const api = installProjects({
			list: vi.fn().mockResolvedValue({ workspacePath: "/w", projects: [], archivedProjects: [] }),
			create: vi.fn().mockResolvedValue({ path: "/w/Home-Design", name: "Home-Design" }),
		});

		await api.create("Home Design");

		expect(spaceOf(store.get(spacesAtom), { kind: "project", key: "/w/Home-Design" })).toBe("main");
	});

	it("已经登记过的项目再次创建时，不把它从原工作空间搬走", async () => {
		const store = getDefaultStore();
		store.set(spacesAtom, {
			...DESIGN_SPACE,
			projects: { "/w/Existing": "studio" },
			spaces: [...DESIGN_SPACE.spaces, { id: "studio", name: "Studio", icon: { kind: "solar", value: "pen" } }],
		});
		const api = installProjects({
			list: vi.fn().mockResolvedValue({
				workspacePath: "/w",
				projects: [{ path: "/w/Existing", name: "Existing" }],
				archivedProjects: [],
			}),
			create: vi.fn().mockResolvedValue({ path: "/w/Existing", name: "Existing" }),
		});

		await api.create("Existing");

		const state = store.get(spacesAtom);
		expect(spaceOf(state, { kind: "project", key: "/w/Existing" })).toBe("studio");
		expect(state.selected).toBe("design");
	});
});
