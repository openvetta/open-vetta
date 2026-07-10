import type {
	McpConfigData,
	McpHttpServerConfigData,
	McpServerConfigData,
	McpStdioServerConfigData,
} from "@preload/api.js";
import type { MarketMcpServer } from "@shared/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { recordSettingsUsage } from "./recordSettingsUsage";

export type McpEditMode = "visual" | "json";
export type McpTransportType = "stdio" | "http";

export interface McpServerFormState {
	name: string;
	transport: McpTransportType;
	command: string;
	args: string;
	env: string;
	cwd: string;
	url: string;
	headers: string;
	disabled: boolean;
	autoApprove: string;
	startupTimeout: string;
	debug: boolean;
}

export interface McpSettingsModel {
	config: McpConfigData | null;
	mode: McpEditMode;
	saving: boolean;
	serverNames: string[];
	addedServerNames: Set<string>;
	expandedServer: string | null;
	addingServer: boolean;
	editingServer: string | null;
	serverForm: McpServerFormState;
	jsonText: string;
	jsonError: string | null;
	setServerForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
	setJsonText: (value: string) => void;
	clearJsonError: () => void;
	saveConfig: (newConfig: McpConfigData) => Promise<void>;
	onModeSwitch: (mode: McpEditMode) => void;
	onToggleServer: (name: string) => void;
	onStartAddServer: () => void;
	onCancelAddServer: () => void;
	onAddServer: () => Promise<void>;
	onStartEditServer: (name: string) => void;
	onCancelEditServer: () => void;
	onUpdateServer: (oldName: string) => Promise<void>;
	onDeleteServer: (name: string) => Promise<void>;
	onToggleDisabled: (name: string) => Promise<void>;
	onAddRemoteServer: (server: MarketMcpServer) => Promise<void>;
	onRemoveRemoteServer: (name: string) => Promise<void>;
	onJsonSave: () => Promise<void>;
}

export const emptyMcpServer: McpServerFormState = {
	name: "",
	transport: "stdio",
	command: "",
	args: "",
	env: "",
	cwd: "",
	url: "",
	headers: "",
	disabled: false,
	autoApprove: "",
	startupTimeout: "",
	debug: false,
};

export function isHttpMcpServerConfigData(config: McpServerConfigData): config is McpHttpServerConfigData {
	return config.type === "http";
}

export function useMcpSettingsModel(): McpSettingsModel {
	const { t } = useTranslation("settings");
	const [config, setConfig] = useState<McpConfigData | null>(null);
	const [mode, setMode] = useState<McpEditMode>("visual");
	const [saving, setSaving] = useState(false);
	const [expandedServer, setExpandedServer] = useState<string | null>(null);
	const [addingServer, setAddingServer] = useState(false);
	const [editingServer, setEditingServer] = useState<string | null>(null);
	const [serverForm, setServerForm] = useState<McpServerFormState>({ ...emptyMcpServer });
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);

	useEffect(() => {
		void window.vetta.mcp.get().then((loadedConfig) => {
			setConfig(loadedConfig);
			setJsonText(JSON.stringify(loadedConfig, null, 2));
		});
	}, []);

	const saveConfig = useCallback(async (newConfig: McpConfigData) => {
		setSaving(true);
		try {
			await window.vetta.mcp.set(newConfig);
			setConfig(newConfig);
			setJsonText(JSON.stringify(newConfig, null, 2));
		} finally {
			setSaving(false);
		}
	}, []);

	const handleAddServer = useCallback(async () => {
		if (!config || !isMcpFormValid(serverForm)) return;
		const name = serverForm.name.trim();
		await saveConfig({
			...config,
			mcpServers: {
				...config.mcpServers,
				[name]: formToServer(serverForm),
			},
		});
		setAddingServer(false);
		setServerForm({ ...emptyMcpServer });
		setExpandedServer(name);
		recordSettingsUsage({ tab: "mcp", action: "added", target: "server", value: serverForm.transport });
	}, [config, saveConfig, serverForm]);

	const handleUpdateServer = useCallback(
		async (oldName: string) => {
			if (!config || !isMcpFormValid(serverForm)) return;
			const newServers = { ...config.mcpServers };
			const name = serverForm.name.trim();
			if (oldName !== name) {
				delete newServers[oldName];
			}
			newServers[name] = formToServer(serverForm);
			await saveConfig({ ...config, mcpServers: newServers });
			setEditingServer(null);
			setServerForm({ ...emptyMcpServer });
			if (oldName !== name) {
				setExpandedServer(name);
			}
			recordSettingsUsage({ tab: "mcp", action: "updated", target: "server", value: serverForm.transport });
		},
		[config, saveConfig, serverForm],
	);

	const addRemoteServer = useCallback(
		async (server: MarketMcpServer) => {
			if (!config) return;
			const newServers = { ...config.mcpServers, [server.name]: marketToServer(server) };
			await saveConfig({ ...config, mcpServers: newServers });
			recordSettingsUsage({ tab: "mcp", action: "added", target: "market-server" });
		},
		[config, saveConfig],
	);

	const removeServer = useCallback(
		async (name: string) => {
			if (!config) return;
			const newServers = { ...config.mcpServers };
			delete newServers[name];
			await saveConfig({ ...config, mcpServers: newServers });
			if (expandedServer === name) setExpandedServer(null);
			recordSettingsUsage({ tab: "mcp", action: "deleted", target: "server" });
		},
		[config, expandedServer, saveConfig],
	);

	const handleToggleDisabled = useCallback(
		async (name: string) => {
			if (!config) return;
			const server = config.mcpServers[name];
			if (!server) return;
			await saveConfig({
				...config,
				mcpServers: {
					...config.mcpServers,
					[name]: { ...server, disabled: !server.disabled },
				},
			});
			recordSettingsUsage({ tab: "mcp", action: server.disabled ? "enabled" : "disabled", target: "server" });
		},
		[config, saveConfig],
	);

	const startEditServer = useCallback(
		(name: string) => {
			if (!config) return;
			const server = config.mcpServers[name];
			if (!server) return;
			setServerForm(serverToForm(name, server));
			setEditingServer(name);
			setAddingServer(false);
		},
		[config],
	);

	const handleJsonSave = useCallback(async () => {
		try {
			const parsed = JSON.parse(jsonText) as McpConfigData;
			if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
				setJsonError(t("jsonMustHaveMcpServers"));
				return;
			}
			for (const [name, server] of Object.entries(parsed.mcpServers)) {
				const type = (server as { type?: string }).type ?? "stdio";
				if (type !== "stdio" && type !== "http") {
					setJsonError(t("jsonTypeMustBeStdioOrHttp", { name }));
					return;
				}
				if (type === "http") {
					const httpServer = server as { url?: unknown };
					if (!httpServer.url || typeof httpServer.url !== "string") {
						setJsonError(t("jsonMissingUrl", { name }));
						return;
					}
				} else {
					const stdioServer = server as { command?: unknown };
					if (!stdioServer.command || typeof stdioServer.command !== "string") {
						setJsonError(t("jsonMissingCommand", { name }));
						return;
					}
				}
			}
			setJsonError(null);
			await saveConfig(parsed);
			recordSettingsUsage({ tab: "mcp", action: "saved", target: "json-config" });
		} catch (e) {
			setJsonError(t("jsonParseError", { msg: (e as Error).message }));
		}
	}, [jsonText, saveConfig, t]);

	const handleModeSwitch = useCallback(
		(newMode: McpEditMode) => {
			if (newMode === "json" && config) {
				setJsonText(JSON.stringify(config, null, 2));
				setJsonError(null);
			}
			setMode(newMode);
			setAddingServer(false);
			setEditingServer(null);
			setServerForm({ ...emptyMcpServer });
			recordSettingsUsage({ tab: "mcp", action: "changed", target: "edit-mode", value: newMode });
		},
		[config],
	);

	const serverNames = useMemo(() => (config ? Object.keys(config.mcpServers) : []), [config]);

	return {
		config,
		mode,
		saving,
		serverNames,
		addedServerNames: new Set(serverNames),
		expandedServer,
		addingServer,
		editingServer,
		serverForm,
		jsonText,
		jsonError,
		setServerForm,
		setJsonText,
		clearJsonError: () => setJsonError(null),
		saveConfig,
		onModeSwitch: handleModeSwitch,
		onToggleServer: (name: string) => setExpandedServer(expandedServer === name ? null : name),
		onStartAddServer: () => {
			setAddingServer(true);
			setEditingServer(null);
			setServerForm({ ...emptyMcpServer });
		},
		onCancelAddServer: () => {
			setAddingServer(false);
			setServerForm({ ...emptyMcpServer });
		},
		onAddServer: handleAddServer,
		onStartEditServer: startEditServer,
		onCancelEditServer: () => {
			setEditingServer(null);
			setServerForm({ ...emptyMcpServer });
		},
		onUpdateServer: handleUpdateServer,
		onDeleteServer: removeServer,
		onToggleDisabled: handleToggleDisabled,
		onAddRemoteServer: addRemoteServer,
		onRemoveRemoteServer: removeServer,
		onJsonSave: handleJsonSave,
	};
}

export function isMcpFormValid(form: McpServerFormState): boolean {
	if (!form.name.trim()) return false;
	if (form.transport === "http") return Boolean(form.url.trim());
	return Boolean(form.command.trim());
}

function kvLinesToObject(text: string): Record<string, string> | undefined {
	const lines = text.trim()
		? text
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
		: [];
	if (lines.length === 0) return undefined;
	return Object.fromEntries(
		lines.map((line) => {
			const idx = line.indexOf("=");
			return idx > 0 ? [line.slice(0, idx), line.slice(idx + 1)] : [line, ""];
		}),
	);
}

function objectToKvLines(obj: Record<string, string> | undefined): string {
	if (!obj) return "";
	return Object.entries(obj)
		.map(([key, value]) => `${key}=${value}`)
		.join("\n");
}

function serverToForm(name: string, server: McpServerConfigData): McpServerFormState {
	const common = {
		name,
		disabled: server.disabled ?? false,
		autoApprove: server.autoApprove?.join(", ") ?? "",
		startupTimeout: server.startupTimeout != null ? String(server.startupTimeout) : "",
		debug: server.debug ?? false,
	};
	if (isHttpMcpServerConfigData(server)) {
		return {
			...emptyMcpServer,
			...common,
			transport: "http",
			url: server.url,
			headers: objectToKvLines(server.headers),
		};
	}
	return {
		...emptyMcpServer,
		...common,
		transport: "stdio",
		command: server.command,
		args: server.args?.join(", ") ?? "",
		env: objectToKvLines(server.env),
		cwd: server.cwd ?? "",
	};
}

function formToServer(form: McpServerFormState): McpServerConfigData {
	const autoApprove = form.autoApprove.trim()
		? form.autoApprove
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean)
		: undefined;
	const startupTimeout = form.startupTimeout.trim() ? Number(form.startupTimeout.trim()) : undefined;

	if (form.transport === "http") {
		const config: McpHttpServerConfigData = { type: "http", url: form.url.trim() };
		const headers = kvLinesToObject(form.headers);
		if (headers) config.headers = headers;
		if (form.disabled) config.disabled = true;
		if (autoApprove && autoApprove.length > 0) config.autoApprove = autoApprove;
		if (startupTimeout && !Number.isNaN(startupTimeout)) config.startupTimeout = startupTimeout;
		if (form.debug) config.debug = true;
		return config;
	}

	const args = form.args.trim()
		? form.args
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean)
		: undefined;
	const env = kvLinesToObject(form.env);

	const config: McpStdioServerConfigData = { command: form.command.trim() };
	if (args && args.length > 0) config.args = args;
	if (env) config.env = env;
	if (form.cwd.trim()) config.cwd = form.cwd.trim();
	if (form.disabled) config.disabled = true;
	if (autoApprove && autoApprove.length > 0) config.autoApprove = autoApprove;
	if (startupTimeout && !Number.isNaN(startupTimeout)) config.startupTimeout = startupTimeout;
	if (form.debug) config.debug = true;
	return config;
}

function marketToServer(server: MarketMcpServer): McpServerConfigData {
	const base = (server.config ?? {}) as Record<string, unknown>;
	const merged: Record<string, unknown> = { ...base };
	if (server.display_name && !merged.displayName) merged.displayName = server.display_name;
	if (server.description && !merged.description) merged.description = server.description;
	return merged as unknown as McpServerConfigData;
}
