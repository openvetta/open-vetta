import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import type {
	McpConfigData,
	McpHttpServerConfigData,
	McpServerConfigData,
	McpStdioServerConfigData,
} from "@preload/api.js";
import { fetchMarketMcpServers, type MarketMcpServer } from "@shared/lib/api";
import { authTokenAtom } from "@shared/store/auth-atoms";

function isHttpMcpServerConfigData(c: McpServerConfigData): c is McpHttpServerConfigData {
	return c.type === "http";
}
import { cn } from "@shared/lib/utils";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { Button } from "@shared/components/ui/button";
import { SegmentedControl } from "@shared/components/ui/segmented-control";
import { InputField } from "./ModelsSettings";
import { SettingHeading, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

type McpEditMode = "visual" | "json";
type McpTransportType = "stdio" | "http";

interface McpServerFormState {
	name: string;
	transport: McpTransportType;
	// stdio
	command: string;
	args: string;
	env: string;
	cwd: string;
	// http
	url: string;
	headers: string;
	// common
	disabled: boolean;
	autoApprove: string;
	startupTimeout: string;
	debug: boolean;
}

const emptyMcpServer: McpServerFormState = {
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

function kvLinesToObject(text: string): Record<string, string> | undefined {
	const lines = text.trim() ? text.split("\n").map((l) => l.trim()).filter(Boolean) : [];
	if (lines.length === 0) return undefined;
	return Object.fromEntries(lines.map((l) => {
		const idx = l.indexOf("=");
		return idx > 0 ? [l.slice(0, idx), l.slice(idx + 1)] : [l, ""];
	}));
}

function objectToKvLines(obj: Record<string, string> | undefined): string {
	if (!obj) return "";
	return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join("\n");
}

function serverToForm(name: string, s: McpServerConfigData): McpServerFormState {
	const common = {
		name,
		disabled: s.disabled ?? false,
		autoApprove: s.autoApprove?.join(", ") ?? "",
		startupTimeout: s.startupTimeout != null ? String(s.startupTimeout) : "",
		debug: s.debug ?? false,
	};
	if (isHttpMcpServerConfigData(s)) {
		return {
			...emptyMcpServer,
			...common,
			transport: "http",
			url: s.url,
			headers: objectToKvLines(s.headers),
		};
	}
	return {
		...emptyMcpServer,
		...common,
		transport: "stdio",
		command: s.command,
		args: s.args?.join(", ") ?? "",
		env: objectToKvLines(s.env),
		cwd: s.cwd ?? "",
	};
}

function formToServer(form: McpServerFormState): McpServerConfigData {
	const autoApprove = form.autoApprove.trim()
		? form.autoApprove.split(",").map((s) => s.trim()).filter(Boolean)
		: undefined;
	const startupTimeout = form.startupTimeout.trim() ? Number(form.startupTimeout.trim()) : undefined;

	if (form.transport === "http") {
		const cfg: McpHttpServerConfigData = { type: "http", url: form.url.trim() };
		const headers = kvLinesToObject(form.headers);
		if (headers) cfg.headers = headers;
		if (form.disabled) cfg.disabled = true;
		if (autoApprove && autoApprove.length > 0) cfg.autoApprove = autoApprove;
		if (startupTimeout && !isNaN(startupTimeout)) cfg.startupTimeout = startupTimeout;
		if (form.debug) cfg.debug = true;
		return cfg;
	}

	const args = form.args.trim()
		? form.args.split(",").map((s) => s.trim()).filter(Boolean)
		: undefined;
	const env = kvLinesToObject(form.env);

	const cfg: McpStdioServerConfigData = { command: form.command.trim() };
	if (args && args.length > 0) cfg.args = args;
	if (env) cfg.env = env;
	if (form.cwd.trim()) cfg.cwd = form.cwd.trim();
	if (form.disabled) cfg.disabled = true;
	if (autoApprove && autoApprove.length > 0) cfg.autoApprove = autoApprove;
	if (startupTimeout && !isNaN(startupTimeout)) cfg.startupTimeout = startupTimeout;
	if (form.debug) cfg.debug = true;
	return cfg;
}

function isFormValid(form: McpServerFormState): boolean {
	if (!form.name.trim()) return false;
	if (form.transport === "http") return !!form.url.trim();
	return !!form.command.trim();
}

export function TextareaField({
	value,
	onChange,
	placeholder,
	rows = 3,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	rows?: number;
}): JSX.Element {
	return (
		<textarea
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			rows={rows}
			className="w-full rounded-lg border border-input bg-secondary px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors hover:bg-accent focus:border-ring font-mono resize-none"
		/>
	);
}

export function CheckboxField({
	checked,
	onChange,
	label,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: string;
}): JSX.Element {
	return (
		<label className="flex items-center gap-2 cursor-pointer select-none">
			<button
				type="button"
				onClick={() => onChange(!checked)}
				className={cn(
					"flex h-4 w-4 items-center justify-center rounded border transition-colors",
					checked
						? "border-primary bg-primary"
						: "border-input bg-secondary hover:bg-accent",
				)}
			>
				{checked && (
					<span className="icon-[mdi--check] h-3 w-3 text-primary-foreground" />
				)}
			</button>
			<span className="text-[12px] text-foreground">{label}</span>
		</label>
	);
}

function DetailItem({ label, value }: { label: string; value: string }): JSX.Element {
	return (
		<div>
			<span className="text-muted-foreground">{label}: </span>
			<span className="text-foreground">{value}</span>
		</div>
	);
}

function McpServerForm({
	form,
	setForm,
	onSave,
	onCancel,
	saving,
	saveLabel,
	t,
}: {
	form: McpServerFormState;
	setForm: React.Dispatch<React.SetStateAction<McpServerFormState>>;
	onSave: () => void;
	onCancel: () => void;
	saving: boolean;
	saveLabel: string;
	t: (key: string) => string;
}): JSX.Element {
	return (
		<>
			<div className="mb-3">
				<label className="mb-1 block text-[11px] text-muted-foreground">{t("transportType")}</label>
				<SegmentedControl
					items={[
						{ key: "stdio" as McpTransportType, label: t("stdio") },
						{ key: "http" as McpTransportType, label: "HTTP" },
					]}
					value={form.transport}
					onChange={(t) => setForm((f) => ({ ...f, transport: t }))}
				/>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div className={form.transport === "http" ? "" : "col-span-1"}>
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("serverName")} *</label>
					<InputField
						value={form.name}
						onChange={(v) => setForm((f) => ({ ...f, name: v }))}
						placeholder="e.g. filesystem"
					/>
				</div>
				{form.transport === "stdio" ? (
					<>
						<div>
							<label className="mb-1 block text-[11px] text-muted-foreground">{t("command")} *</label>
							<InputField
								value={form.command}
								onChange={(v) => setForm((f) => ({ ...f, command: v }))}
								placeholder="e.g. npx, node, uvx"
							/>
						</div>
						<div className="col-span-2">
							<label className="mb-1 block text-[11px] text-muted-foreground">{t("arguments")}</label>
							<InputField
								value={form.args}
								onChange={(v) => setForm((f) => ({ ...f, args: v }))}
								placeholder="e.g. -y, @modelcontextprotocol/server-filesystem, /path"
							/>
						</div>
						<div className="col-span-2">
							<label className="mb-1 block text-[11px] text-muted-foreground">{t("envVariables")}</label>
							<TextareaField
								value={form.env}
								onChange={(v) => setForm((f) => ({ ...f, env: v }))}
								placeholder={"GITHUB_TOKEN=${GITHUB_TOKEN}\nNODE_ENV=production"}
								rows={3}
							/>
						</div>
						<div>
							<label className="mb-1 block text-[11px] text-muted-foreground">{t("workDirectory")}</label>
							<InputField
								value={form.cwd}
								onChange={(v) => setForm((f) => ({ ...f, cwd: v }))}
								placeholder="e.g. ${PROJECT_ROOT}"
							/>
						</div>
					</>
				) : (
					<>
						<div className="col-span-2">
							<label className="mb-1 block text-[11px] text-muted-foreground">{t("sseUrl")} *</label>
							<InputField
								value={form.url}
								onChange={(v) => setForm((f) => ({ ...f, url: v }))}
								placeholder="e.g. https://mcp.exa.ai/mcp"
							/>
						</div>
						<div className="col-span-2">
							<label className="mb-1 block text-[11px] text-muted-foreground">{t("requestHeaders")}</label>
							<TextareaField
								value={form.headers}
								onChange={(v) => setForm((f) => ({ ...f, headers: v }))}
								placeholder={"Authorization=Bearer ${EXA_TOKEN}"}
								rows={2}
							/>
						</div>
					</>
				)}
				<div>
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("startupTimeout")}</label>
					<InputField
						value={form.startupTimeout}
						onChange={(v) => setForm((f) => ({ ...f, startupTimeout: v }))}
						placeholder={t("default10000")}
					/>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-[11px] text-muted-foreground">{t("autoApproveTools")}</label>
					<InputField
						value={form.autoApprove}
						onChange={(v) => setForm((f) => ({ ...f, autoApprove: v }))}
						placeholder="e.g. read_file, list_directory"
					/>
				</div>
				<div className="col-span-2 flex items-center gap-6">
					<CheckboxField
						checked={form.disabled}
						onChange={(v) => setForm((f) => ({ ...f, disabled: v }))}
						label={t("disableServer")}
					/>
					<CheckboxField
						checked={form.debug}
						onChange={(v) => setForm((f) => ({ ...f, debug: v }))}
						label={t("debugMode")}
					/>
				</div>
			</div>
			<div className="mt-3 flex justify-end gap-2">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{t("cancel")}
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={onSave}
					disabled={!isFormValid(form) || saving}
				>
					{saveLabel}
				</Button>
			</div>
		</>
	);
}

function marketToServer(m: MarketMcpServer): McpServerConfigData {
	// admin 原样存储完整 mcpServers 条目 JSON；客户端按当前协议解释。
	// 不在此处做字段适配 —— MCP 协议演进时只需升级 desktop-app。
	// 附带把 admin 维护的 display_name/description 写进 common 字段，方便
	// 服务器列表展示，agent 端是 extra field 会被忽略。
	const base = (m.config ?? {}) as Record<string, unknown>;
	const merged: Record<string, unknown> = { ...base };
	if (m.display_name && !merged.displayName) merged.displayName = m.display_name;
	if (m.description && !merged.description) merged.description = m.description;
	return merged as unknown as McpServerConfigData;
}

function summarizeRemoteConfig(cfg: Record<string, unknown>): string {
	const type = typeof cfg.type === "string" ? cfg.type : cfg.command ? "stdio" : cfg.url ? "http" : "";
	if (type === "http" && typeof cfg.url === "string") return cfg.url;
	if (typeof cfg.command === "string") {
		const args = Array.isArray(cfg.args) ? cfg.args.filter((x) => typeof x === "string").join(" ") : "";
		return `${cfg.command}${args ? " " + args : ""}`;
	}
	return "";
}

function configTransportLabel(cfg: Record<string, unknown>): string {
	if (typeof cfg.type === "string") return cfg.type;
	if (typeof cfg.url === "string") return "http";
	if (typeof cfg.command === "string") return "stdio";
	return "—";
}

function RemoteMcpSection({
	addedNames,
	onAdd,
	onRemove,
	t,
}: {
	addedNames: Set<string>;
	onAdd: (m: MarketMcpServer) => Promise<void> | void;
	onRemove: (name: string) => Promise<void> | void;
	t: (key: string) => string;
}): JSX.Element {
	const token = useAtomValue(authTokenAtom);
	const [items, setItems] = useState<MarketMcpServer[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);

	const load = useCallback(() => {
		if (!token) {
			setError(t("loginRequired"));
			setItems([]);
			return;
		}
		setLoading(true);
		setError(null);
		void fetchMarketMcpServers(token)
			.then((list) => {
				setItems(list);
				setError(null);
			})
			.catch((err: Error) => {
				setError(err.message || t("loadFailed"));
				setItems([]);
			})
			.finally(() => setLoading(false));
	}, [token]);

	useEffect(() => {
		load();
	}, [load]);

	const handleAction = useCallback(
		async (m: MarketMcpServer, action: "add" | "remove") => {
			setBusy(m.name);
			try {
				if (action === "add") {
					await onAdd(m);
				} else {
					await onRemove(m.name);
				}
			} finally {
				setBusy(null);
			}
		},
		[onAdd, onRemove],
	);

	return (
		<div className="mt-8">
			<div className="mb-3 flex items-center justify-between">
				<div>
					<SettingHeading t={t as any} section={SETTINGS_SECTION["mcp-remote-list"]} />
					<p className="mt-0.5 text-[11px] text-muted-foreground">
						{t("remoteMcpSupport")}
					</p>
				</div>
				<Button variant="ghost" size="sm" onClick={load} disabled={loading}>
					<span
						className={cn(
							"icon-[mdi--refresh] h-3.5 w-3.5 mr-1",
							loading && "animate-spin",
						)}
					/>
					{t("refresh")}
				</Button>
			</div>

			<SettingSection t={t as any} section={SETTINGS_SECTION["mcp-remote-available"]}>
				{loading && (
					<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">
						{t("loading")}
					</div>
				)}

				{!loading && error && (
					<div className="px-5 py-4 text-center text-[12px] text-red-400">{error}</div>
				)}

				{!loading && !error && items && items.length === 0 && (
					<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">
						{t("noRemoteMcp")}
					</div>
				)}

				{!loading &&
					!error &&
					items &&
					items.map((m) => {
						const added = addedNames.has(m.name);
						const isBusy = busy === m.name;
						return (
							<div
								key={m.id}
								className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0"
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="text-[13px] font-medium text-foreground">
											{m.display_name || m.name}
										</span>
										<span className="rounded-full bg-accent px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
											{configTransportLabel(m.config)}
										</span>
										{added && (
											<span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[9px] font-medium text-green-400">
												{t("added")}
											</span>
										)}
									</div>
									<div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
										{summarizeRemoteConfig(m.config)}
									</div>
									{m.description && (
										<div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
											{m.description}
										</div>
									)}
								</div>
								{added ? (
									<Button
										variant="ghost"
										size="sm"
										disabled={isBusy}
										onClick={() => void handleAction(m, "remove")}
									>
										{isBusy ? t("processing") : t("remove")}
									</Button>
								) : (
									<Button
										variant="primary"
										size="sm"
										disabled={isBusy}
										onClick={() => void handleAction(m, "add")}
									>
										{isBusy ? t("processing") : t("add")}
									</Button>
								)}
							</div>
						);
					})}
			</SettingSection>
		</div>
	);
}

export function McpSettings(): JSX.Element {
	const { t } = useTranslation("settings");
	const [config, setConfig] = useState<McpConfigData | null>(null);
	const [mode, setMode] = useState<McpEditMode>("visual");
	const [saving, setSaving] = useState(false);
	const narrow = useNarrowScreen();

	// Visual mode state
	const [expandedServer, setExpandedServer] = useState<string | null>(null);
	const [addingServer, setAddingServer] = useState(false);
	const [editingServer, setEditingServer] = useState<string | null>(null);
	const [serverForm, setServerForm] = useState<McpServerFormState>({ ...emptyMcpServer });

	// JSON mode state
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		void window.vetta.mcp.get().then((c) => {
			setConfig(c);
			setJsonText(JSON.stringify(c, null, 2));
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

	// --- Visual mode CRUD ---

	const handleAddServer = useCallback(async () => {
		if (!config || !isFormValid(serverForm)) return;
		const newConfig: McpConfigData = {
			...config,
			mcpServers: {
				...config.mcpServers,
				[serverForm.name.trim()]: formToServer(serverForm),
			},
		};
		await saveConfig(newConfig);
		setAddingServer(false);
		setServerForm({ ...emptyMcpServer });
		setExpandedServer(serverForm.name.trim());
	}, [config, serverForm, saveConfig]);

	const handleUpdateServer = useCallback(async (oldName: string) => {
		if (!config || !isFormValid(serverForm)) return;
		const newServers = { ...config.mcpServers };
		if (oldName !== serverForm.name.trim()) {
			delete newServers[oldName];
		}
		newServers[serverForm.name.trim()] = formToServer(serverForm);
		await saveConfig({ ...config, mcpServers: newServers });
		setEditingServer(null);
		setServerForm({ ...emptyMcpServer });
		if (oldName !== serverForm.name.trim()) {
			setExpandedServer(serverForm.name.trim());
		}
	}, [config, serverForm, saveConfig]);

	const addRemoteServer = useCallback(
		async (m: MarketMcpServer) => {
			if (!config) return;
			const newServers = { ...config.mcpServers, [m.name]: marketToServer(m) };
			await saveConfig({ ...config, mcpServers: newServers });
		},
		[config, saveConfig],
	);

	const removeRemoteServer = useCallback(
		async (name: string) => {
			if (!config) return;
			const newServers = { ...config.mcpServers };
			delete newServers[name];
			await saveConfig({ ...config, mcpServers: newServers });
			if (expandedServer === name) setExpandedServer(null);
		},
		[config, expandedServer, saveConfig],
	);

	const handleDeleteServer = useCallback(async (name: string) => {
		if (!config) return;
		const newServers = { ...config.mcpServers };
		delete newServers[name];
		await saveConfig({ ...config, mcpServers: newServers });
		if (expandedServer === name) setExpandedServer(null);
	}, [config, expandedServer, saveConfig]);

	const handleToggleDisabled = useCallback(async (name: string) => {
		if (!config) return;
		const server = config.mcpServers[name];
		if (!server) return;
		const newServers = {
			...config.mcpServers,
			[name]: { ...server, disabled: !server.disabled },
		};
		await saveConfig({ ...config, mcpServers: newServers });
	}, [config, saveConfig]);

	const startEditServer = useCallback((name: string) => {
		if (!config) return;
		const s = config.mcpServers[name];
		if (!s) return;
		setServerForm(serverToForm(name, s));
		setEditingServer(name);
		setAddingServer(false);
	}, [config]);

	// --- JSON mode ---

	const handleJsonSave = useCallback(async () => {
		try {
			const parsed = JSON.parse(jsonText) as McpConfigData;
			if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
				setJsonError(t("jsonMustHaveMcpServers"));
				return;
			}
			// Validate each server config based on transport type
			for (const [name, srv] of Object.entries(parsed.mcpServers)) {
				const type = (srv as { type?: string }).type ?? "stdio";
				if (type !== "stdio" && type !== "http") {
					setJsonError(t("jsonTypeMustBeStdioOrHttp", { name }));
					return;
				}
				if (type === "http") {
					const httpSrv = srv as { url?: unknown };
					if (!httpSrv.url || typeof httpSrv.url !== "string") {
						setJsonError(t("jsonMissingUrl", { name }));
						return;
					}
				} else {
					const stdioSrv = srv as { command?: unknown };
					if (!stdioSrv.command || typeof stdioSrv.command !== "string") {
						setJsonError(t("jsonMissingCommand", { name }));
						return;
					}
				}
			}
			setJsonError(null);
			await saveConfig(parsed);
		} catch (e) {
			setJsonError(t("jsonParseError", { msg: (e as Error).message }));
		}
	}, [jsonText, saveConfig]);

	// Sync json text when switching to json mode
	const handleModeSwitch = useCallback((newMode: McpEditMode) => {
		if (newMode === "json" && config) {
			setJsonText(JSON.stringify(config, null, 2));
			setJsonError(null);
		}
		setMode(newMode);
		// Reset visual editing state
		setAddingServer(false);
		setEditingServer(null);
		setServerForm({ ...emptyMcpServer });
	}, [config]);

	if (!config) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 py-4">
				<h1 className="mb-6 text-[20px] font-bold text-foreground">{t("title")}</h1>
				<div className="flex items-center justify-center py-16">
					<span className="text-[13px] text-muted-foreground">{t("loading")}</span>
				</div>
			</div>
		);
	}

	const serverNames = Object.keys(config.mcpServers);
	const addedServerNames = new Set(serverNames);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-[20px] font-bold text-foreground">{t("title")}</h1>
				<SegmentedControl
					items={[
						{ key: "visual" as McpEditMode, label: t("viewMode"), icon: "icon-[mdi--view-list-outline]" },
						{ key: "json" as McpEditMode, label: "JSON", icon: "icon-[mdi--code-json]" },
					]}
					value={mode}
					onChange={handleModeSwitch}
				/>
			</div>

			{mode === "visual" ? (
				<>
					{/* Server list */}
					<SettingSection t={t as any} section={SETTINGS_SECTION["mcp-server-list"]}>
						{serverNames.length === 0 && !addingServer && (
							<div className="px-5 py-8 text-center text-[12px] text-muted-foreground">
								{t("noServers")}
							</div>
						)}

						{serverNames.map((name) => {
							const server = config.mcpServers[name]!;
							const isExpanded = expandedServer === name;
							const isEditing = editingServer === name;
							const isDisabled = server.disabled ?? false;

							const actions = (
								<div className="flex shrink-0 items-center gap-1">
									{/* Toggle enable/disable */}
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											void handleToggleDisabled(name);
										}}
										className={cn(
											"flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
											isDisabled
												? "text-muted-foreground hover:bg-accent hover:text-foreground"
												: "text-green-400 hover:bg-green-500/10",
										)}
										title={isDisabled ? t("enable") : t("disable")}
									>
										<span className={`${isDisabled ? "icon-[mdi--toggle-switch-off-outline]" : "icon-[mdi--toggle-switch-outline]"} h-4 w-4`} />
									</button>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											startEditServer(name);
											setExpandedServer(name);
										}}
										className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
										title={t("edit")}
									>
										<span className="icon-[mdi--pencil-outline] h-3.5 w-3.5" />
									</button>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											void handleDeleteServer(name);
										}}
										className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
										title={t("delete")}
									>
										<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
									</button>
								</div>
							);

							return (
								<div key={name} className="border-b border-border last:border-b-0">
									{/* Server header */}
									<div
										className={cn(
											"flex items-center gap-3 px-5",
											narrow ? "pt-3.5 pb-1" : "py-3.5",
										)}
									>
										<button
											type="button"
											onClick={() => setExpandedServer(isExpanded ? null : name)}
											className="flex min-w-0 flex-1 items-center gap-3 text-left"
										>
											<span
												className={cn(
													"icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground transition-transform",
													isExpanded && "rotate-90",
												)}
											/>
											<div className="min-w-0 flex-1">
												<div className={cn(
													"text-[13px] font-medium truncate",
													isDisabled ? "text-muted-foreground" : "text-foreground",
												)}>
													{server.displayName || name}
													{isDisabled && (
														<span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
															{t("disabledStatus")}
														</span>
													)}
												</div>
												<div className="mt-0.5 text-[11px] text-muted-foreground font-mono truncate">
													{server.displayName ? `${name} · ` : ""}
													{isHttpMcpServerConfigData(server)
														? `HTTP · ${server.url}`
														: `${server.command}${server.args && server.args.length > 0 ? ` ${server.args.join(" ")}` : ""}`}
												</div>
											</div>
										</button>
										{!narrow && actions}
									</div>
									{/* 极窄：操作按钮挪到第二行右对齐，避免被截断隐藏 */}
									{narrow && <div className="flex justify-end px-5 pb-3">{actions}</div>}

									{/* Edit form */}
									{isExpanded && isEditing && (
										<div className="border-t border-border bg-secondary/50 px-5 py-4">
											<McpServerForm
												form={serverForm}
												setForm={setServerForm}
												onSave={() => void handleUpdateServer(name)}
												onCancel={() => {
													setEditingServer(null);
													setServerForm({ ...emptyMcpServer });
												}}
												saving={saving}
												saveLabel={t("save")}
												t={t as any}
											/>
										</div>
									)}

									{/* Expanded detail view */}
									{isExpanded && !isEditing && (
										<div className="border-t border-border bg-secondary/30 px-5 py-3">
											{(server.displayName || server.description) && (
												<div className="mb-3 grid grid-cols-1 gap-y-2 text-[12px]">
													{server.displayName && (
														<DetailItem label={t("displayName")} value={server.displayName} />
													)}
													<DetailItem label={t("serverName")} value={name} />
													{server.description && (
														<DetailItem label={t("description")} value={server.description} />
													)}
												</div>
											)}
											<div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
												<DetailItem label={t("transportType")} value={isHttpMcpServerConfigData(server) ? "HTTP" : t("stdio")} />
												{isHttpMcpServerConfigData(server) ? (
													<DetailItem label={t("sseUrl")} value={server.url} />
												) : (
													<>
														<DetailItem label={t("command")} value={server.command} />
														<DetailItem label={t("arguments")} value={server.args?.join(", ") || "—"} />
														<DetailItem label={t("workDirectory")} value={server.cwd || "—"} />
													</>
												)}
												<DetailItem label={t("startupTimeout")} value={server.startupTimeout != null ? `${server.startupTimeout}ms` : t("default10s")} />
												<DetailItem label={t("debugMode")} value={server.debug ? t("statusEnabled") : t("statusDisabled")} />
												<DetailItem label={t("autoApproveTools")} value={server.autoApprove?.join(", ") || "—"} />
											</div>
											{!isHttpMcpServerConfigData(server) && server.env && Object.keys(server.env).length > 0 && (
												<div className="mt-3">
													<div className="mb-1 text-[11px] text-muted-foreground">{t("envVariables")}</div>
													<div className="rounded-lg bg-muted px-3 py-2 font-mono text-[11px] text-foreground">
														{Object.entries(server.env).map(([k, v]) => (
															<div key={k}>{k}={v}</div>
														))}
													</div>
												</div>
											)}
											{isHttpMcpServerConfigData(server) && server.headers && Object.keys(server.headers).length > 0 && (
												<div className="mt-3">
													<div className="mb-1 text-[11px] text-muted-foreground">{t("requestHeaders")}</div>
													<div className="rounded-lg bg-muted px-3 py-2 font-mono text-[11px] text-foreground">
														{Object.entries(server.headers).map(([k, v]) => (
															<div key={k}>{k}={v}</div>
														))}
													</div>
												</div>
											)}
										</div>
									)}
								</div>
							);
						})}

						{/* Add server form */}
						{addingServer && (
							<div className="border-t border-border px-5 py-4">
								<McpServerForm
									form={serverForm}
									setForm={setServerForm}
									onSave={() => void handleAddServer()}
									onCancel={() => {
										setAddingServer(false);
										setServerForm({ ...emptyMcpServer });
									}}
									saving={saving}
									saveLabel={t("addServer")}
									t={t as any}
								/>
							</div>
						)}
					</SettingSection>

					{/* Add server button */}
					{!addingServer && (
						<button
							type="button"
							onClick={() => {
								setAddingServer(true);
								setEditingServer(null);
								setServerForm({ ...emptyMcpServer });
							}}
							className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-[13px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
						>
							<span className="icon-[mdi--plus] h-4 w-4" />
							{t("addMcpServer")}
						</button>
					)}
				</>
			) : (
				/* JSON mode */
				<div className="mb-6">
					<div className="mb-3 flex items-center justify-between">
						<SettingHeading t={t as any} section={SETTINGS_SECTION["mcp-json"]} />
						<Button
							variant="primary"
							size="sm"
							onClick={() => void handleJsonSave()}
							disabled={saving}
						>
							{saving ? t("saving") : t("save")}
						</Button>
					</div>
					<div className="overflow-hidden rounded-xl border border-border bg-muted">
						<textarea
							ref={jsonTextareaRef}
							value={jsonText}
							onChange={(e) => {
								setJsonText(e.target.value);
								setJsonError(null);
							}}
							spellCheck={false}
							className="w-full resize-none bg-transparent px-4 py-3 font-mono text-[12px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40"
							style={{ minHeight: "320px" }}
							placeholder='{ "mcpServers": {} }'
						/>
					</div>
					{jsonError && (
						<div className="mt-2 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
							<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5 shrink-0" />
							{jsonError}
						</div>
					)}
				</div>
			)}

			{/* Remote MCP list (only in visual mode) */}
			{mode === "visual" && (
				<RemoteMcpSection
					addedNames={addedServerNames}
					onAdd={addRemoteServer}
					onRemove={removeRemoteServer}
					t={t as any}
				/>
			)}

			{/* Config file path hint */}
			<div className="mt-6 text-center text-[11px] text-muted-foreground/60">
				{t("configFilePath")}: ~/.vetta/agent/mcp.json
			</div>
		</div>
	);
}
