import type {
	McpConfigData,
	McpHttpServerConfigData,
	McpServerConfigData,
	McpStdioServerConfigData,
} from "@preload/api.js";
import type { MarketMcpServer } from "@shared/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type BuiltinMcpPreset,
	buildBuiltinMcpServerConfig,
	existingSecretValues,
	isBuiltinMcpServer,
	matchBuiltinMcpPreset,
	presetRequiresSecrets,
	presetUsesBrowserAuth,
	presetUsesOAuth,
	serverUsesOAuth,
} from "../mcp/builtin-mcp-presets";
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
	busyPresetName: string | null;
	onStartAddServer: () => void;
	onCancelAddServer: () => void;
	onAddServer: () => Promise<void>;
	onToggleEditServer: (name: string) => void;
	onCancelEditServer: () => void;
	onUpdateServer: (oldName: string) => Promise<void>;
	onDeleteServer: (name: string) => Promise<void>;
	onToggleDisabled: (name: string) => Promise<void>;
	/** 需要填写密钥时弹出的预设；null 表示对话框关闭 */
	secretsDialogPreset: BuiltinMcpPreset | null;
	/** 配置密钥时的已有 env（编辑已添加项） */
	secretsDialogInitial: Record<string, string> | undefined;
	secretsDialogMode: "add" | "configure";
	/** 连接引导 Dialog 内的错误（如 OAuth 失败） */
	secretsDialogError: string | null;
	onAddBuiltinServer: (preset: BuiltinMcpPreset) => Promise<void>;
	onConfigureBuiltinSecrets: (name: string) => void;
	onCloseSecretsDialog: () => void;
	onConfirmSecretsDialog: (values: Record<string, string>) => Promise<void>;
	/** serverName → 是否已有 OAuth token */
	oauthAuthByName: Record<string, boolean>;
	/** 正在进行 OAuth 的 server name */
	oauthBusyName: string | null;
	/** 连接引导 Dialog 是否处于「浏览器授权中」 */
	secretsDialogAuthorizing: boolean;
	/** 对 type:http 远程 MCP 发起浏览器授权 */
	onAuthorizeOAuth: (name: string) => Promise<void>;
	/** 清除 OAuth 凭证 */
	onRevokeOAuth: (name: string) => Promise<void>;
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
	const [addingServer, setAddingServer] = useState(false);
	const [editingServer, setEditingServer] = useState<string | null>(null);
	const [serverForm, setServerForm] = useState<McpServerFormState>({ ...emptyMcpServer });
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [busyPresetName, setBusyPresetName] = useState<string | null>(null);
	const [secretsDialogPreset, setSecretsDialogPreset] = useState<BuiltinMcpPreset | null>(null);
	const [secretsDialogInitial, setSecretsDialogInitial] = useState<Record<string, string> | undefined>();
	const [secretsDialogMode, setSecretsDialogMode] = useState<"add" | "configure">("add");
	const [secretsDialogTargetName, setSecretsDialogTargetName] = useState<string | null>(null);
	const [secretsDialogError, setSecretsDialogError] = useState<string | null>(null);
	const [secretsDialogAuthorizing, setSecretsDialogAuthorizing] = useState(false);
	const [oauthAuthByName, setOauthAuthByName] = useState<Record<string, boolean>>({});
	const [oauthBusyName, setOauthBusyName] = useState<string | null>(null);

	const refreshOAuthStatus = useCallback(async (cfg: McpConfigData | null) => {
		if (!cfg) {
			setOauthAuthByName({});
			return;
		}
		const oauthNames = Object.entries(cfg.mcpServers)
			.filter(([name, server]) => serverUsesOAuth(name, server))
			.map(([name]) => name);
		if (oauthNames.length === 0) {
			setOauthAuthByName({});
			return;
		}
		const status = await window.vetta.mcp.authStatus(oauthNames);
		setOauthAuthByName(status);
	}, []);

	useEffect(() => {
		void window.vetta.mcp.get().then((loadedConfig) => {
			setConfig(loadedConfig);
			setJsonText(JSON.stringify(loadedConfig, null, 2));
			void refreshOAuthStatus(loadedConfig);
		});
	}, [refreshOAuthStatus]);

	const saveConfig = useCallback(
		async (newConfig: McpConfigData) => {
			setSaving(true);
			try {
				await window.vetta.mcp.set(newConfig);
				setConfig(newConfig);
				setJsonText(JSON.stringify(newConfig, null, 2));
				void refreshOAuthStatus(newConfig);
			} finally {
				setSaving(false);
			}
		},
		[refreshOAuthStatus],
	);

	const closeEditor = useCallback(() => {
		setEditingServer(null);
		setServerForm({ ...emptyMcpServer });
	}, []);

	const closeSecretsDialog = useCallback(() => {
		// 授权进行中不允许关掉，避免中途丢状态
		if (secretsDialogAuthorizing) return;
		setSecretsDialogPreset(null);
		setSecretsDialogInitial(undefined);
		setSecretsDialogTargetName(null);
		setSecretsDialogMode("add");
		setSecretsDialogError(null);
		setSecretsDialogAuthorizing(false);
	}, [secretsDialogAuthorizing]);

	const writeBuiltinPreset = useCallback(
		async (preset: BuiltinMcpPreset, secretValues?: Record<string, string>) => {
			if (!config) return;
			const targetName =
				secretsDialogMode === "configure" && secretsDialogTargetName ? secretsDialogTargetName : preset.name;
			const next = buildBuiltinMcpServerConfig(
				preset,
				{
					displayName: t(preset.displayNameKey),
					description: t(preset.descriptionKey),
				},
				secretValues,
			);
			const existing = config.mcpServers[targetName];
			const merged =
				secretsDialogMode === "configure" && existing
					? {
							...next,
							disabled: existing.disabled,
							autoApprove: existing.autoApprove,
							startupTimeout: existing.startupTimeout,
							debug: existing.debug,
						}
					: next;
			const nextConfig = {
				...config,
				mcpServers: {
					...config.mcpServers,
					[targetName]: merged,
				},
			};

			// OAuth 首次添加：先浏览器授权成功，再写入 mcp.json，避免列表提前显示「已添加」
			if (presetUsesOAuth(preset) && secretsDialogMode === "add" && next.type === "http") {
				setBusyPresetName(preset.name);
				setSecretsDialogError(null);
				setSecretsDialogAuthorizing(true);
				setOauthBusyName(targetName);
				try {
					await window.vetta.mcp.login(targetName, {
						url: next.url,
						oauthClientId: next.oauthClientId,
						oauthDeviceFlow: next.oauthDeviceFlow,
						oauthScopes: next.oauthScopes,
					});
					await saveConfig(nextConfig);
					recordSettingsUsage({
						tab: "mcp",
						action: "added",
						target: "builtin-server",
						value: preset.id,
					});
					recordSettingsUsage({
						tab: "mcp",
						action: "updated",
						target: "oauth-login",
						value: preset.id,
					});
					setSecretsDialogAuthorizing(false);
					setSecretsDialogError(null);
					setSecretsDialogPreset(null);
					setSecretsDialogInitial(undefined);
					setSecretsDialogTargetName(null);
					setSecretsDialogMode("add");
				} catch (error) {
					console.error("[mcp] OAuth login failed:", error);
					setSecretsDialogError(
						error instanceof Error && error.message.trim() ? error.message : t("mcpPresets.authFailed"),
					);
				} finally {
					setSecretsDialogAuthorizing(false);
					setOauthBusyName(null);
					setBusyPresetName(null);
				}
				return;
			}

			setBusyPresetName(preset.name);
			try {
				await saveConfig(nextConfig);
				recordSettingsUsage({
					tab: "mcp",
					action: secretsDialogMode === "configure" ? "updated" : "added",
					target: "builtin-server",
					value: preset.id,
				});
				closeSecretsDialog();
			} finally {
				setBusyPresetName(null);
			}
		},
		[closeSecretsDialog, config, saveConfig, secretsDialogMode, secretsDialogTargetName, t],
	);

	const authorizeOAuth = useCallback(
		async (name: string) => {
			setOauthBusyName(name);
			try {
				await window.vetta.mcp.login(name);
				if (config) await refreshOAuthStatus(config);
				recordSettingsUsage({ tab: "mcp", action: "updated", target: "oauth-login", value: name });
			} finally {
				setOauthBusyName(null);
			}
		},
		[config, refreshOAuthStatus],
	);

	const revokeOAuth = useCallback(
		async (name: string) => {
			setOauthBusyName(name);
			try {
				await window.vetta.mcp.logout(name);
				if (config) await refreshOAuthStatus(config);
				recordSettingsUsage({ tab: "mcp", action: "updated", target: "oauth-logout", value: name });
			} finally {
				setOauthBusyName(null);
			}
		},
		[config, refreshOAuthStatus],
	);

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
		recordSettingsUsage({ tab: "mcp", action: "added", target: "server", value: serverForm.transport });
	}, [config, saveConfig, serverForm]);

	const handleUpdateServer = useCallback(
		async (oldName: string) => {
			if (!config || !isMcpFormValid(serverForm)) return;
			const existing = config.mcpServers[oldName];
			if (existing && isBuiltinMcpServer(oldName, existing)) return;
			const newServers = { ...config.mcpServers };
			const name = serverForm.name.trim();
			if (oldName !== name) {
				delete newServers[oldName];
			}
			newServers[name] = formToServer(serverForm);
			await saveConfig({ ...config, mcpServers: newServers });
			closeEditor();
			recordSettingsUsage({ tab: "mcp", action: "updated", target: "server", value: serverForm.transport });
		},
		[closeEditor, config, saveConfig, serverForm],
	);

	const addBuiltinServer = useCallback(
		async (preset: BuiltinMcpPreset) => {
			if (!config) return;
			// 必填密钥 / 浏览器授权说明：都先弹引导，避免用户不知道下一步
			if (presetRequiresSecrets(preset) || presetUsesBrowserAuth(preset)) {
				setSecretsDialogMode("add");
				setSecretsDialogTargetName(preset.name);
				setSecretsDialogInitial(undefined);
				setSecretsDialogError(null);
				setSecretsDialogAuthorizing(false);
				setSecretsDialogPreset(preset);
				return;
			}
			await writeBuiltinPreset(preset);
		},
		[config, writeBuiltinPreset],
	);

	const configureBuiltinSecrets = useCallback(
		(name: string) => {
			if (!config) return;
			const server = config.mcpServers[name];
			if (!server) return;
			const preset = matchBuiltinMcpPreset(name, server);
			if (!preset?.secrets?.length) return;
			setSecretsDialogMode("configure");
			setSecretsDialogTargetName(name);
			setSecretsDialogInitial(existingSecretValues(preset, server));
			setSecretsDialogPreset(preset);
		},
		[config],
	);

	const confirmSecretsDialog = useCallback(
		async (values: Record<string, string>) => {
			if (!secretsDialogPreset) return;
			await writeBuiltinPreset(secretsDialogPreset, values);
		},
		[secretsDialogPreset, writeBuiltinPreset],
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
			// 删除配置时一并清掉 OAuth 凭证，避免残留 token
			if (serverUsesOAuth(name, config.mcpServers[name]!)) {
				try {
					await window.vetta.mcp.logout(name);
				} catch {
					// best-effort
				}
			}
			await saveConfig({ ...config, mcpServers: newServers });
			if (editingServer === name) {
				setEditingServer(null);
				setServerForm({ ...emptyMcpServer });
			}
			recordSettingsUsage({ tab: "mcp", action: "deleted", target: "server" });
		},
		[config, editingServer, saveConfig],
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

	const toggleEditServer = useCallback(
		(name: string) => {
			if (!config) return;
			const server = config.mcpServers[name];
			if (!server) return;
			if (isBuiltinMcpServer(name, server)) return;
			// 再次点击同一项 = 关闭侧边编辑 Sheet
			if (editingServer === name) {
				closeEditor();
				return;
			}
			setServerForm(serverToForm(name, server));
			setEditingServer(name);
			setAddingServer(false);
		},
		[closeEditor, config, editingServer],
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
		addingServer,
		editingServer,
		serverForm,
		jsonText,
		jsonError,
		busyPresetName,
		secretsDialogPreset,
		secretsDialogInitial,
		secretsDialogMode,
		secretsDialogError,
		secretsDialogAuthorizing,
		setServerForm,
		setJsonText,
		clearJsonError: () => setJsonError(null),
		saveConfig,
		onModeSwitch: handleModeSwitch,
		onStartAddServer: () => {
			setAddingServer(true);
			closeEditor();
			setServerForm({ ...emptyMcpServer });
		},
		onCancelAddServer: () => {
			setAddingServer(false);
			setServerForm({ ...emptyMcpServer });
		},
		onAddServer: handleAddServer,
		onToggleEditServer: toggleEditServer,
		onCancelEditServer: closeEditor,
		onUpdateServer: handleUpdateServer,
		onDeleteServer: removeServer,
		onToggleDisabled: handleToggleDisabled,
		onAddBuiltinServer: addBuiltinServer,
		onConfigureBuiltinSecrets: configureBuiltinSecrets,
		onCloseSecretsDialog: closeSecretsDialog,
		onConfirmSecretsDialog: confirmSecretsDialog,
		oauthAuthByName,
		oauthBusyName,
		onAuthorizeOAuth: authorizeOAuth,
		onRevokeOAuth: revokeOAuth,
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
	if (server.display_name) merged.displayName = server.display_name;
	if (server.description) merged.description = server.description;
	// 市场侧 icon 已解析为绝对 URL，写入本地供「我的」展示
	if (server.icon?.trim()) merged.icon = server.icon.trim();
	return merged as unknown as McpServerConfigData;
}
