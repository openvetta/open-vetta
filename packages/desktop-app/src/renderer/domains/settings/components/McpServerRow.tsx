import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { McpJsonEditorView } from "@vetta/theme-ui/settings";
import { Button, Switch, cn } from "@vetta/ui";
import {
	isBuiltinMcpServer,
	matchBuiltinMcpPreset,
	missingRequiredSecrets,
	resolveMcpIcon,
} from "../mcp/builtin-mcp-presets";
import { McpServerForm } from "./McpServerForm";
import type { McpSettingsModel } from "./useMcpSettingsModel";

export type McpServerRowThemeViews = {
	readonly jsonEditor: typeof McpJsonEditorView;
};

export function McpServerRow({
	name,
	model,
}: {
	name: string;
	model: McpSettingsModel;
}): JSX.Element | null {
	const { t } = useTranslation("settings");
	const narrow = useNarrowScreen();
	const server = model.config?.mcpServers[name];
	if (!server) return null;

	const isEditing = model.editingServer === name;
	const isDisabled = server.disabled ?? false;
	const isBuiltin = isBuiltinMcpServer(name, server);
	const preset = matchBuiltinMcpPreset(name, server);
	const iconSrc = resolveMcpIcon(name, server);
	const [imgFailed, setImgFailed] = useState(false);
	const needsSecrets = preset ? missingRequiredSecrets(preset, server).length > 0 : false;
	const canConfigureSecrets = Boolean(preset?.secrets?.length);

	const displayTitle = preset
		? t(preset.displayNameKey)
		: server.displayName || name;
	const description = preset
		? t(preset.descriptionKey)
		: server.description?.trim() || "";

	const actions = (
		<div className="flex shrink-0 items-center gap-2">
			<Switch
				size="sm"
				checked={!isDisabled}
				onCheckedChange={() => {
					void model.onToggleDisabled(name);
				}}
				aria-label={isDisabled ? t("enable") : t("disable")}
				title={isDisabled ? t("enable") : t("disable")}
			/>
			{canConfigureSecrets && (
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={() => model.onConfigureBuiltinSecrets(name)}
					title={t("mcpPresets.configureSecrets")}
					className={needsSecrets ? "text-amber-400" : undefined}
				>
					<span className="icon-[mdi--key-variant] h-3.5 w-3.5" />
				</Button>
			)}
			{!isBuiltin && (
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={() => model.onToggleEditServer(name)}
					title={isEditing ? t("closeEdit") : t("edit")}
					className={isEditing ? "text-primary" : undefined}
				>
					<span
						className={cn(
							"h-3.5 w-3.5",
							isEditing ? "icon-[mdi--close]" : "icon-[mdi--pencil-outline]",
						)}
					/>
				</Button>
			)}
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={() => void model.onDeleteServer(name)}
				title={t("delete")}
				className="text-muted-foreground hover:text-destructive"
			>
				<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
			</Button>
		</div>
	);

	return (
		<div
			className={cn(
				"border-b border-border last:border-b-0",
				isBuiltin && "bg-primary/5",
				isEditing && "bg-secondary/40",
			)}
		>
			<div className={cn("flex items-center gap-3 px-5", narrow ? "pt-3.5 pb-1" : "py-3.5")}>
				{!imgFailed ? (
					<img
						src={iconSrc}
						alt=""
						className="h-9 w-9 shrink-0 object-contain"
						onError={() => setImgFailed(true)}
					/>
				) : (
					<span className="icon-[mdi--puzzle-outline] h-9 w-9 shrink-0 text-muted-foreground" />
				)}
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						<div
							className={cn(
								"truncate text-[13px] font-medium",
								isDisabled ? "text-muted-foreground" : "text-foreground",
							)}
						>
							{displayTitle}
						</div>
						{isDisabled && (
							<span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
								{t("disabledStatus")}
							</span>
						)}
						{needsSecrets && (
							<span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
								{t("mcpPresets.needsSecrets")}
							</span>
						)}
					</div>
					{description ? (
						<div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
							{description}
						</div>
					) : null}
				</div>
				{!narrow && actions}
			</div>
			{narrow && <div className="flex justify-end px-5 pb-3">{actions}</div>}

			{isEditing && !isBuiltin && (
				<div className="border-t border-border bg-secondary/50 px-5 py-4">
					<div className="mb-3 flex items-center justify-between">
						<span className="text-[12px] font-medium text-foreground">{t("editingServer")}</span>
						<Button variant="ghost" size="sm" onClick={model.onCancelEditServer}>
							{t("closeEdit")}
						</Button>
					</div>
					<McpServerForm
						form={model.serverForm}
						setForm={model.setServerForm}
						onSave={() => void model.onUpdateServer(name)}
						onCancel={model.onCancelEditServer}
						saving={model.saving}
						saveLabel={t("save")}
					/>
				</div>
			)}
		</div>
	);
}
