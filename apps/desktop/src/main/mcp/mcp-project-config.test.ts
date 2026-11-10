import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCompatMcpConfig, readMcpConfig, writeMcpConfig } from "./mcp-settings-service.js";

const variableReference = `\${SECRET_TOKEN}`;

describe("project MCP config files", () => {
	const directories: string[] = [];

	afterEach(async () => {
		await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
	});

	async function createProject(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "vetta-mcp-project-"));
		directories.push(root);
		return root;
	}

	it("round-trips a project install through <root>/.vetta/mcp.json", async () => {
		const cwd = await createProject();

		await writeMcpConfig(
			{ mcpServers: { docs: { command: "npx", args: ["-y", "docs-mcp"] } } },
			{ scope: "project", cwd },
		);

		const onDisk = JSON.parse(await readFile(join(cwd, ".vetta", "mcp.json"), "utf8"));
		expect(onDisk).toEqual({ mcpServers: { docs: { command: "npx", args: ["-y", "docs-mcp"] } } });
		await expect(readMcpConfig({ scope: "project", cwd })).resolves.toEqual(onDisk);
	});

	it("reads an absent project file as an empty config", async () => {
		const cwd = await createProject();

		await expect(readMcpConfig({ scope: "project", cwd })).resolves.toEqual({ mcpServers: {} });
	});

	it("refuses project roots that are relative, missing, a file, or remote", async () => {
		const cwd = await createProject();
		const file = join(cwd, "a-file");
		await writeFile(file, "x");
		const config = { mcpServers: { s: { command: "node" } } };

		await expect(writeMcpConfig(config, { scope: "project", cwd: "relative/dir" })).rejects.toThrow("absolute");
		await expect(writeMcpConfig(config, { scope: "project", cwd: join(cwd, "missing") })).rejects.toThrow(
			"not a directory",
		);
		await expect(writeMcpConfig(config, { scope: "project", cwd: file })).rejects.toThrow("not a directory");
		await expect(writeMcpConfig(config, { scope: "project", cwd: "ssh://host/repo" })).rejects.toThrow(
			"remote projects",
		);
	});

	it("reads only .mcp.json entries Vetta understands and keeps variable references unexpanded", async () => {
		const cwd = await createProject();
		await writeFile(
			join(cwd, ".mcp.json"),
			JSON.stringify({
				mcpServers: {
					ok: { command: "node", env: { TOKEN: variableReference } },
					legacy: { type: "sse", url: "https://example.test/sse" },
				},
			}),
		);
		await mkdir(join(cwd, ".vetta"), { recursive: true });
		await writeFile(
			join(cwd, ".vetta", "mcp.json"),
			JSON.stringify({ mcpServers: { native: { command: "native" } } }),
		);

		const compat = await readCompatMcpConfig(cwd);

		expect(Object.keys(compat.mcpServers)).toEqual(["ok"]);
		expect(compat.mcpServers.ok).toMatchObject({ env: { TOKEN: variableReference } });
	});
});
