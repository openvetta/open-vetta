import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	parseDebContents,
	parseDebFields,
	parseRpmFields,
	readExpectedVersion,
	verifyLinuxPackageInspection,
} from "./verify-linux-packages.mjs";

const paths = [
	"/opt/penguin/penguin",
	"/opt/penguin/resources/package-type",
	"/usr/share/applications/vetta.desktop",
	"/usr/share/icons/hicolor/512x512/apps/vetta.png",
];

test("Linux package inspection accepts matching Debian and RPM packages", () => {
	assert.doesNotThrow(() =>
		verifyLinuxPackageInspection({
			expectedVersion: "1.2.3",
			deb: { name: "vetta", version: "1.2.3", arch: "amd64", paths },
			rpm: { name: "vetta", version: "1.2.3", arch: "x86_64", paths },
		}),
	);
});

test("Linux package inspection rejects wrong identities and incomplete payloads", () => {
	assert.throws(
		() =>
			verifyLinuxPackageInspection({
				expectedVersion: "1.2.3",
				deb: { name: "vetta", version: "1.2.2", arch: "amd64", paths },
				rpm: { name: "vetta", version: "1.2.3", arch: "x86_64", paths },
			}),
		/Debian version 1\.2\.2 does not match 1\.2\.3/,
	);
	assert.throws(
		() =>
			verifyLinuxPackageInspection({
				expectedVersion: "1.2.3",
				deb: { name: "vetta", version: "1.2.3", arch: "amd64", paths },
				rpm: { name: "vetta", version: "1.2.3", arch: "x86_64", paths: paths.slice(1) },
			}),
		/RPM package is missing \/opt\/penguin\/penguin/,
	);
});

test("package command output parsers normalize Debian and RPM metadata", () => {
	assert.deepEqual(
		parseDebFields("Package: vetta\nVersion: 1.2.3\nArchitecture: amd64\nDescription: Vetta\n"),
		{ name: "vetta", version: "1.2.3", arch: "amd64" },
	);
	assert.deepEqual(parseRpmFields("vetta\n1.2.3\nx86_64\n"), {
		name: "vetta",
		version: "1.2.3",
		arch: "x86_64",
	});
	assert.deepEqual(
		parseDebContents(
			"-rwxr-xr-x root/root 123 2026-01-01 00:00 ./opt/penguin/penguin\n" +
				"lrwxrwxrwx root/root 0 2026-01-01 00:00 ./usr/bin/vetta -> /opt/penguin/penguin\n",
		),
		["/opt/penguin/penguin", "/usr/bin/vetta"],
	);
});

test("native package verification uses the release manifest version", async () => {
	const releaseDir = await mkdtemp(join(tmpdir(), "vetta-linux-packages-"));
	try {
		await writeFile(join(releaseDir, "latest-linux.yml"), "version: 9.8.7\n");
		assert.equal(await readExpectedVersion(releaseDir), "9.8.7");
	} finally {
		await rm(releaseDir, { recursive: true, force: true });
	}
});
