import { describe, expect, it, vi } from "vitest";
import type { McpConfigData } from "../../preload/api-types/mcp.js";
import { type McpConfigTarget, McpSettingsService } from "./mcp-settings-service.js";

function createConfig(): McpConfigData {
	return {
		mcpServers: {
			web: {
				type: "http",
				url: "https://mcp.example.com",
				headers: { Authorization: "Bearer secret", "X-Region": "us" },
				oauthClientId: "public-client",
			},
			local: {
				command: "node",
				args: ["server.js"],
				env: { API_KEY: "secret", REGION: "us" },
			},
		},
	};
}

describe("McpSettingsService", () => {
	it("records a newly added MCP server as an installed ability", async () => {
		let config: McpConfigData = { mcpServers: {} };
		const recordEvent = vi.fn();
		const service = new McpSettingsService({
			readConfig: async () => config,
			writeConfig: async (next) => {
				config = next;
			},
			recordEvent,
		});

		await service.upsert("demo", { type: "http", url: "https://mcp.example.com" });

		expect(recordEvent).toHaveBeenCalledWith({
			type: "resource.lifecycle",
			resourceKind: "mcp",
			resourceId: "demo",
			operation: "installed",
			source: "custom",
		});
	});

	it("returns redacted server details without exposing secrets", async () => {
		const service = new McpSettingsService({
			readConfig: async () => createConfig(),
			writeConfig: vi.fn(),
		});

		await expect(service.get("web")).resolves.toEqual({
			name: "web",
			type: "http",
			url: "https://mcp.example.com",
			headers: { Authorization: "***", "X-Region": "us" },
			disabled: false,
		});
		await expect(service.get("local")).resolves.toEqual({
			name: "local",
			type: "stdio",
			command: "node",
			args: ["server.js"],
			env: { API_KEY: "***", REGION: "us" },
			disabled: false,
		});
	});

	it("updates one server while preserving internal OAuth fields", async () => {
		let config = createConfig();
		const recordEvent = vi.fn();
		const writeConfig = vi.fn<(next: McpConfigData, target: McpConfigTarget) => Promise<void>>(async (next) => {
			config = next;
		});
		const service = new McpSettingsService({
			readConfig: async () => config,
			writeConfig,
			recordEvent,
		});

		await expect(
			service.upsert("web", {
				type: "http",
				headers: { Authorization: "Bearer next" },
				disabled: true,
			}),
		).resolves.toEqual({
			name: "web",
			type: "http",
			url: "https://mcp.example.com",
			headers: { Authorization: "***" },
			disabled: true,
		});
		expect(writeConfig).toHaveBeenCalledWith(
			{
				mcpServers: {
					web: {
						type: "http",
						url: "https://mcp.example.com",
						headers: { Authorization: "Bearer next" },
						oauthClientId: "public-client",
						disabled: true,
					},
					local: {
						command: "node",
						args: ["server.js"],
						env: { API_KEY: "secret", REGION: "us" },
					},
				},
			},
			{ scope: "global" },
		);
		expect(recordEvent).toHaveBeenCalledWith({
			type: "resource.lifecycle",
			resourceKind: "mcp",
			resourceId: "web",
			operation: "updated",
		});
	});

	it("serializes enabled-state changes and removal", async () => {
		let config = createConfig();
		const recordEvent = vi.fn();
		const service = new McpSettingsService({
			readConfig: async () => config,
			writeConfig: async (next) => {
				config = next;
			},
			recordEvent,
		});

		await service.setEnabled("local", false);
		await service.remove("web");

		expect(config).toEqual({
			mcpServers: {
				local: {
					command: "node",
					args: ["server.js"],
					env: { API_KEY: "secret", REGION: "us" },
					disabled: true,
				},
			},
		});
		expect(recordEvent.mock.calls.map(([event]) => event)).toEqual([
			{
				type: "resource.lifecycle",
				resourceKind: "mcp",
				resourceId: "local",
				operation: "disabled",
			},
			{
				type: "resource.lifecycle",
				resourceKind: "mcp",
				resourceId: "web",
				operation: "uninstalled",
			},
		]);
	});

	describe("scope", () => {
		const PROJECT = "/work/repo";

		/** 两个文件各自独立存储，以便断言写入落在哪一层。 */
		function createLayeredService(initial: {
			global?: McpConfigData["mcpServers"];
			project?: McpConfigData["mcpServers"];
			compat?: McpConfigData["mcpServers"];
		}) {
			const files = {
				global: { mcpServers: { ...(initial.global ?? {}) } } as McpConfigData,
				project: { mcpServers: { ...(initial.project ?? {}) } } as McpConfigData,
			};
			const writes: McpConfigTarget[] = [];
			const service = new McpSettingsService({
				readConfig: async (target) => files[target.scope],
				writeConfig: async (next, target) => {
					writes.push(target);
					files[target.scope] = next;
				},
				readCompatConfig: async () => ({ mcpServers: { ...(initial.compat ?? {}) } }),
			});
			return { service, files, writes };
		}

		it("writes a project install to the project file and leaves the global file untouched", async () => {
			const { service, files, writes } = createLayeredService({ global: { shared: { command: "global" } } });

			const detail = await service.upsert(
				"docs",
				{ command: "npx", args: ["-y", "docs-mcp"] },
				{ scope: "project", cwd: PROJECT },
			);

			expect(writes).toEqual([{ scope: "project", cwd: PROJECT }]);
			expect(files.project.mcpServers.docs).toMatchObject({ command: "npx" });
			expect(files.global.mcpServers).toEqual({ shared: { command: "global" } });
			expect(detail).toMatchObject({ name: "docs", scope: "project" });
		});

		it("keeps the global default when no scope is given, even if a project root is passed on writes", async () => {
			const { service, files, writes } = createLayeredService({});

			await service.upsert("tool", { command: "node" }, { cwd: PROJECT });

			expect(writes).toEqual([{ scope: "global" }]);
			expect(files.project.mcpServers).toEqual({});
		});

		it("refuses a project scope without a project root instead of falling back to global", async () => {
			const { service, writes } = createLayeredService({});

			await expect(service.upsert("tool", { command: "node" }, { scope: "project" })).rejects.toThrow(
				'scope "project" requires cwd',
			);
			expect(writes).toEqual([]);
		});

		it("lists both layers with their origin and flags .mcp.json entries as read-only", async () => {
			const { service } = createLayeredService({
				global: { g: { command: "g" } },
				project: { p: { command: "p" } },
				compat: { c: { command: "c" }, p: { command: "compat-shadowed" } },
			});

			await expect(service.list({ cwd: PROJECT })).resolves.toEqual([
				{ name: "g", type: "stdio", disabled: false, command: "g", scope: "global" },
				{ name: "p", type: "stdio", disabled: false, command: "p", scope: "project" },
				{ name: "c", type: "stdio", disabled: false, command: "c", scope: "project", readOnly: true },
			]);
			await expect(service.list()).resolves.toEqual([{ name: "g", type: "stdio", disabled: false, command: "g" }]);
		});

		it("finds a server in whichever layer defines it when only a project root is given", async () => {
			const { service, files } = createLayeredService({
				global: { g: { command: "g" } },
				project: { p: { command: "p" } },
			});

			await service.setEnabled("p", false, { cwd: PROJECT });
			await service.remove("g", { cwd: PROJECT });

			expect(files.project.mcpServers.p).toMatchObject({ disabled: true });
			expect(files.global.mcpServers).toEqual({});
		});

		it("asks the caller to choose when a name exists in both layers", async () => {
			const { service, files } = createLayeredService({
				global: { dup: { command: "global" } },
				project: { dup: { command: "project" } },
			});

			await expect(service.remove("dup", { cwd: PROJECT })).rejects.toThrow("exists in both global and project");
			expect(Object.keys(files.global.mcpServers)).toEqual(["dup"]);
			expect(Object.keys(files.project.mcpServers)).toEqual(["dup"]);

			await service.remove("dup", { scope: "project", cwd: PROJECT });
			expect(files.project.mcpServers).toEqual({});
			expect(Object.keys(files.global.mcpServers)).toEqual(["dup"]);
		});

		it("reads but never modifies servers that only exist in .mcp.json", async () => {
			const { service, writes } = createLayeredService({ compat: { shared: { command: "compat" } } });

			await expect(service.get("shared", { cwd: PROJECT })).resolves.toMatchObject({
				name: "shared",
				scope: "project",
				readOnly: true,
			});
			await expect(service.remove("shared", { cwd: PROJECT })).rejects.toThrow(".mcp.json");
			await expect(service.setEnabled("shared", false, { scope: "project", cwd: PROJECT })).rejects.toThrow(
				".mcp.json",
			);
			expect(writes).toEqual([]);
		});

		it("reports a missing server instead of searching beyond the requested layer", async () => {
			const { service } = createLayeredService({ global: { g: { command: "g" } } });

			await expect(service.get("g", { scope: "project", cwd: PROJECT })).rejects.toThrow("MCP server not found: g");
		});
	});

	describe("sse servers", () => {
		function createService(initial: McpConfigData["mcpServers"] = {}) {
			let config: McpConfigData = { mcpServers: initial };
			const service = new McpSettingsService({
				readConfig: async () => config,
				writeConfig: async (next) => {
					config = next;
				},
			});
			return { service, read: () => config };
		}

		it("stores an sse install as type sse and reports it as an sse server with redacted headers", async () => {
			const { service, read } = createService();

			const detail = await service.upsert("legacy", {
				type: "sse",
				url: "https://legacy.example.com/sse",
				headers: { Authorization: "Bearer secret" },
			});

			expect(read().mcpServers.legacy).toEqual({
				type: "sse",
				url: "https://legacy.example.com/sse",
				headers: { Authorization: "Bearer secret" },
			});
			expect(detail).toEqual({
				name: "legacy",
				type: "sse",
				url: "https://legacy.example.com/sse",
				headers: { Authorization: "***" },
				disabled: false,
			});
			await expect(service.list()).resolves.toEqual([
				{ name: "legacy", type: "sse", disabled: false, url: "https://legacy.example.com/sse" },
			]);
		});

		it("keeps an sse server's url when only its headers are updated", async () => {
			const { service, read } = createService({ legacy: { type: "sse", url: "https://legacy.example.com/sse" } });

			await service.upsert("legacy", { type: "sse", headers: { "X-Region": "us" } });

			expect(read().mcpServers.legacy).toEqual({
				type: "sse",
				url: "https://legacy.example.com/sse",
				headers: { "X-Region": "us" },
			});
		});

		it("does not carry http-only managed runtime fields over when a server is switched to sse", async () => {
			const { service, read } = createService({
				web: { type: "http", url: "https://web.example.com/mcp", managedRuntimeId: "runtime", oauthClientId: "id" },
			});

			await service.upsert("web", { type: "sse", url: "https://web.example.com/sse" });

			expect(read().mcpServers.web).toEqual({ type: "sse", url: "https://web.example.com/sse" });
		});

		it("requires a url for a new sse server", async () => {
			const { service } = createService();

			await expect(service.upsert("legacy", { type: "sse" })).rejects.toThrow("SSE MCP server requires url.");
		});
	});
});
