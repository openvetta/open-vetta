import { describe, expect, it } from "vitest";
import type { SharedSpaceData, SpaceStoreSnapshot } from "../../shared/spaces-ipc.js";
import {
	EMPTY_SHARED_SPACE_DATA,
	mergeSharedSpaceData,
	SPACE_STORE_SCHEMA_VERSION,
	SpaceStore,
	type SpaceStoreFileIo,
	sanitizeSharedSpaceData,
	sharedSpaceDataKey,
} from "./space-store.js";

const icon = { kind: "solar", value: "code" };
const PRODUCT: SharedSpaceData = {
	spaces: [{ id: "product", name: "Product", icon }],
	projects: { "/work/openvetta": "product" },
	conversations: { "/c/s1.jsonl": "product" },
};
const CLIENT: SharedSpaceData = {
	spaces: [{ id: "client", name: "Client", icon, siblingProjects: false }],
	projects: { "/work/client": "client", "/work/openvetta": "client" },
	conversations: {},
};

function memoryIo(initial?: string) {
	let content = initial;
	const backups: string[] = [];
	const writes: string[] = [];
	const io: SpaceStoreFileIo & { fail?: boolean } = {
		read: async () => content,
		write: async (next) => {
			if (io.fail) throw new Error("disk full");
			content = next;
			writes.push(next);
		},
		backupCorrupt: async (raw) => {
			backups.push(raw);
		},
	};
	return {
		io,
		backups,
		writes,
		file: () => (content === undefined ? undefined : JSON.parse(content)),
		replace: (next: string | undefined) => {
			content = next;
		},
	};
}

/** 记下实际发出的告警，断言文案与原因，而不只是「告警过」。 */
function recordingLog() {
	const warnings: Array<{ message: string; reason: string }> = [];
	const log = {
		warn: (message: string, details?: unknown) => {
			warnings.push({ message, reason: details instanceof Error ? details.message : String(details) });
		},
	};
	return { log, warnings };
}

function createStore(initial?: string) {
	const memory = memoryIo(initial);
	const changes: SpaceStoreSnapshot[] = [];
	const { log, warnings } = recordingLog();
	const store = new SpaceStore({ io: memory.io, onChanged: (snapshot) => changes.push(snapshot), log });
	return { store, changes, warnings, ...memory };
}

function fileWith(data: SharedSpaceData, importedSources: string[], extra: Record<string, unknown> = {}) {
	return JSON.stringify({ schemaVersion: SPACE_STORE_SCHEMA_VERSION, revision: 3, data, importedSources, ...extra });
}

describe("sanitizeSharedSpaceData", () => {
	it("drops broken spaces, the main space, duplicates and memberships to missing spaces", () => {
		expect(
			sanitizeSharedSpaceData({
				spaces: [
					{ id: "a", name: "A", icon },
					{ id: "a", name: "dup", icon },
					{ id: "main", name: "Main", icon },
					{ id: "b", name: " ", icon },
					{ id: "c", name: "C", icon: { kind: "solar" } },
					{ id: "d", name: "D", icon, siblingProjects: true, extra: 1 },
					{ id: "e", name: "E", icon, siblingProjects: false },
				],
				projects: { "/p": "a", "/q": "ghost", "/r": "main", "": "a" },
				conversations: { "/s": "e", "/t": 3 },
			}),
		).toEqual({
			spaces: [
				{ id: "a", name: "A", icon },
				{ id: "d", name: "D", icon },
				{ id: "e", name: "E", icon, siblingProjects: false },
			],
			projects: { "/p": "a" },
			conversations: { "/s": "e" },
		});
	});

	it.each([undefined, null, [], "x"])("returns empty data for %p", (value) => {
		expect(sanitizeSharedSpaceData(value)).toEqual(EMPTY_SHARED_SPACE_DATA);
	});
});

describe("mergeSharedSpaceData", () => {
	it("unions spaces by id and keeps the base assignment on conflicts", () => {
		expect(mergeSharedSpaceData(PRODUCT, CLIENT)).toEqual({
			spaces: [...PRODUCT.spaces, ...CLIENT.spaces],
			projects: { "/work/client": "client", "/work/openvetta": "product" },
			conversations: { "/c/s1.jsonl": "product" },
		});
	});

	it("is idempotent", () => {
		const once = mergeSharedSpaceData(PRODUCT, CLIENT);
		expect(sharedSpaceDataKey(mergeSharedSpaceData(once, CLIENT))).toBe(sharedSpaceDataKey(once));
	});
});

describe("sharedSpaceDataKey", () => {
	it("ignores membership key order but not space order", () => {
		expect(sharedSpaceDataKey({ ...PRODUCT, projects: { "/b": "product", "/a": "product" } })).toBe(
			sharedSpaceDataKey({ ...PRODUCT, projects: { "/a": "product", "/b": "product" } }),
		);
		const two = mergeSharedSpaceData(PRODUCT, CLIENT);
		expect(sharedSpaceDataKey(two)).not.toBe(sharedSpaceDataKey({ ...two, spaces: [...two.spaces].reverse() }));
	});
});

describe("SpaceStore.sync (upgrade handshake)", () => {
	it("imports the local data verbatim when no store exists yet (first upgrade)", async () => {
		const { store, file } = createStore();
		const snapshot = await store.sync({ sourceId: "prod", local: PRODUCT, localDirty: false });
		expect(snapshot.data).toEqual(PRODUCT);
		expect(file()).toMatchObject({ schemaVersion: 1, revision: 1, data: PRODUCT, importedSources: ["prod"] });
	});

	it("creates an empty store for a fresh install", async () => {
		const { store, file } = createStore();
		await store.sync({ sourceId: "new", local: EMPTY_SHARED_SPACE_DATA, localDirty: false });
		expect(file()).toMatchObject({ data: EMPTY_SHARED_SPACE_DATA, importedSources: ["new"] });
	});

	it("merges a second installation's local data once", async () => {
		const { store, file, writes } = createStore(fileWith(PRODUCT, ["prod"]));
		const merged = await store.sync({ sourceId: "dev", local: CLIENT, localDirty: false });
		expect(merged.data).toEqual(mergeSharedSpaceData(PRODUCT, CLIENT));
		expect(file().importedSources).toEqual(["prod", "dev"]);

		const again = await store.sync({ sourceId: "dev", local: CLIENT, localDirty: false });
		expect(again.data).toEqual(merged.data);
		expect(writes).toHaveLength(1);
	});

	it("returns the store and ignores clean local data from an already imported source", async () => {
		const { store, writes } = createStore(fileWith(PRODUCT, ["prod"]));
		const snapshot = await store.sync({ sourceId: "prod", local: CLIENT, localDirty: false });
		expect(snapshot.data).toEqual(PRODUCT);
		expect(writes).toEqual([]);
	});

	it("lets dirty local data win (changes made after a downgrade or while main was unreachable)", async () => {
		const { store, file } = createStore(fileWith(PRODUCT, ["prod"]));
		const snapshot = await store.sync({ sourceId: "prod", local: CLIENT, localDirty: true });
		expect(snapshot.data).toEqual(CLIENT);
		expect(file()).toMatchObject({ data: CLIENT, revision: 4, importedSources: ["prod"] });
	});

	it("never overwrites a store written by a newer version", async () => {
		const future = JSON.stringify({ schemaVersion: 2, whatever: true });
		const { store, writes, file, warnings } = createStore(future);
		const synced = await store.sync({ sourceId: "prod", local: PRODUCT, localDirty: true });
		expect(synced).toEqual({ revision: 0, data: PRODUCT, readOnly: true });
		const saved = await store.save(CLIENT);
		expect(saved.readOnly).toBe(true);
		expect(writes).toEqual([]);
		expect(file()).toEqual({ schemaVersion: 2, whatever: true });
		expect(warnings.map((warning) => warning.message)).toEqual([
			"space store was written by a newer version; keeping it read-only",
		]);
		expect(await store.read()).toMatchObject({ readOnly: true });
	});

	it.each([
		["not json", "{oops"],
		["no schema", JSON.stringify({ data: PRODUCT })],
		["older unknown schema", JSON.stringify({ schemaVersion: 0, data: PRODUCT })],
	])("backs up a corrupt store (%s) and re-imports local data", async (_name, raw) => {
		const { store, backups, file } = createStore(raw);
		const snapshot = await store.sync({ sourceId: "prod", local: PRODUCT, localDirty: false });
		expect(backups).toEqual([raw]);
		expect(snapshot.data).toEqual(PRODUCT);
		expect(file().importedSources).toEqual(["prod"]);
	});

	it("still recovers when the corrupt backup cannot be written", async () => {
		const { store, io, warnings } = createStore("{oops");
		io.backupCorrupt = async () => {
			throw new Error("read-only dir");
		};
		await expect(store.sync({ sourceId: "prod", local: PRODUCT, localDirty: false })).resolves.toMatchObject({
			data: PRODUCT,
		});
		// 先说明文件坏了，再说明备份失败；恢复照样完成。
		expect(warnings).toEqual([
			{ message: "space store file is corrupt; backing it up and starting over", reason: "undefined" },
			{ message: "failed to back up corrupt space store", reason: "read-only dir" },
		]);
	});

	it("sanitizes the stored data and source list it reads back", async () => {
		const raw = fileWith(
			{ ...PRODUCT, projects: { ...PRODUCT.projects, "/x": "ghost" } } as SharedSpaceData,
			["prod", "prod", "" as string],
			{ revision: "bad" },
		);
		const { store } = createStore(raw);
		const snapshot = await store.sync({ sourceId: "prod", local: CLIENT, localDirty: false });
		expect(snapshot).toEqual({ revision: 0, data: PRODUCT });
	});
});

describe("SpaceStore.save", () => {
	it("persists, bumps the revision and broadcasts real changes only", async () => {
		const { store, changes, writes } = createStore(fileWith(PRODUCT, ["prod"]));
		const next = { ...PRODUCT, projects: { ...PRODUCT.projects, "/work/docs": "product" } };
		expect((await store.save(next)).revision).toBe(4);
		expect(changes.map((change) => change.data)).toEqual([next]);

		await store.save({ ...next, projects: { "/work/docs": "product", "/work/openvetta": "product" } });
		expect(writes).toHaveLength(1);
		expect(changes).toHaveLength(1);
	});

	it("keeps the previous state and rejects when the write fails", async () => {
		const { store, io, changes } = createStore(fileWith(PRODUCT, ["prod"]));
		io.fail = true;
		await expect(store.save(CLIENT)).rejects.toThrow("disk full");
		io.fail = false;
		expect((await store.read()).data).toEqual(PRODUCT);
		expect(changes).toEqual([]);
	});

	it("serializes concurrent saves so the last call wins on disk", async () => {
		const { store, file } = createStore(fileWith(PRODUCT, ["prod"]));
		await Promise.all([store.save(CLIENT), store.save(PRODUCT), store.save(CLIENT)]);
		expect(file().data).toEqual(CLIENT);
		expect(file().revision).toBe(6);
	});

	it("keeps working after a failed operation", async () => {
		const { store, io } = createStore();
		io.read = async () => {
			throw new Error("EACCES");
		};
		await expect(store.read()).rejects.toThrow("EACCES");
		io.read = async () => undefined;
		await expect(store.save(PRODUCT)).resolves.toMatchObject({ data: PRODUCT });
	});

	it("isolates listener failures", async () => {
		const memory = memoryIo();
		const { log, warnings } = recordingLog();
		const store = new SpaceStore({
			io: memory.io,
			log,
			onChanged: () => {
				throw new Error("window gone");
			},
		});
		await expect(store.save(PRODUCT)).resolves.toMatchObject({ data: PRODUCT });
		expect(warnings).toEqual([{ message: "space store change listener failed", reason: "window gone" }]);
	});
});

describe("SpaceStore.reloadFromDisk", () => {
	it("broadcasts a change written by another process", async () => {
		const { store, changes, replace } = createStore(fileWith(PRODUCT, ["prod"]));
		await store.read();
		replace(fileWith(CLIENT, ["prod", "dev"]));
		await store.reloadFromDisk();
		expect(changes.map((change) => change.data)).toEqual([CLIENT]);
		expect((await store.read()).data).toEqual(CLIENT);
	});

	it("stays quiet for our own writes and for unchanged content", async () => {
		const { store, changes } = createStore(fileWith(PRODUCT, ["prod"]));
		await store.save(CLIENT);
		changes.length = 0;
		await store.reloadFromDisk();
		expect(changes).toEqual([]);
	});

	it("does not broadcast when the file disappears", async () => {
		const { store, changes, replace } = createStore(fileWith(PRODUCT, ["prod"]));
		await store.read();
		replace(undefined);
		await store.reloadFromDisk();
		expect(changes).toEqual([]);
	});
});
