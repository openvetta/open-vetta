import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const projectRoot = join(import.meta.dirname, "..");
const buildStageDir = join(tmpdir(), "vetta-desktop-build");

// Resolve electron version from the workspace
const require = createRequire(import.meta.url);
const electronPkgPath = require.resolve("electron/package.json");
const electronVersion = JSON.parse(readFileSync(electronPkgPath, "utf8")).version;

// Clean previous build stage
rmSync(buildStageDir, { recursive: true, force: true });
mkdirSync(buildStageDir, { recursive: true });

// Write minimal package.json (no dependencies)
const appPkg = {
	name: "@vetta/desktop-app",
	version: "0.0.1",
	description: "Vetta Desktop App",
	author: "Vetta",
	type: "module",
	main: "main/index.js",
};
writeFileSync(join(buildStageDir, "package.json"), JSON.stringify(appPkg, null, "\t") + "\n");

// Copy build outputs
cpSync(join(projectRoot, "dist/main"), join(buildStageDir, "main"), { recursive: true });
cpSync(join(projectRoot, "dist/preload"), join(buildStageDir, "preload"), { recursive: true });
cpSync(join(projectRoot, "dist/renderer"), join(buildStageDir, "renderer"), { recursive: true });

// Copy icons
cpSync(join(projectRoot, "build"), join(buildStageDir, "build"), { recursive: true });

// Write electron-builder config
const builderConfig = {
	appId: "com.vetta.desktop",
	productName: "Vetta",
	electronVersion,
	npmRebuild: false,
	mac: {
		target: ["dmg", "zip"],
		category: "public.app-category.productivity",
		icon: "build/icon.icns",
		identity: null,
	},
	directories: {
		output: join(projectRoot, "release"),
	},
	asar: true,
};
writeFileSync(join(buildStageDir, "electron-builder.json"), JSON.stringify(builderConfig, null, "\t") + "\n");

console.log(`build staged at: ${buildStageDir}`);
