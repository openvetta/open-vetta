import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SpaceStore } from "./space-store.js";
import { createSpaceStoreFileIo } from "./space-store-instance.js";

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "vetta-space-store-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const PRODUCT = {
	spaces: [{ id: "product", name: "Product", icon: { kind: "solar", value: "code" } }],
	projects: { "/work/openvetta": "product" },
	conversations: {},
};

describe("space store file IO", () => {
	it("reads a missing file as absent and round-trips through a real store", async () => {
		const path = join(dir, "spaces.v1.json");
		const io = createSpaceStoreFileIo(path);
		expect(await io.read()).toBeUndefined();

		const store = new SpaceStore({ io });
		await store.sync({ sourceId: "prod", local: PRODUCT, localDirty: false });
		const reopened = new SpaceStore({ io: createSpaceStoreFileIo(path) });
		expect((await reopened.read()).data).toEqual(PRODUCT);
		expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ schemaVersion: 1, importedSources: ["prod"] });
	});

	it("keeps a timestamped copy of a corrupt file next to it", async () => {
		const path = join(dir, "spaces.v1.json");
		await writeFile(path, "{oops", "utf8");
		const store = new SpaceStore({ io: createSpaceStoreFileIo(path, () => 42) });
		await store.sync({ sourceId: "prod", local: PRODUCT, localDirty: false });
		expect(await readFile(`${path}.corrupt-42`, "utf8")).toBe("{oops");
		expect((await new SpaceStore({ io: createSpaceStoreFileIo(path) }).read()).data).toEqual(PRODUCT);
	});

	it("propagates read errors other than a missing file", async () => {
		const io = createSpaceStoreFileIo(dir);
		await expect(io.read()).rejects.toThrow();
	});

	it("leaves no temp files behind after writes", async () => {
		const path = join(dir, "spaces.v1.json");
		const store = new SpaceStore({ io: createSpaceStoreFileIo(path) });
		await store.save(PRODUCT);
		await store.save({ ...PRODUCT, projects: {} });
		expect(await readdir(dir)).toEqual(["spaces.v1.json"]);
	});
});
