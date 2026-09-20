import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveExternalSessionDirectory } from "../../../src/public-api/external-sessions.js";

describe("resolveExternalSessionDirectory", () => {
	const home = "/Users/ada";

	it("resolves well-known roots for each supported tool", () => {
		expect(resolveExternalSessionDirectory("grok", { homeDirectory: home, join })).toBe(
			join(home, ".grok", "sessions"),
		);
		expect(resolveExternalSessionDirectory("claude-code", { homeDirectory: home, join })).toBe(
			join(home, ".claude", "projects"),
		);
		expect(resolveExternalSessionDirectory("codex", { homeDirectory: home, join })).toBe(
			join(home, ".codex", "sessions"),
		);
		expect(resolveExternalSessionDirectory("cursor-agent", { homeDirectory: home, join })).toBe(
			join(home, ".cursor", "projects"),
		);
		expect(resolveExternalSessionDirectory("pi", { homeDirectory: home, join })).toBe(
			join(home, ".pi", "agent", "sessions"),
		);
		expect(resolveExternalSessionDirectory("omp", { homeDirectory: home, join })).toBe(
			join(home, ".omp", "agent", "sessions"),
		);
	});

	it("honors tool-specific home overrides", () => {
		expect(
			resolveExternalSessionDirectory("claude-code", {
				homeDirectory: home,
				claudeConfigDir: "/opt/claude",
				join,
			}),
		).toBe(join("/opt/claude", "projects"));
		expect(resolveExternalSessionDirectory("codex", { homeDirectory: home, codexHome: "/opt/codex", join })).toBe(
			join("/opt/codex", "sessions"),
		);
	});
});
