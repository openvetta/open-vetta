import { join } from "node:path";
import { app } from "electron";
import type { CodingAgentSpec } from "./host-protocol.js";

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
 */
export function buildCodingAgentSpec(): CodingAgentSpec {
	const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
	if (app.isPackaged) {
		return {
			bin: process.execPath,
			prefixArgs: ["--agent-rpc"],
		};
	}
	return {
		bin: process.execPath,
		prefixArgs: [join(appRoot, "dist/main/index.js"), "--agent-rpc"],
	};
}
