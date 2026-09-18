import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectGrokSessionsDirectory } from "./grok-session-locator.js";

describe("detectGrokSessionsDirectory", () => {
	it("reports the default ~/.grok/sessions directory when it exists", () => {
		const home = mkdtempSync(join(tmpdir(), "grok-home-"));
		mkdirSync(join(home, ".grok", "sessions"), { recursive: true });

		expect(detectGrokSessionsDirectory({ homeDirectory: home, grokHome: "" })).toEqual({
			path: join(home, ".grok", "sessions"),
		});
	});

	it("prefers GROK_HOME/sessions when that directory exists", () => {
		const home = mkdtempSync(join(tmpdir(), "grok-home-"));
		const grokHome = mkdtempSync(join(tmpdir(), "grok-data-"));
		mkdirSync(join(grokHome, "sessions"));

		expect(detectGrokSessionsDirectory({ homeDirectory: home, grokHome })).toEqual({
			path: join(grokHome, "sessions"),
		});
	});

	it("returns no path when the well-known directory is missing", () => {
		const home = mkdtempSync(join(tmpdir(), "grok-missing-"));

		expect(detectGrokSessionsDirectory({ homeDirectory: home, grokHome: "" })).toEqual({});
	});

	it("returns no path when the well-known location is a file", () => {
		const home = mkdtempSync(join(tmpdir(), "grok-file-"));
		mkdirSync(join(home, ".grok"));
		writeFileSync(join(home, ".grok", "sessions"), "not a directory");

		expect(detectGrokSessionsDirectory({ homeDirectory: home, grokHome: "" })).toEqual({});
	});
});
