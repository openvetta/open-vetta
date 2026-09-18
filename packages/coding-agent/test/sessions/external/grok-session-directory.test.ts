import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGrokSessionsDirectory } from "../../../src/sessions/external/grok-session-directory.js";

describe("resolveGrokSessionsDirectory", () => {
	it("uses ~/.grok/sessions when GROK_HOME is unset", () => {
		expect(
			resolveGrokSessionsDirectory({
				homeDirectory: "/Users/ada",
				join: posix.join,
			}),
		).toBe("/Users/ada/.grok/sessions");
	});

	it("prefers GROK_HOME when it is set", () => {
		expect(
			resolveGrokSessionsDirectory({
				grokHome: "/opt/grok-data",
				homeDirectory: "/Users/ada",
				join: posix.join,
			}),
		).toBe("/opt/grok-data/sessions");
	});

	it("ignores a blank GROK_HOME override", () => {
		expect(
			resolveGrokSessionsDirectory({
				grokHome: "   ",
				homeDirectory: "/Users/ada",
				join: posix.join,
			}),
		).toBe("/Users/ada/.grok/sessions");
	});
});
