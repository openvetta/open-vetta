import { Button } from "@vetta/ui";
import { SegmentedControl } from "@vetta/theme-ui/shared";
import { forwardRef, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import { BuiltinMcpSecretsDialog } from "../../settings/components/BuiltinMcpSecretsDialog";
import { ManualMcpDialog } from "../../settings/components/ManualMcpDialog";
import { McpEditDrawer } from "../../settings/components/McpEditDrawer";
import type { ActionState, MergedSkill } from "../hooks/useSkillsPageModel";
import {
	type CapabilityScope,
	useCapabilitiesModel,
} from "../hooks/useCapabilitiesModel";
import { CapabilityCard } from "./CapabilityCard";

export interface CapabilitiesPanelHandle {
	openCustomCapability: () => void;
	showMine: () => void;
}

interface CapabilitiesPanelProps {
	skills: MergedSkill[];
	searchQuery: string;
	onSearchChange: (query: string) => void;
	skillLoading: boolean;
	skillError: string | null;
	actionStates: Record<string, ActionState>;
	sectionId?: string;
	onInstallSkill: (skill: MergedSkill) => void;
	onToggleSkill: (name: string) => void;
	onUninstallSkill: (name: string, type: "skill" | "scene") => void;
	onPreviewSkill: (skill: MergedSkill) => void;
	onRefreshSkills: () => void;
}

export const CapabilitiesPanel = forwardRef<CapabilitiesPanelHandle, CapabilitiesPanelProps>(
	function CapabilitiesPanel(props, ref): JSX.Element {
		const { t } = useTranslation("skills");
		const model = useCapabilitiesModel(props);

		useImperativeHandle(
			ref,
			() => ({
				openCustomCapability: () => {
					model.setScope("mine");
					model.mcp.onStartAddServer();
				},
				showMine: () => model.setScope("mine"),
			}),
			[model.mcp.onStartAddServer, model.setScope],
		);

		return (
			<>
				<div
					id={props.sectionId}
					data-setting-section-id={props.sectionId}
					data-setting-section-highlight-target={props.sectionId}
					className="flex flex-col gap-4"
				>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="relative w-56 shrink-0">
							<span className="icon-[solar--magnifer-linear] absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
							<input
								type="text"
								placeholder={t("search.placeholder", { noun: t("typeNoun.capability") })}
								value={props.searchQuery}
								onChange={(event) => props.onSearchChange(event.target.value)}
								className="h-8 w-full rounded-lg bg-secondary pl-8 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground/40 transition-colors hover:bg-accent focus:bg-accent focus:outline-none focus:ring-1 focus:ring-primary/30"
							/>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								size="sm"
								disabled={model.refreshing}
								onClick={model.refresh}
							>
								<span
									className={`icon-[solar--refresh-linear] h-3.5 w-3.5 ${model.refreshing ? "animate-spin" : ""}`}
								/>
								{t("capabilities.actions.refresh")}
							</Button>
							<SegmentedControl
								items={[
									{ key: "discover" as CapabilityScope, label: t("capabilities.scope.discover") },
									{ key: "mine" as CapabilityScope, label: t("capabilities.scope.mine") },
								]}
								value={model.scope}
								onChange={model.setScope}
							/>
						</div>
					</div>

					{model.errors.length > 0 && (
						<div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground/70">
							<span className="icon-[solar--info-circle-linear] mt-0.5 h-3.5 w-3.5 shrink-0" />
							<span>{t("capabilities.error.partial", { error: model.errors.join("；") })}</span>
						</div>
					)}

					{model.loading ? (
						<div className="flex min-h-52 flex-col items-center justify-center gap-2 text-muted-foreground/60">
							<span className="icon-[solar--refresh-linear] h-8 w-8 animate-spin" />
							<span className="text-[12px]">{t("loading")}</span>
						</div>
					) : model.items.length === 0 ? (
						<div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-border/50 bg-card/30 text-center">
							<span className="icon-[solar--magic-stick-3-linear] h-10 w-10 text-muted-foreground/50" />
							<div>
								<p className="text-[13px] font-semibold text-foreground">
									{props.searchQuery
										? t("capabilities.empty.noMatch")
										: model.scope === "discover"
											? t("capabilities.empty.discover")
											: t("capabilities.empty.mine")}
								</p>
								<p className="mt-1 text-[11px] text-muted-foreground/60">
									{props.searchQuery
										? t("capabilities.empty.noMatchHint")
										: t("capabilities.empty.hint")}
								</p>
							</div>
						</div>
					) : model.scope === "mine" && model.mineGroups.length > 0 ? (
						<div className="flex flex-col gap-7">
							{model.mineGroups.map((group) => (
								<div key={group.id} className="flex flex-col gap-3">
									{group.id === "agents" && (
										<div className="flex items-baseline gap-2">
											<h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
												{t("group.agentSkill")}
											</h3>
											<span className="text-[11px] tabular-nums text-muted-foreground/40">
												{group.items.length}
											</span>
										</div>
									)}
									<div className="grid grid-cols-2 gap-x-3 gap-y-0.5 lg:grid-cols-3">
										{group.items.map((item) => (
											<CapabilityCard key={item.id} item={item} model={model} />
										))}
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="grid grid-cols-2 gap-x-3 gap-y-0.5 lg:grid-cols-3">
							{model.items.map((item) => (
								<CapabilityCard key={item.id} item={item} model={model} />
							))}
						</div>
					)}
				</div>

				<ManualMcpDialog model={model.mcp} />
				<McpEditDrawer model={model.mcp} />
				<BuiltinMcpSecretsDialog
					open={model.mcp.secretsDialogPreset !== null}
					preset={model.mcp.secretsDialogPreset}
					initialValues={model.mcp.secretsDialogInitial}
					saving={
						model.mcp.saving ||
						(model.mcp.busyPresetName !== null && !model.mcp.secretsDialogAuthorizing)
					}
					authorizing={model.mcp.secretsDialogAuthorizing}
					error={model.mcp.secretsDialogError}
					onOpenChange={(open) => {
						if (!open) model.mcp.onCloseSecretsDialog();
					}}
					onConfirm={(values) => void model.mcp.onConfirmSecretsDialog(values)}
				/>
			</>
		);
	},
);
