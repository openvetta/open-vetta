import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { main, resolveElectronBuilderPublishMode } from "./run-electron-builder.js";

test("electron-builder never publishes unless the caller explicitly opts in", () => {
	assert.equal(resolveElectronBuilderPublishMode(undefined), "never");
	assert.equal(resolveElectronBuilderPublishMode("always"), "always");
});

for (const [selection, targets] of [
	[[], ["AppImage", "deb", "rpm"]],
	[["--target", "dir"], ["dir"]],
	[["--target", "deb"], ["deb"]],
	[["--target", "rpm"], ["rpm"]],
	[["--target", "AppImage,deb"], ["AppImage", "deb"]],
]) {
	test(`Linux build entry packages ${targets.join(", ")} without publishing`, (t) => {
		let command;
		t.mock.method(fs, "existsSync", () => true);
		t.mock.method(childProcess, "execFileSync", (executable, args) => {
			command = [executable, ...args].join(" ");
		});
		t.mock.method(childProcess, "execSync", (value) => {
			command = value;
		});
		syncBuiltinESMExports();
		t.after(() => {
			t.mock.restoreAll();
			syncBuiltinESMExports();
		});

		main(["--platform", "linux", "--arch", "x64", ...selection]);

		assert.ok(command.startsWith("bunx electron-builder "));
		assert.ok(command.endsWith(`--linux ${targets.join(" ")} --x64 --publish=never`), command);
	});
}
