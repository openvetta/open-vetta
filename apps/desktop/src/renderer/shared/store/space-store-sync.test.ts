// @vitest-environment jsdom

import { createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedSpaceData, SpaceStoreSnapshot, SpaceSyncRequest } from "@/shared/spaces-ipc";
import { applySharedSpaceData, type SpaceStorePort, sharedSpacePart, startSpaceStoreSync } from "./space-store-sync";
import { INITIAL_SPACES, type SpaceState, spacesAtom } from "./spaces";

const icon = { kind: "solar" as const, value: "code" as const };

const LOCAL: SpaceState = {
	...INITIAL_SPACES,
	spaces: [{ id: "product", name: "Product", icon }],
	selected: "product",
	projects: { "/work/openvetta": "product" },
	conversations: {},
	locations: { product: { kind: "project", cwd: "/work/openvetta" } },
};

const CLIENT: SharedSpaceData = {
	spaces: [
		{ id: "product", name: "Product", icon },
		{ id: "client", name: "Client", icon, siblingProjects: false },
	],
	projects: { "/work/openvetta": "product", "/work/client": "client" },
	conversations: {},
};

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function memoryStorage(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
	};
}

function setup(options: { local?: SpaceState; storage?: ReturnType<typeof memoryStorage>; manual?: boolean } = {}) {
	const store = createStore();
	store.set(spacesAtom, options.local ?? LOCAL);
	const storage = options.storage ?? memoryStorage();
	const syncCalls: Array<{ request: SpaceSyncRequest; reply: Deferred<SpaceStoreSnapshot> }> = [];
	const saveCalls: Array<{ data: SharedSpaceData; reply: Deferred<SpaceStoreSnapshot> }> = [];
	let changed: ((snapshot: SpaceStoreSnapshot) => void) | undefined;
	const port: SpaceStorePort = {
		sync: (request) => {
			const reply = deferred<SpaceStoreSnapshot>();
			syncCalls.push({ request, reply });
			return reply.promise;
		},
		save: (data) => {
			const reply = deferred<SpaceStoreSnapshot>();
			saveCalls.push({ data, reply });
			return reply.promise;
		},
		onChanged: (handler) => {
			changed = handler;
			return () => {
				changed = undefined;
			};
		},
	};
	const onError = vi.fn();
	const stop = startSpaceStoreSync(store, port, {
		storage,
		retryDelayMs: 1_000,
		createId: () => "source-1",
		onError,
	});
	return {
		store,
		storage,
		syncCalls,
		saveCalls,
		onError,
		stop,
		emit: (snapshot: SpaceStoreSnapshot) => changed?.(snapshot),
		hasListener: () => changed !== undefined,
	};
}

async function flush(): Promise<void> {
	await vi.advanceTimersByTimeAsync(0);
}

/** 完成一次握手：主进程原样收下本地数据。 */
async function completeHandshake(ctx: ReturnType<typeof setup>, data?: SharedSpaceData) {
	const call = ctx.syncCalls.at(-1);
	call?.reply.resolve({ revision: 1, data: data ?? call.request.local });
	await flush();
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	localStorage.clear();
});

describe("startup handshake (seamless upgrade)", () => {
	it("hands the local spaces to main as-is on first run and keeps the UI unchanged", async () => {
		const ctx = setup();
		expect(ctx.syncCalls).toHaveLength(1);
		expect(ctx.syncCalls[0]?.request).toEqual({
			sourceId: "source-1",
			local: sharedSpacePart(LOCAL),
			localDirty: false,
		});
		// 握手完成前界面就是本地缓存，不会先空后跳。
		expect(ctx.store.get(spacesAtom)).toEqual(LOCAL);

		await completeHandshake(ctx);
		expect(ctx.store.get(spacesAtom)).toEqual(LOCAL);
		expect(ctx.saveCalls).toEqual([]);
		expect(ctx.storage.values.get("vetta.desktop-spaces.source-id")).toBe("source-1");
		expect(ctx.storage.values.get("vetta.desktop-spaces.synced.v1")).toBeTruthy();
		ctx.stop();
	});

	it("reuses the persisted source id", () => {
		const ctx = setup({ storage: memoryStorage({ "vetta.desktop-spaces.source-id": "existing" }) });
		expect(ctx.syncCalls[0]?.request.sourceId).toBe("existing");
		ctx.stop();
	});

	it("adopts merged data from main while keeping this app's selection and locations", async () => {
		const ctx = setup();
		await completeHandshake(ctx, CLIENT);
		const state = ctx.store.get(spacesAtom);
		expect(sharedSpacePart(state)).toEqual(CLIENT);
		expect(state.selected).toBe("product");
		expect(state.locations).toEqual(LOCAL.locations);
		expect(ctx.saveCalls).toEqual([]);
		ctx.stop();
	});

	it("falls back to the main space when main no longer has the selected one", async () => {
		const ctx = setup();
		await completeHandshake(ctx, { spaces: [], projects: {}, conversations: {} });
		expect(ctx.store.get(spacesAtom).selected).toBe("main");
		ctx.stop();
	});

	it("reports clean local data on the next start", async () => {
		const first = setup();
		await completeHandshake(first);
		first.stop();
		const second = setup({ storage: first.storage });
		expect(second.syncCalls[0]?.request.localDirty).toBe(false);
		second.stop();
	});

	it("reports local data changed outside sync (e.g. by an older version after a downgrade)", async () => {
		const first = setup();
		await completeHandshake(first);
		first.stop();
		const edited: SpaceState = { ...LOCAL, projects: { ...LOCAL.projects, "/work/docs": "product" } };
		const second = setup({ local: edited, storage: first.storage });
		expect(second.syncCalls[0]?.request).toMatchObject({ localDirty: true, local: sharedSpacePart(edited) });
		second.stop();
	});

	it("does not count a selection change as a local edit", async () => {
		const first = setup();
		await completeHandshake(first);
		first.stop();
		const second = setup({ local: { ...LOCAL, selected: "main", locations: {} }, storage: first.storage });
		expect(second.syncCalls[0]?.request.localDirty).toBe(false);
		second.stop();
	});

	it("keeps and submits edits made while the handshake was in flight", async () => {
		const ctx = setup();
		const edited: SpaceState = { ...LOCAL, projects: { ...LOCAL.projects, "/work/docs": "product" } };
		ctx.store.set(spacesAtom, edited);
		expect(ctx.saveCalls).toEqual([]);
		await completeHandshake(ctx, sharedSpacePart(LOCAL));
		expect(ctx.store.get(spacesAtom)).toEqual(edited);
		expect(ctx.saveCalls.map((call) => call.data)).toEqual([sharedSpacePart(edited)]);
		ctx.stop();
	});

	it("retries a failed handshake and stays usable meanwhile", async () => {
		const ctx = setup();
		ctx.syncCalls[0]?.reply.reject(new Error("main not ready"));
		await flush();
		expect(ctx.onError).toHaveBeenCalledOnce();
		ctx.store.set(spacesAtom, { ...LOCAL, projects: {} });
		expect(ctx.saveCalls).toEqual([]);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(ctx.syncCalls).toHaveLength(2);
		expect(ctx.syncCalls[1]?.request.local.projects).toEqual({});
		ctx.stop();
	});

	it("stays on the local cache when the shared file is from a newer version", async () => {
		const ctx = setup();
		ctx.syncCalls[0]?.reply.resolve({ revision: 0, data: sharedSpacePart(LOCAL), readOnly: true });
		await flush();
		ctx.store.set(spacesAtom, { ...LOCAL, projects: {} });
		ctx.emit({ revision: 9, data: CLIENT });
		await flush();
		expect(ctx.saveCalls).toEqual([]);
		expect(ctx.store.get(spacesAtom).projects).toEqual({});
		ctx.stop();
	});

	it("survives storage that throws", async () => {
		const throwing = {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {
				throw new Error("quota");
			},
		};
		const store = createStore();
		store.set(spacesAtom, LOCAL);
		const sync = vi.fn(async (request: SpaceSyncRequest) => ({ revision: 1, data: request.local }));
		const stop = startSpaceStoreSync(
			store,
			{ sync, save: vi.fn(), onChanged: () => () => {} },
			{ storage: throwing, createId: () => "id" },
		);
		await flush();
		expect(sync).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "id", localDirty: false }));
		stop();
	});
});

describe("live sync", () => {
	async function live() {
		const ctx = setup();
		await completeHandshake(ctx);
		return ctx;
	}

	it("saves membership and switch changes immediately, but not selection changes", async () => {
		const ctx = await live();
		ctx.store.set(spacesAtom, { ...ctx.store.get(spacesAtom), selected: "main" });
		expect(ctx.saveCalls).toEqual([]);

		const next = { ...ctx.store.get(spacesAtom), spaces: [{ ...LOCAL.spaces[0]!, siblingProjects: false }] };
		ctx.store.set(spacesAtom, next);
		expect(ctx.saveCalls.map((call) => call.data.spaces[0])).toEqual([
			{ id: "product", name: "Product", icon, siblingProjects: false },
		]);
		ctx.stop();
	});

	it("does not echo data it just adopted back to main", async () => {
		const ctx = await live();
		ctx.emit({ revision: 2, data: CLIENT });
		await flush();
		expect(sharedSpacePart(ctx.store.get(spacesAtom))).toEqual(CLIENT);
		expect(ctx.saveCalls).toEqual([]);
		ctx.stop();
	});

	it("ignores stale results so a slower earlier save cannot flash back", async () => {
		const ctx = await live();
		const first = { ...LOCAL, projects: { "/a": "product" } };
		const second = { ...LOCAL, projects: { "/b": "product" } };
		ctx.store.set(spacesAtom, first);
		ctx.store.set(spacesAtom, second);
		ctx.emit({ revision: 2, data: sharedSpacePart(first) });
		ctx.saveCalls[1]?.reply.resolve({ revision: 3, data: sharedSpacePart(second) });
		await flush();
		ctx.saveCalls[0]?.reply.resolve({ revision: 2, data: sharedSpacePart(first) });
		await flush();
		expect(ctx.store.get(spacesAtom).projects).toEqual({ "/b": "product" });
		ctx.stop();
	});

	it("adopts what main actually stored (e.g. sanitized data)", async () => {
		const ctx = await live();
		ctx.store.set(spacesAtom, { ...LOCAL, projects: { "/a": "product", "/b": "product" } });
		ctx.saveCalls[0]?.reply.resolve({
			revision: 2,
			data: { ...sharedSpacePart(LOCAL), projects: { "/a": "product" } },
		});
		await flush();
		expect(ctx.store.get(spacesAtom).projects).toEqual({ "/a": "product" });
		expect(ctx.saveCalls).toHaveLength(1);
		ctx.stop();
	});

	it("retries the latest data after a failed save", async () => {
		const ctx = await live();
		ctx.store.set(spacesAtom, { ...LOCAL, projects: { "/a": "product" } });
		ctx.saveCalls[0]?.reply.reject(new Error("disk full"));
		await flush();
		ctx.store.set(spacesAtom, { ...LOCAL, projects: { "/b": "product" } });
		ctx.saveCalls[1]?.reply.reject(new Error("disk full"));
		await flush();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(ctx.saveCalls).toHaveLength(3);
		expect(ctx.saveCalls[2]?.data.projects).toEqual({ "/b": "product" });
		expect(ctx.onError).toHaveBeenCalledTimes(2);
		ctx.stop();
	});

	it("marks the next start dirty when a save never succeeded", async () => {
		const ctx = await live();
		const edited = { ...LOCAL, projects: {} };
		ctx.store.set(spacesAtom, edited);
		ctx.saveCalls[0]?.reply.reject(new Error("main crashed"));
		await flush();
		ctx.stop();
		const next = setup({ local: edited, storage: ctx.storage });
		expect(next.syncCalls[0]?.request.localDirty).toBe(true);
		next.stop();
	});

	it("stops listening, saving and retrying once disposed", async () => {
		const ctx = await live();
		ctx.stop();
		expect(ctx.hasListener()).toBe(false);
		ctx.store.set(spacesAtom, { ...LOCAL, projects: {} });
		await vi.advanceTimersByTimeAsync(10_000);
		expect(ctx.saveCalls).toEqual([]);
	});
});

describe("applySharedSpaceData", () => {
	it("keeps spaces whose icon this version does not know, with a fallback icon", () => {
		const state = applySharedSpaceData(LOCAL, {
			spaces: [{ id: "future", name: "Future", icon: { kind: "solar", value: "hologram" } }],
			projects: { "/x": "future" },
			conversations: {},
		});
		expect(state.spaces).toEqual([{ id: "future", name: "Future", icon: { kind: "solar", value: "folder" } }]);
		expect(state.projects).toEqual({ "/x": "future" });
	});
});
