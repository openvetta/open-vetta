import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { verifyLinuxPackages } from "./verify-linux-packages.mjs";

const version = "1.2.3";
const deb = `vetta_${version}_amd64.deb`;
const rpm = `vetta-${version}.x86_64.rpm`;
const contents = "/opt/Vetta/Vetta\n/opt/Vetta/resources/app.asar\n/usr/share/applications/Vetta.desktop\n";

function fixture(t, { metadata, payload = contents, corrupt = false } = {}) {
	const releaseDir = mkdtempSync(join(tmpdir(), "vetta-linux-packages-"));
	for (const name of [deb, rpm]) writeFileSync(join(releaseDir, name), "package fixture");
	t.mock.method(childProcess, "execFileSync", (command, args) => {
		if (corrupt) throw new Error("package archive is corrupt");
		assert.ok(["dpkg-deb", "rpm"].includes(command));
		assert.ok([deb, rpm].includes(basename(args.at(-1))));
		if (args.includes("--contents") || args.includes("-qpl")) return payload;
		return metadata ?? `vetta\n${version}\n${command === "rpm" ? "x86_64" : "amd64"}`;
	});
	syncBuiltinESMExports();
	t.after(() => {
		t.mock.restoreAll();
		syncBuiltinESMExports();
		rmSync(releaseDir, { recursive: true, force: true });
	});
	return { releaseDir, version, arch: "x64" };
}

test("release verification accepts both native packages with matching identity and installed application", (t) => {
	assert.deepEqual(verifyLinuxPackages(fixture(t)), [deb, rpm]);
});

for (const file of [deb, rpm]) {
	test(`release verification rejects a missing ${file}`, (t) => {
		const options = fixture(t);
		rmSync(join(options.releaseDir, file));
		assert.throws(() => verifyLinuxPackages(options), /Missing or empty Linux package/);
	});

	test(`release verification rejects an empty ${file}`, (t) => {
		const options = fixture(t);
		writeFileSync(join(options.releaseDir, file), "");
		assert.throws(() => verifyLinuxPackages(options), /Missing or empty Linux package/);
	});
}

for (const metadata of ["other\n1.2.3\namd64", "vetta\n1.2.2\namd64", "vetta\n1.2.3\narm64"]) {
	test(`release verification rejects wrong package identity: ${metadata.replaceAll("\n", "/")}`, (t) => {
		assert.throws(() => verifyLinuxPackages(fixture(t, { metadata })), /identity mismatch/);
	});
}

test("release verification rejects corrupt archives", (t) => {
	assert.throws(() => verifyLinuxPackages(fixture(t, { corrupt: true })), /archive is corrupt/);
});

for (const required of contents.trim().split("\n")) {
	test(`release verification rejects a package without ${required}`, (t) => {
		const options = fixture(t, { payload: contents.replace(`${required}\n`, "") });
		assert.throws(() => verifyLinuxPackages(options), /is missing/);
	});
}
