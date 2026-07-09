import { useTranslation } from "react-i18next";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";
import { McpServerDetail } from "./McpServerDetail";
import { McpServerForm } from "./McpServerForm";
import {
	isHttpMcpServerConfigData,
	type McpSettingsModel,
} from "./useMcpSettingsModel";

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

	const isExpanded = model.expandedServer === name;
	const isEditing = model.editingServer === name;
	const isDisabled = server.disabled ?? false;
	const actions = (
		<div className="flex shrink-0 items-center gap-1">
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={(event) => {
					event.stopPropagation();
					void model.onToggleDisabled(name);
				}}
				className={isDisabled ? "text-muted-foreground" : "text-emerald-400"}
				title={isDisabled ? t("enable") : t("disable")}
			>
				<span className={`${isDisabled ? "icon-[mdi--toggle-switch-off-outline]" : "icon-[mdi--toggle-switch-outline]"} h-4 w-4`} />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={(event) => {
					event.stopPropagation();
					model.onStartEditServer(name);
					if (!isExpanded) model.onToggleServer(name);
				}}
				title={t("edit")}
			>
				<span className="icon-[mdi--pencil-outline] h-3.5 w-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={(event) => {
					event.stopPropagation();
					void model.onDeleteServer(name);
				}}
				title={t("delete")}
				className="text-muted-foreground hover:text-destructive"
			>
				<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
			</Button>
		</div>
	);

	return (
		<div className="border-b border-border last:border-b-0">
			<div className={cn("flex items-center gap-3 px-5", narrow ? "pt-3.5 pb-1" : "py-3.5")}>
				<button
					type="button"
					onClick={() => model.onToggleServer(name)}
					className="flex min-w-0 flex-1 items-center gap-3 text-left"
				>
					<span
						className={cn(
							"icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground transition-transform",
							isExpanded && "rotate-90",
						)}
					/>
					<div className="min-w-0 flex-1">
						<div
							className={cn(
								"truncate text-[13px] font-medium",
								isDisabled ? "text-muted-foreground" : "text-foreground",
							)}
						>
							{server.displayName || name}
							{isDisabled && (
								<span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
									{t("disabledStatus")}
								</span>
							)}
						</div>
						<div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
							{server.displayName ? `${name} · ` : ""}
							{isHttpMcpServerConfigData(server)
								? `HTTP · ${server.url}`
								: `${server.command}${server.args && server.args.length > 0 ? ` ${server.args.join(" ")}` : ""}`}
						</div>
					</div>
				</button>
				{!narrow && actions}
			</div>
			{narrow && <div className="flex justify-end px-5 pb-3">{actions}</div>}

			{isExpanded && isEditing && (
				<div className="border-t border-border bg-secondary/50 px-5 py-4">
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

			{isExpanded && !isEditing && <McpServerDetail name={name} server={server} />}
		</div>
	);
}
