// @vitest-environment jsdom
import { createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncSpaceSiblingMirror, toSpaceSiblingMirror } from "./space-sibling-mirror";
import { INITIAL_SPACES, readSpaces, type SpaceState, spaceShowsSiblingProjects, spacesAtom } from "./spaces";

const icon = { kind: "solar" as const, value: "code" as const };

const STATE: SpaceState = {
	...INITIAL_SPACES,
	spaces: [
		{ id: "product", name: "Product", icon },
		{ id: "client", name: "Client", icon, siblingProjects: false },
	],
	projects: { "/work/openvetta": "product", "/work/client": "client" },
	conversations: { "/c/s1.jsonl": "product", "team-1": "product" },
};

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

describe("toSpaceSiblingMirror", () => {
	it("carries only the switch and memberships", () => {
		expect(
			toSpaceSiblingMirror({ ...STATE, selected: "client", locations: { product: { kind: "project", cwd: "/x" } } }),
		).toEqual({
			spaces: [
				{ id: "product", siblingProjects: true },
				{ id: "client", siblingProjects: false },
			],
			projects: STATE.projects,
			conversations: STATE.conversations,
		});
	});
});

describe("syncSpaceSiblingMirror", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
		localStorage.clear();
	});

	function setup(push: (mirror: unknown) => Promise<void> = async () => {}) {
		const store = createStore();
		store.set(spacesAtom, STATE);
		const calls: unknown[] = [];
		const onError = vi.fn();
		const stop = syncSpaceSiblingMirror(
			store,
			async (mirror) => {
				calls.push(mirror);
				await push(mirror);
			},
			{ retryDelayMs: 1_000, onError },
		);
		return { store, calls, onError, stop };
	}

	it("pushes once at start and again only when memberships or switches change", async () => {
		const { store, calls, stop } = setup();
		await vi.runAllTimersAsync();
		expect(calls).toHaveLength(1);

		store.set(spacesAtom, { ...STATE, selected: "client" });
		await vi.runAllTimersAsync();
		expect(calls).toHaveLength(1);

		store.set(spacesAtom, { ...STATE, projects: { ...STATE.projects, "/work/docs": "product" } });
		await vi.runAllTimersAsync();
		expect(calls).toHaveLength(2);
		expect(calls[1]).toMatchObject({ projects: { "/work/docs": "product" } });
		stop();
	});

	it("sends a change immediately even while an earlier push is still pending", async () => {
		const pending: Array<() => void> = [];
		const { store, calls, stop } = setup(
			() =>
				new Promise<void>((resolve) => {
					pending.push(resolve);
				}),
		);
		store.set(spacesAtom, { ...STATE, conversations: { ...STATE.conversations, "/c/new.jsonl": "product" } });
		expect(calls).toHaveLength(2);
		expect(calls[1]).toMatchObject({ conversations: { "/c/new.jsonl": "product" } });
		for (const resolve of pending) resolve();
		await vi.runAllTimersAsync();
		expect(calls).toHaveLength(2);
		stop();
	});

	it("does not let an older failed push re-send over a newer delivered one", async () => {
		let failFirst = true;
		const { store, calls, onError, stop } = setup(async () => {
			if (failFirst) {
				failFirst = false;
				throw new Error("main not ready");
			}
		});
		store.set(spacesAtom, { ...STATE, projects: { "/b": "product" } });
		await vi.advanceTimersByTimeAsync(5_000);
		expect(onError).toHaveBeenCalledOnce();
		expect(calls).toHaveLength(2);
		expect(calls[1]).toMatchObject({ projects: { "/b": "product" } });
		stop();
	});

	it("retries a failed push until it is delivered", async () => {
		let failures = 2;
		const { calls, onError, stop } = setup(async () => {
			if (failures > 0) {
				failures -= 1;
				throw new Error("main not ready");
			}
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(calls).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(calls).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(calls).toHaveLength(3);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(calls).toHaveLength(3);
		expect(onError).toHaveBeenCalledTimes(2);
		stop();
	});

	it("stops pushing and retrying once disposed", async () => {
		const { store, calls, stop } = setup(async () => {
			throw new Error("down");
		});
		await vi.advanceTimersByTimeAsync(0);
		stop();
		store.set(spacesAtom, { ...STATE, projects: {} });
		await vi.advanceTimersByTimeAsync(10_000);
		expect(calls).toHaveLength(1);
	});
});
