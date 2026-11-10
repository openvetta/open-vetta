import {
	DOMAIN_MCP_CAPABILITIES,
	type McpServerDetail,
	type McpServerSummary,
	type McpTarget,
} from "@vetta-org/capability-sdk";
import type { PluginCapabilitySessionAccess } from "../types.js";

export const pluginMcpMethods = {
	listMcpServers(
		this: PluginCapabilitySessionAccess,
		sessionId: string,
		target: McpTarget = {},
	): Promise<McpServerSummary[]> {
		const input = DOMAIN_MCP_CAPABILITIES.LIST_SERVERS.parseInput(target);
		return this.client(sessionId, { official: true }).invoke(DOMAIN_MCP_CAPABILITIES.LIST_SERVERS, input);
	},

	getMcpServer(
		this: PluginCapabilitySessionAccess,
		sessionId: string,
		name: string,
		target: McpTarget = {},
	): Promise<McpServerDetail> {
		const input = DOMAIN_MCP_CAPABILITIES.GET_SERVER.parseInput({ name, ...target });
		return this.client(sessionId, { official: true }).invoke(DOMAIN_MCP_CAPABILITIES.GET_SERVER, input);
	},

	upsertMcpServer(
		this: PluginCapabilitySessionAccess,
		sessionId: string,
		name: string,
		data: unknown,
		target: McpTarget = {},
	): Promise<McpServerDetail> {
		const input = DOMAIN_MCP_CAPABILITIES.UPSERT_SERVER.parseInput({ name, data, ...target });
		return this.client(sessionId, { official: true }).invoke(DOMAIN_MCP_CAPABILITIES.UPSERT_SERVER, input);
	},

	setMcpServerEnabled(
		this: PluginCapabilitySessionAccess,
		sessionId: string,
		name: string,
		enabled: boolean,
		target: McpTarget = {},
	): Promise<undefined> {
		const input = DOMAIN_MCP_CAPABILITIES.SET_SERVER_ENABLED.parseInput({ name, enabled, ...target });
		return this.client(sessionId, { official: true }).invoke(DOMAIN_MCP_CAPABILITIES.SET_SERVER_ENABLED, input);
	},

	removeMcpServer(
		this: PluginCapabilitySessionAccess,
		sessionId: string,
		name: string,
		target: McpTarget = {},
	): Promise<undefined> {
		const input = DOMAIN_MCP_CAPABILITIES.REMOVE_SERVER.parseInput({ name, ...target });
		return this.client(sessionId, { official: true }).invoke(DOMAIN_MCP_CAPABILITIES.REMOVE_SERVER, input);
	},
};

export type PluginMcpMethods = typeof pluginMcpMethods;
