import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileMcpConfigSource, parseMcpConfig } from "../../src/mcp/index.js";

describe("FileMcpConfigSource", () => {
	const temporaryDirectories: string[] = [];

	afterEach(async () => {
		await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
	});

	it("uses explicit paths, project root and environment instead of product defaults", async () => {
		const fixture = await createFixture();
		await writeJson(fixture.globalConfigPath, {
			mcpServers: {
				stdio: {
					command: configVariable("COMMAND"),
					args: [configVariable("MISSING")],
					cwd: configVariable("PROJECT_ROOT"),
					env: { TOKEN: configVariable("TOKEN") },
				},
				remote: {
					type: "http",
					url: `https://${configVariable("HOST")}/mcp`,
					headers: { Authorization: configVariable("TOKEN") },
				},
			},
		});
		const source = new FileMcpConfigSource({
			...fixture,
			projectRoot: fixture.root,
			environment: { COMMAND: "node", TOKEN: "secret", HOST: "example.test" },
		});

		expect(source.loadMerged()).toEqual({
			mcpServers: {
				stdio: {
					command: "node",
					args: [configVariable("MISSING")],
					cwd: fixture.root,
					env: { TOKEN: "secret" },
				},
				remote: {
					type: "http",
					url: "https://example.test/mcp",
					headers: { Authorization: "secret" },
				},
			},
		});
	});

	it("filters global and project servers before merging while preserving project overrides", async () => {
		const fixture = await createFixture();
		await writeJson(fixture.globalConfigPath, {
			mcpServers: {
				application: { command: "application" },
				workspace: { command: "global-workspace" },
			},
		});
		await writeJson(fixture.projectConfigPath, {
			mcpServers: {
				workspace: { command: "project-workspace" },
				project: { command: "project" },
			},
		});
		const source = new FileMcpConfigSource({
			...fixture,
			projectRoot: fixture.root,
			includeServer: ({ origin, name }) => origin === "project" || name === "workspace",
		});

		expect(source.loadGlobal()).toEqual({ mcpServers: { workspace: { command: "global-workspace" } } });
		expect(source.loadProject()).toEqual({
			mcpServers: {
				workspace: { command: "project-workspace" },
				project: { command: "project" },
			},
		});
		expect(source.loadMerged()).toEqual({
			mcpServers: {
				workspace: { command: "project-workspace" },
				project: { command: "project" },
			},
		});
	});

	it("keeps project field overrides shallow and preserves global-only servers", async () => {
		const fixture = await createFixture();
		await writeJson(fixture.globalConfigPath, {
			mcpServers: {
				shared: { command: "global", args: ["one"], env: { FIRST: "1" } },
				global: { command: "global-only" },
			},
		});
		await writeJson(fixture.projectConfigPath, {
			mcpServers: { shared: { command: "project", env: { SECOND: "2" } } },
		});
		const source = new FileMcpConfigSource({ ...fixture, projectRoot: fixture.root });

		expect(source.loadMerged()).toEqual({
			mcpServers: {
				shared: { command: "project", args: ["one"], env: { SECOND: "2" }, cwd: undefined },
				global: { command: "global-only", args: undefined, cwd: undefined, env: undefined },
			},
		});
	});

	it("merges a compat .mcp.json into the project layer without letting it override the native project file", async () => {
		const fixture = await createFixture();
		await writeJson(fixture.globalConfigPath, { mcpServers: { shared: { command: "global" } } });
		await writeJson(fixture.compatProjectConfigPath, {
			mcpServers: {
				shared: { command: "compat", args: ["compat-arg"] },
				duplicated: { command: "compat-duplicated", args: ["compat-arg"] },
				compatOnly: { type: "http", url: "https://compat.test/mcp" },
			},
		});
		await writeJson(fixture.projectConfigPath, {
			mcpServers: { duplicated: { command: "native-duplicated" } },
		});
		const source = new FileMcpConfigSource({ ...fixture, projectRoot: fixture.root });

		expect(source.loadProject()).toEqual({
			mcpServers: {
				shared: { command: "compat", args: ["compat-arg"] },
				duplicated: { command: "native-duplicated" },
				compatOnly: { type: "http", url: "https://compat.test/mcp" },
			},
		});
		expect(Object.keys(source.loadMerged().mcpServers).sort()).toEqual(["compatOnly", "duplicated", "shared"]);
		expect(source.loadMerged().mcpServers.shared).toMatchObject({ command: "compat", args: ["compat-arg"] });
	});

	it("skips unsupported compat servers and malformed compat files without breaking other MCP config", async () => {
		const fixture = await createFixture();
		const diagnostics: string[] = [];
		await writeJson(fixture.globalConfigPath, { mcpServers: { global: { command: "global" } } });
		await writeJson(fixture.compatProjectConfigPath, {
			mcpServers: {
				unsupported: { type: "websocket", url: "wss://compat.test/ws" },
				broken: { type: "http" },
				ok: { command: "ok" },
			},
		});
		const source = new FileMcpConfigSource({
			...fixture,
			projectRoot: fixture.root,
			onDiagnostic: (message) => diagnostics.push(message),
		});

		expect(source.loadMerged()).toEqual({
			mcpServers: {
				global: { command: "global", args: undefined, cwd: undefined, env: undefined },
				ok: { command: "ok", args: undefined, cwd: undefined, env: undefined },
			},
		});
		source.loadProject();
		expect(diagnostics).toHaveLength(2);
		expect(diagnostics.join("\n")).toContain("Skipped server 'unsupported'");
		expect(diagnostics.join("\n")).toContain("Skipped server 'broken'");

		await writeFile(fixture.compatProjectConfigPath, "{ not json", "utf8");
		expect(source.loadProject()).toBeNull();
		expect(diagnostics.at(-1)).toContain(`Ignored ${fixture.compatProjectConfigPath}`);
		expect(source.loadMerged().mcpServers.global).toBeDefined();
	});

	it("resolves default-value variables in the style used by .mcp.json", async () => {
		const fixture = await createFixture();
		await writeJson(fixture.compatProjectConfigPath, {
			mcpServers: {
				remote: {
					type: "http",
					url: `${configVariable("API_BASE:-https://default.test")}/mcp`,
					headers: { "X-Key": configVariable("EMPTY:-fallback"), "X-Set": configVariable("SET:-unused") },
				},
			},
		});
		const source = new FileMcpConfigSource({
			...fixture,
			projectRoot: fixture.root,
			environment: { EMPTY: "", SET: "value" },
		});

		expect(source.loadMerged().mcpServers.remote).toMatchObject({
			url: "https://default.test/mcp",
			headers: { "X-Key": "fallback", "X-Set": "value" },
		});
	});

	it("keeps type sse from a compat file and expands variables in its url and headers", async () => {
		const fixture = await createFixture();
		await writeJson(fixture.compatProjectConfigPath, {
			mcpServers: {
				legacy: {
					type: "sse",
					url: `https://${configVariable("HOST")}/sse`,
					headers: { Authorization: configVariable("TOKEN") },
				},
			},
		});
		const source = new FileMcpConfigSource({
			...fixture,
			projectRoot: fixture.root,
			environment: { HOST: "example.test", TOKEN: "secret" },
		});

		expect(source.loadMerged().mcpServers.legacy).toMatchObject({
			type: "sse",
			url: "https://example.test/sse",
			headers: { Authorization: "secret" },
		});
	});

	it("rejects an sse server that asks for the modern protocol", () => {
		expect(
			parseMcpConfig({ mcpServers: { s: { type: "sse", url: "https://x.test/sse", protocolMode: "legacy" } } }),
		).toBeDefined();
		expect(() =>
			parseMcpConfig({ mcpServers: { s: { type: "sse", url: "https://x.test/sse", protocolMode: "modern" } } }),
		).toThrow('only supports protocolMode "legacy"');
		expect(() =>
			parseMcpConfig({ mcpServers: { s: { type: "sse", url: "https://x.test/sse", protocolMode: "auto" } } }),
		).toThrow('only supports protocolMode "legacy"');
		expect(() => parseMcpConfig({ mcpServers: { s: { type: "sse" } } })).toThrow("missing or invalid 'url'");
	});

	it("includes the compat file in the merged signature", async () => {
		const fixture = await createFixture();
		const source = new FileMcpConfigSource({ ...fixture, projectRoot: fixture.root });
		const before = source.getMergedSignature();
		await writeJson(fixture.compatProjectConfigPath, { mcpServers: { first: { command: "one" } } });

		expect(source.getMergedSignature()).not.toBe(before);
	});

	it("validates untrusted JSON through the TypeBox-backed parser", () => {
		expect(parseMcpConfig({ mcpServers: { valid: { command: "node" } } })).toEqual({
			mcpServers: { valid: { command: "node" } },
		});
		expect(() => parseMcpConfig({ mcpServers: { invalid: { type: "http", headers: [] } } })).toThrow(
			"missing or invalid 'url'",
		);
		expect(() => parseMcpConfig({ mcpServers: { invalid: { command: "" } } })).toThrow(
			"missing or invalid 'command'",
		);
		expect(() => parseMcpConfig({ mcpServers: { invalid: { type: "http", url: "" } } })).toThrow(
			"missing or invalid 'url'",
		);
		expect(() => parseMcpConfig({ mcpServers: { invalid: { command: "node", startupTimeout: "fast" } } })).toThrow(
			"'startupTimeout' must be a number",
		);
		expect(parseMcpConfig({ mcpServers: { shared: { command: "node", resourceScope: "application" } } })).toEqual({
			mcpServers: { shared: { command: "node", resourceScope: "application" } },
		});
		expect(() => parseMcpConfig({ mcpServers: { invalid: { command: "node", resourceScope: "session" } } })).toThrow(
			'\'resourceScope\' must be "application" or "workspace"',
		);
	});

	it("changes its signature for content changes without requiring a new source", async () => {
		const fixture = await createFixture();
		const source = new FileMcpConfigSource({ ...fixture, projectRoot: fixture.root });
		const missing = source.getMergedSignature();
		await writeJson(fixture.globalConfigPath, { mcpServers: { first: { command: "one" } } });
		const first = source.getMergedSignature();
		await writeJson(fixture.globalConfigPath, { mcpServers: { first: { command: "two" } } });

		expect(first).not.toBe(missing);
		expect(source.getMergedSignature()).not.toBe(first);
	});

	async function createFixture() {
		const root = await mkdtemp(join(tmpdir(), "runtime-mcp-config-"));
		temporaryDirectories.push(root);
		return {
			root,
			globalConfigPath: join(root, "agent", "mcp.json"),
			projectConfigPath: join(root, "project", ".vetta", "mcp.json"),
			compatProjectConfigPath: join(root, "project", ".mcp.json"),
		};
	}
});

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(value), "utf8");
}

function configVariable(name: string): string {
	return `\${${name}}`;
}
