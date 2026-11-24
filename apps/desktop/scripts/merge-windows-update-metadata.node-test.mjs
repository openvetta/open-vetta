import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { parse, stringify } from "yaml";
import { mergeWindowsUpdateMetadata } from "./merge-windows-update-metadata.mjs";

const temporaryRoots = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function metadata(version, fileName) {
	return stringify({
		version,
		files: [{ url: fileName, sha512: `${fileName}-hash`, size: 10 }],
		path: fileName,
		sha512: `${fileName}-hash`,
		releaseDate: "2026-11-24T00:00:00.000Z",
	});
}

async function createReleaseDir({ arm64Version = "1.2.3" } = {}) {
	const releaseDir = await mkdtemp(join(tmpdir(), "vetta-win-merge-test-"));
	temporaryRoots.push(releaseDir);
	await writeFile(join(releaseDir, "latest-win-arm64.yml"), metadata(arm64Version, "Vetta-1.2.3-win-arm64.exe"));
	await writeFile(join(releaseDir, "latest-win-x64.yml"), metadata("1.2.3", "Vetta-1.2.3-win-x64.exe"));
	return releaseDir;
}

test("merges per-architecture Windows metadata into latest.yml with x64 as the primary installer", async () => {
	const releaseDir = await createReleaseDir();

	await mergeWindowsUpdateMetadata({ releaseDir });

	const written = parse(await readFile(join(releaseDir, "latest.yml"), "utf8"));
	assert.equal(written.version, "1.2.3");
	assert.deepEqual(
		written.files.map((file) => file.url),
		["Vetta-1.2.3-win-x64.exe", "Vetta-1.2.3-win-arm64.exe"],
	);
	assert.equal(written.path, "Vetta-1.2.3-win-x64.exe");
	assert.equal(written.sha512, "Vetta-1.2.3-win-x64.exe-hash");
	assert.deepEqual(await readdir(releaseDir), ["latest.yml"]);
});

test("rejects Windows metadata built from different versions", async () => {
	const releaseDir = await createReleaseDir({ arm64Version: "1.2.4" });
	await assert.rejects(mergeWindowsUpdateMetadata({ releaseDir }), /version mismatch/);
});

test("leaves an already merged latest.yml alone", async () => {
	const releaseDir = await mkdtemp(join(tmpdir(), "vetta-win-merge-test-"));
	temporaryRoots.push(releaseDir);
	await writeFile(join(releaseDir, "latest.yml"), metadata("1.2.3", "Vetta-1.2.3-win-x64.exe"));
	assert.equal(await mergeWindowsUpdateMetadata({ releaseDir }), null);
	assert.deepEqual(await readdir(releaseDir), ["latest.yml"]);
});
