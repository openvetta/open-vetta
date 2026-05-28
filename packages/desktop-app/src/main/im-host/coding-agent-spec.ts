import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import type { CodingAgentSpec } from "./host-protocol.js";

/**
 * Resolve the on-disk root of the `@vetta/coding-agent` package so the
 * spawned agent-rpc subprocess can find its bundled runtime assets
 * (theme JSON, export-html template, package.json, banner). We never rely
 * on the subprocess's own `getPackageDir()` walk-up because once
 * coding-agent is Vite-bundled into Electron's main bundle, `__dirname`
 * resolves into the bundle's tree — wrong.
 *
 * Prod: assets are staged into <Resources>/coding-agent/ by prepare-pack.
 * Dev: resolve the workspace directory via the package's package.json.
 */
function resolveCodingAgentPackageDir(): string {
	if (app.isPackaged) {
		return join(process.resourcesPath, "coding-agent");
	}
	// Use ESM's import.meta.resolve to find coding-agent's main entry,
	// then walk up to the package root. We avoid require.resolve because
	// coding-agent's "exports" map has no "require" / "default" condition
	// (ESM-only export) and CJS resolution refuses it. We also avoid
	// "@vetta/coding-agent/package.json" subpath because "./package.json"
	// isn't listed in "exports".
	const entryUrl = import.meta.resolve("@vetta/coding-agent");
	const entry = fileURLToPath(entryUrl);
	let dir = dirname(entry);
	while (dir !== dirname(dir)) {
		if (existsSync(join(dir, "package.json"))) return dir;
		dir = dirname(dir);
	}
	throw new Error(`coding-agent package.json not found walking up from ${entry}`);
}

/**
 * Build the {@link CodingAgentSpec} that the im-gateway sidecar uses to
 * spawn one coding-agent subprocess per IM session.
 *
 * Production: Vetta.app's executable + `--agent-rpc` — main.ts detects the
 * flag early and short-circuits into `@vetta/coding-agent`'s `main`,
 * skipping window/UI bring-up. No external `vetta` CLI is required, which
 * is the whole point — packaged installs don't ship one on PATH.
 *
 * Dev: Electron + the bundled dev main entry + `--agent-rpc`. Mirrors the
 * production argv shape so the sidecar code path stays identical.
 *
 * `packageDir` is always populated so the sidecar forwards it as
 * `VETTA_PACKAGE_DIR` to the child — the only reliable way for the
 * bundled agent to find its on-disk assets.
 */
export function buildCodingAgentSpec(): CodingAgentSpec {
	const packageDir = resolveCodingAgentPackageDir();
	if (app.isPackaged) {
		return {
			bin: process.execPath,
			prefixArgs: ["--agent-rpc"],
			packageDir,
		};
	}
	const appRoot = process.cwd();
	return {
		bin: process.execPath,
		prefixArgs: [join(appRoot, "dist/main/index.js"), "--agent-rpc"],
		packageDir,
	};
}
