import type { PluginOfficialApi, PluginOfficialMcpServerDetail } from "@vetta-org/plugin-sdk";

function redactRecordSecrets(
	record: Record<string, string> | undefined,
	secretKeys: readonly string[] = ["authorization", "api-key", "apikey", "x-api-key", "token", "secret", "password"],
): Record<string, string> | undefined {
	if (!record) return undefined;
	const next: Record<string, string> = {};
	for (const [key, value] of Object.entries(record)) {
		const lower = key.toLowerCase();
		next[key] = secretKeys.some((secretKey) => lower.includes(secretKey)) ? "***" : value;
	}
	return next;
}

function redactMcpServer(name: string, server: Record<string, unknown>): PluginOfficialMcpServerDetail {
	const type = server.type === "http" ? "http" : "stdio";
	if (type === "http") {
		return {
			name,
			type,
			url: typeof server.url === "string" ? server.url : undefined,
			headers: redactRecordSecrets(
				server.headers && typeof server.headers === "object" && !Array.isArray(server.headers)
					? (server.headers as Record<string, string>)
					: undefined,
			),
			disabled: Boolean(server.disabled),
			autoApprove: Array.isArray(server.autoApprove) ? (server.autoApprove as string[]) : undefined,
			startupTimeout: typeof server.startupTimeout === "number" ? server.startupTimeout : undefined,
			debug: typeof server.debug === "boolean" ? server.debug : undefined,
		};
	}
	return {
		name,
		type,
		command: typeof server.command === "string" ? server.command : undefined,
		args: Array.isArray(server.args) ? (server.args as string[]) : undefined,
		env: redactRecordSecrets(
			server.env && typeof server.env === "object" && !Array.isArray(server.env)
				? (server.env as Record<string, string>)
				: undefined,
			["token", "key", "secret", "password", "authorization"],
		),
		cwd: typeof server.cwd === "string" ? server.cwd : undefined,
		disabled: Boolean(server.disabled),
		autoApprove: Array.isArray(server.autoApprove) ? (server.autoApprove as string[]) : undefined,
		startupTimeout: typeof server.startupTimeout === "number" ? server.startupTimeout : undefined,
		debug: typeof server.debug === "boolean" ? server.debug : undefined,
	};
}

export function createOfficialMcpApi(assertOfficial: () => void): PluginOfficialApi["mcp"] {
	return {
		list: async () => {
			assertOfficial();
			const config = await window.vetta.mcp.get();
			return Object.entries(config.mcpServers).map(([name, server]) => ({
				name,
				type: server.type === "http" ? ("http" as const) : ("stdio" as const),
				disabled: Boolean(server.disabled),
				command: server.type === "http" ? undefined : server.command,
				url: server.type === "http" ? server.url : undefined,
			}));
		},
		get: async (name) => {
			assertOfficial();
			const server = (await window.vetta.mcp.get()).mcpServers[name];
			if (!server) throw new Error(`MCP server not found: ${name}`);
			return redactMcpServer(name, server as unknown as Record<string, unknown>);
		},
		listNames: async () => {
			assertOfficial();
			return Object.keys((await window.vetta.mcp.get()).mcpServers);
		},
		upsert: async (name, data) => {
			assertOfficial();
			const config = await window.vetta.mcp.get();
			const existing = config.mcpServers[name] as unknown as Record<string, unknown> | undefined;
			let next: Record<string, unknown>;
			if (data.type === "http") {
				const previous = existing?.type === "http" ? existing : {};
				next = {
					...previous,
					...data,
					type: "http",
					url: data.url ?? (existing?.type === "http" ? existing.url : undefined),
				};
				if (!next.url) throw new Error("HTTP MCP server requires url.");
			} else {
				const previous = existing && existing.type !== "http" ? existing : {};
				next = {
					...previous,
					...data,
					type: data.type,
					command: data.command ?? (typeof previous.command === "string" ? previous.command : undefined),
				};
				if (!next.command) throw new Error("stdio MCP server requires command.");
			}
			config.mcpServers[name] = next as unknown as (typeof config.mcpServers)[string];
			await window.vetta.mcp.set(config);
			return redactMcpServer(name, next);
		},
		setEnabled: async (name, enabled) => {
			assertOfficial();
			const config = await window.vetta.mcp.get();
			const existing = config.mcpServers[name];
			if (!existing) throw new Error(`MCP server not found: ${name}`);
			existing.disabled = !enabled;
			config.mcpServers[name] = existing;
			await window.vetta.mcp.set(config);
		},
		remove: async (name) => {
			assertOfficial();
			const config = await window.vetta.mcp.get();
			if (!config.mcpServers[name]) throw new Error(`MCP server not found: ${name}`);
			delete config.mcpServers[name];
			await window.vetta.mcp.set(config);
		},
	};
}
