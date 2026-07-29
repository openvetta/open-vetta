import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = resolve(import.meta.dirname, "..");
const distRoot = resolve(packageRoot, "dist");
const forbiddenPackageSpecifiers = new Set(["@vetta/cli-app"]);

async function walkFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walkFiles(path)));
		if (entry.isFile()) files.push(path);
	}
	return files;
}

function collectModuleSpecifiers(source) {
	const specifiers = [];
	const patterns = [
		/\b(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
	];
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
	}
	return specifiers;
}

function isInside(root, path) {
	const relativePath = relative(root, path);
	return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== "..");
}

async function assertEmittedModuleGraph() {
	const emittedFiles = (await walkFiles(distRoot)).filter((path) => {
		const extension = extname(path);
		return extension === ".js" || path.endsWith(".d.ts");
	});
	for (const file of emittedFiles) {
		const source = await readFile(file, "utf8");
		for (const specifier of collectModuleSpecifiers(source)) {
			if (
				forbiddenPackageSpecifiers.has(specifier) ||
				[...forbiddenPackageSpecifiers].some((name) => specifier.startsWith(`${name}/`))
			) {
				throw new Error(`${relative(packageRoot, file)} imports forbidden host package ${specifier}`);
			}
			if (!specifier.startsWith(".")) continue;
			const target = resolve(dirname(file), specifier);
			if (!isInside(distRoot, target)) {
				throw new Error(`${relative(packageRoot, file)} escapes dist through ${specifier}`);
			}
			await access(target);
		}
	}
}

async function assertManifest() {
	const entry = await import(`${pathToFileURL(resolve(distRoot, "index.js")).href}?verify=${Date.now()}`);
	const manifest = entry.RUNTIME_COMPOSITION_ARTIFACT_MANIFEST;
	if (manifest?.packageName !== "@vetta/runtime-composition") {
		throw new Error("Runtime Composition artifact manifest is missing or invalid");
	}
	for (const path of [...manifest.entrypoints, ...manifest.typeEntrypoints, ...manifest.runtimeAssets]) {
		const target = resolve(distRoot, path);
		if (!isInside(distRoot, target)) throw new Error(`Artifact manifest path escapes dist: ${path}`);
		await access(target);
	}
}

await assertEmittedModuleGraph();
await assertManifest();
console.log("[runtime-composition-artifact] ok");
