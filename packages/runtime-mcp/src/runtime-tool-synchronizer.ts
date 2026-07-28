import { ALL_SCENARIOS, type CodingAgentTool } from "@vetta/coding-agent";
import type { McpManager } from "@vetta/coding-agent/core/mcp/index.js";
import {
	adaptCodingAgentToolRegistration,
	type CodingAgentRuntimeToolRegistration,
} from "@vetta/coding-agent/runtime-host/greenfield";

export interface McpRuntimeToolRegistry {
	register(registration: CodingAgentRuntimeToolRegistration): void;
	unregister(toolName: string): boolean;
}

export type McpRuntimeToolSource = Pick<McpManager, "getServers" | "getTools" | "reloadIfChanged">;

export interface McpRuntimeToolDescriptor {
	readonly name: string;
	readonly description: string;
}

export interface McpRuntimeToolSnapshot {
	readonly revision: number;
	readonly tools: readonly McpRuntimeToolDescriptor[];
}

/**
 * 在每次模型调用前把 MCP Manager 的当前工具集合增量同步到 Runtime registry。
 *
 * 未变化的 server/tool 保留原 binding；重连、配置变化、禁用和删除只替换受影响工具。
 */
export class McpRuntimeToolSynchronizer {
	private readonly fingerprints = new Map<string, string>();
	private currentSnapshot: McpRuntimeToolSnapshot = Object.freeze({
		revision: 0,
		tools: Object.freeze([]),
	});
	private pendingRefresh: Promise<McpRuntimeToolSnapshot> | undefined;

	constructor(
		private readonly source: McpRuntimeToolSource,
		private readonly registry: McpRuntimeToolRegistry,
	) {}

	async refresh(): Promise<McpRuntimeToolSnapshot> {
		if (this.pendingRefresh) return this.pendingRefresh;
		const refresh = this.refreshNow();
		this.pendingRefresh = refresh;
		try {
			return await refresh;
		} finally {
			if (this.pendingRefresh === refresh) this.pendingRefresh = undefined;
		}
	}

	snapshot(): McpRuntimeToolSnapshot {
		return this.currentSnapshot;
	}

	dispose(): void {
		for (const toolName of this.fingerprints.keys()) {
			this.registry.unregister(toolName);
		}
		this.fingerprints.clear();
		this.currentSnapshot = Object.freeze({
			revision: this.currentSnapshot.revision + 1,
			tools: Object.freeze([]),
		});
	}

	private async refreshNow(): Promise<McpRuntimeToolSnapshot> {
		await this.source.reloadIfChanged();
		const sourceFingerprints = buildSourceFingerprints(this.source);
		const registrations = this.source.getTools().map((tool) => {
			const codingTool: CodingAgentTool = {
				...tool,
				scope_use: ALL_SCENARIOS,
				category: "external",
			};
			return adaptCodingAgentToolRegistration(codingTool);
		});
		const nextNames = new Set(registrations.map(({ tool }) => tool.name));

		for (const toolName of this.fingerprints.keys()) {
			if (nextNames.has(toolName)) continue;
			this.registry.unregister(toolName);
			this.fingerprints.delete(toolName);
		}

		for (const registration of registrations) {
			const toolName = registration.tool.name;
			const fingerprint =
				sourceFingerprints.get(toolName) ??
				JSON.stringify({
					name: toolName,
					description: registration.tool.description,
					inputSchema: registration.tool.inputSchema,
				});
			if (this.fingerprints.get(toolName) === fingerprint) continue;
			if (this.fingerprints.has(toolName)) this.registry.unregister(toolName);
			this.registry.register(registration);
			this.fingerprints.set(toolName, fingerprint);
		}

		const descriptors = registrations.map(({ tool }) =>
			Object.freeze({
				name: tool.name,
				description: tool.description,
			}),
		);
		if (!sameDescriptors(this.currentSnapshot.tools, descriptors)) {
			this.currentSnapshot = Object.freeze({
				revision: this.currentSnapshot.revision + 1,
				tools: Object.freeze(descriptors),
			});
		}
		return this.currentSnapshot;
	}
}

export function createMcpRuntimeToolSynchronizer(
	source: McpRuntimeToolSource,
	registry: McpRuntimeToolRegistry,
): McpRuntimeToolSynchronizer {
	return new McpRuntimeToolSynchronizer(source, registry);
}

function buildSourceFingerprints(source: Pick<McpManager, "getServers">): ReadonlyMap<string, string> {
	const fingerprints = new Map<string, string>();
	for (const server of source.getServers()) {
		for (const tool of server.tools) {
			fingerprints.set(
				`mcp_${server.name}_${tool.name}`,
				JSON.stringify({
					server: server.name,
					status: server.status,
					startedAt: server.startedAt?.getTime(),
					tool,
				}),
			);
		}
	}
	return fingerprints;
}

function sameDescriptors(
	current: readonly McpRuntimeToolDescriptor[],
	next: readonly McpRuntimeToolDescriptor[],
): boolean {
	return (
		current.length === next.length &&
		current.every((tool, index) => tool.name === next[index]?.name && tool.description === next[index]?.description)
	);
}
