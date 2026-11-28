import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveConfig, transformWithEsbuild } from "vite";

test("renderer development modules lower using declarations for Electron 34", async () => {
	const configFile = fileURLToPath(new URL("../vite.config.ts", import.meta.url));
	const config = await resolveConfig({ configFile }, "serve");
	const source = "export function close(resource) { using disposable = resource; }";
	const { code } = await transformWithEsbuild(source, "syntax.ts", { target: "esnext", ...config.esbuild });
	assert.doesNotMatch(code, /\busing disposable\s*=/);
});
