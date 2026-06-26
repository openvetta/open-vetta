import { useAtom, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import { workspacePathAtom, debugModeAtom, confirmDialogAtom, sessionExecutionModeAtom, type SessionExecutionMode } from "@shared/store/atoms";
import { UpdateChecker } from "@shared/components/UpdateChecker";
import { Button } from "@shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { Switch } from "@shared/components/ui/switch";
import { SettingRow, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

export function GeneralSettings(): JSX.Element {
	const { t } = useTranslation("settings");
	const [workspacePath, setWorkspacePath] = useAtom(workspacePathAtom);
	const [debugMode, setDebugMode] = useAtom(debugModeAtom);
	const [executionMode, setExecutionMode] = useAtom(sessionExecutionModeAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const [sandboxUnavailableReason, setSandboxUnavailableReason] = useState<string | null>(null);
	const [notificationsEnabled, setNotificationsEnabled] = useState(true);
	const [exportingDiagnostics, setExportingDiagnostics] = useState(false);

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			setNotificationsEnabled(config.notificationsEnabled !== false);
			const mode = config.defaultExecutionMode ?? "full-access";
			setExecutionMode(mode);
			localStorage.setItem("vetta-session-execution-mode", mode);
			const capability = config.sandbox ?? config.linuxSandbox;
			if (capability?.status === "unavailable") {
				const reason = capability.reason ?? "unknown_error";
				const platform = "platform" in capability ? capability.platform : "linux";
				setSandboxUnavailableReason(`${t("sandboxUnavailable", { platform, reason })}`);
				return;
			}
			setSandboxUnavailableReason(null);
		});
	}, [setExecutionMode, t]);

	const handleSelectWorkspace = useCallback(async () => {
		const selected = await window.vetta.dialog.selectFolder();
		if (selected) {
			setWorkspacePath(selected);
			localStorage.setItem("vetta-workspace-path", selected);
			await window.vetta.config.set({ workspacePath: selected });
		}
	}, [setWorkspacePath]);

	const handleResetWorkspace = useCallback(async () => {
		const defaultPath = "~/.vetta/workspace";
		setWorkspacePath(defaultPath);
		localStorage.setItem("vetta-workspace-path", defaultPath);
		await window.vetta.config.set({ workspacePath: defaultPath });
	}, [setWorkspacePath]);

	const handleToggleDebug = useCallback(
		(checked: boolean) => {
			if (!checked) {
				setConfirmDialog({
					title: t("closeDebugTitle"),
					message: t("closeDebugMessage"),
					confirmLabel: t("closeDebugConfirm"),
					variant: "danger",
					onConfirm: () => {
						void window.vetta.debug.clearDebugDir();
						setDebugMode(false);
						localStorage.setItem("vetta-debug-mode", "false");
						void window.vetta.config.set({ debugMode: false });
					},
				});
				return;
			}
			setDebugMode(true);
			localStorage.setItem("vetta-debug-mode", "true");
			void window.vetta.config.set({ debugMode: true });
		},
		[setDebugMode, setConfirmDialog],
	);

	const handleExportDiagnostics = useCallback(async () => {
		if (exportingDiagnostics) return;
		setExportingDiagnostics(true);
		try {
			await window.vetta.diagnostics.exportDiagnosticsPackage();
		} catch (error) {
			console.error("[GeneralSettings] failed to export diagnostics:", error);
			setConfirmDialog({
				title: t("exportDiagnosticsFailed"),
				message: error instanceof Error ? error.message : String(error),
				confirmLabel: t("gotIt"),
				onConfirm: () => {},
			});
		} finally {
			setExportingDiagnostics(false);
		}
	}, [exportingDiagnostics, setConfirmDialog]);

	const handleToggleNotifications = useCallback((checked: boolean) => {
		setNotificationsEnabled(checked);
		void window.vetta.config.set({ notificationsEnabled: checked });
	}, []);

	const handleExecutionModeChange = useCallback(
		async (mode: SessionExecutionMode) => {
			if (mode === executionMode) return;
			if (mode === "sandbox" && sandboxUnavailableReason) return;
			const previousMode = executionMode;
			setExecutionMode(mode);
			localStorage.setItem("vetta-session-execution-mode", mode);
			try {
				await window.vetta.config.set({ defaultExecutionMode: mode });
			} catch (error) {
				setExecutionMode(previousMode);
				localStorage.setItem("vetta-session-execution-mode", previousMode);
				console.error("[GeneralSettings] failed to switch execution mode:", error);
			}
		},
		[executionMode, sandboxUnavailableReason, setExecutionMode],
	);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">{t("general")}</h1>

			<SettingSection t={t as any} section={SETTINGS_SECTION["general-workspace"]}>
				<SettingRow
					title={t("workspace.title")}
					description={t("workspaceDescription")}
					border={false}
				>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => void handleSelectWorkspace()}
							className="flex items-center gap-2 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
						>
							<span className="icon-[mdi--folder-outline] h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span className="max-w-[180px] truncate">{workspacePath}</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						</button>
						<button
							type="button"
							onClick={() => void handleResetWorkspace()}
							className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							title={t("reset")}
						>
							<span className="icon-[mdi--restore] h-3.5 w-3.5" />
						</button>
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection t={t as any} section={SETTINGS_SECTION["general-updates"]}>
				<div className="px-5 py-4">
					<UpdateChecker />
				</div>
			</SettingSection>

			<SettingSection t={t as any} section={SETTINGS_SECTION["general-sandbox"]}>
				<SettingRow
					title={t("sandbox.title")}
					description={t("sandboxDescription")}
					border={false}
				>
					<Select value={executionMode} onValueChange={(value) => void handleExecutionModeChange(value as SessionExecutionMode)}>
						<SelectTrigger
							size="sm"
							className="h-8 min-w-[120px] border-border/70 bg-background/50 text-[12px]"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="full-access" className="text-[12px]">
								{t("fullAccess")}
							</SelectItem>
							<SelectItem value="sandbox" className="text-[12px]" disabled={Boolean(sandboxUnavailableReason)} title={sandboxUnavailableReason ?? undefined}>
								{t("useSandbox")}
							</SelectItem>
						</SelectContent>
					</Select>
				</SettingRow>
			</SettingSection>

			<SettingSection t={t as any} section={SETTINGS_SECTION["general-notifications"]}>
				<SettingRow
					title={t("systemNotifications")}
					description={t("systemNotificationsDescription")}
					border={false}
				>
					<Switch checked={notificationsEnabled} onCheckedChange={handleToggleNotifications} />
				</SettingRow>
			</SettingSection>

			<SettingSection t={t as any} section={SETTINGS_SECTION["general-developer"]}>
				<SettingRow
					title={t("debugMode")}
					description={t("debugModeDescription")}
				>
					<Switch checked={debugMode} onCheckedChange={handleToggleDebug} />
				</SettingRow>
				<SettingRow
					title={t("exportDiagnostics")}
					description={t("exportDiagnosticsDescription")}
					border={false}
				>
					<Button
						size="sm"
						variant="outline"
						disabled={exportingDiagnostics}
						onClick={() => void handleExportDiagnostics()}
					>
						{exportingDiagnostics ? t("exporting") : t("export")}
					</Button>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
