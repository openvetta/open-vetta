import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const desktopRoot = resolve(import.meta.dirname, "..");

export function verifyLinuxPackages({
	releaseDir = join(desktopRoot, "release"),
	version = process.env.VETTA_DESKTOP_BUILD_VERSION ||
		JSON.parse(readFileSync(join(desktopRoot, "package.json"), "utf8")).version,
	arch = process.arch,
} = {}) {
	if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid package version: ${version}`);
	// The release matrix currently ships Linux x64 only.
	if (arch !== "x64") throw new Error(`Unsupported Linux release architecture: ${arch}`);
	const packages = [
		{ file: `vetta_${version}_amd64.deb`, format: "deb", architecture: "amd64" },
		{ file: `vetta-${version}.x86_64.rpm`, format: "rpm", architecture: "x86_64" },
	];
	for (const { file, format, architecture } of packages) {
		const path = join(releaseDir, file);
		const stats = statSync(path, { throwIfNoEntry: false });
		if (!stats?.isFile() || stats.size === 0) throw new Error(`Missing or empty Linux package: ${file}`);
		const metadata =
			format === "deb"
				? execFileSync("dpkg-deb", ["--show", "--showformat=${Package}\n${Version}\n${Architecture}", path], {
						encoding: "utf8",
					})
				: execFileSync("rpm", ["-qp", "--queryformat", "%{NAME}\n%{VERSION}\n%{ARCH}", path], {
						encoding: "utf8",
					});
		if (metadata.trim() !== `vetta\n${version}\n${architecture}`) {
			throw new Error(`Linux package identity mismatch: ${file}: ${metadata.trim()}`);
		}
		// Bundled Node/Python runtimes can exceed execFileSync's default 1 MiB listing buffer.
		const listOptions = { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 };
		const contents =
			format === "deb"
				? execFileSync("dpkg-deb", ["--contents", path], listOptions)
				: execFileSync("rpm", ["-qpl", path], listOptions);
		for (const required of [
			"/opt/Vetta/Vetta",
			"/opt/Vetta/resources/app.asar",
			"/usr/share/applications/Vetta.desktop",
		]) {
			if (!contents.split("\n").some((line) => line.trimEnd().endsWith(required))) {
				throw new Error(`Linux package ${file} is missing ${required}`);
			}
		}
		console.info(`[verify-linux-packages] verified ${file}`);
	}
	return packages.map(({ file }) => file);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) verifyLinuxPackages();
