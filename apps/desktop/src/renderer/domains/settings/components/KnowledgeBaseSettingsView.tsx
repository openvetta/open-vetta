import { KnowledgeHowItWorksDialog } from "@shared/components/KnowledgeHowItWorksDialog";
import { ModelSelect } from "@shared/components/ModelSelect";
import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";
import { MotionSelect, SettingRow, SettingSection } from "@vetta-org/theme-ui/settings";
import { Switch } from "@vetta-org/ui";
import { useMemo, useState } from "react";
import { SettingsAiAssist } from "../ai-assist";
import { SETTINGS_SECTION } from "../registry";
import type { KnowledgeBaseSettingsModel } from "./useKnowledgeBaseSettingsModel";

export function KnowledgeBaseSettingsView({ model }: { model: KnowledgeBaseSettingsModel }): JSX.Element {
	const [howItWorksOpen, setHowItWorksOpen] = useState(false);

	const intervalOptions = useMemo(
		() => [
			...model.intervalOptions.map((minutes) => ({
				value: String(minutes),
				label: model.labels.everyNMinutes(minutes),
			})),
			{ value: String(model.neverInterval), label: model.labels.never },
		],
		[model.intervalOptions, model.labels, model.neverInterval],
	);
	const concurrencyOptions = useMemo(
		() =>
			model.agentConcurrencyOptions.map((count) => ({
				value: String(count),
				label: model.labels.parallelN(count),
			})),
		[model.agentConcurrencyOptions, model.labels],
	);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-4">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-[20px] font-bold text-foreground">{model.labels.title}</h1>
				<div className="flex flex-wrap items-center gap-2">
					<SettingsAiAssist tabId="knowledge" />
					<Button type="button" onClick={() => setHowItWorksOpen(true)} variant="ghost" size="sm">
						<span className="icon-[solar--lightbulb-linear] h-4 w-4" />
						<span>{model.labels.howItWorks}</span>
					</Button>
				</div>
			</div>

			<SettingSection
				title={model.labels.sections.processing}
				section={SETTINGS_SECTION["knowledge-processing"]}
				description={model.labels.howItWorksDescription}
			>
				<SettingRow title={model.labels.enable} description={model.labels.enableDescription}>
					<Switch
						aria-label={model.labels.enable}
						checked={model.enabled}
						onCheckedChange={model.actions.toggle}
					/>
				</SettingRow>
				<SettingRow title={model.labels.interval} description={model.labels.intervalDescription}>
					<MotionSelect
						aria-label={model.labels.interval}
						value={String(model.interval)}
						onValueChange={model.actions.changeInterval}
						options={intervalOptions}
						disabled={!model.enabled}
						triggerClassName="min-w-[120px]"
					/>
				</SettingRow>
				<SettingRow title={model.labels.parallel} description={model.labels.parallelDescription}>
					<MotionSelect
						aria-label={model.labels.parallel}
						value={String(model.agentConcurrency)}
						onValueChange={model.actions.changeAgentConcurrency}
						options={concurrencyOptions}
						disabled={!model.enabled}
						triggerClassName="min-w-[120px]"
					/>
				</SettingRow>
				<SettingRow title={model.labels.model} description={model.labels.modelDescription} border={false}>
					{/* 不用 flex-wrap + basis-full：会把右侧撑满整行，左侧标题被压成单字竖列 */}
					<div className="flex flex-col items-end gap-1.5">
						<div className="flex items-center gap-2">
							<ModelSelect
								value={model.modelKey || null}
								onChange={(key) => model.actions.changeModel(key ?? "")}
								disabled={!model.enabled}
								placeholder={model.labels.selectModel}
								triggerClassName={cn(
									"h-8 w-[220px] max-w-full rounded-lg border-border bg-card px-2.5 text-[12px] font-medium hover:bg-accent data-[state=open]:bg-accent",
									model.enabled && !model.modelKey && "border-amber-500/50",
								)}
								reasoning={{
									value: model.reasoningLevel || undefined,
									onChange: model.actions.changeReasoning,
								}}
							/>
							<Button
								type="button"
								onClick={() => void model.actions.probe()}
								disabled={!model.enabled || model.probing || !model.modelKey}
								variant="outline"
								size="sm"
							>
								<span>{model.labels.testConnect}</span>
								{model.probing ? (
									<span className="icon-[solar--refresh-linear] h-3.5 w-3.5 animate-spin" />
								) : model.probeResult?.ok ? (
									<span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 text-emerald-400" />
								) : model.probeResult && !model.probeResult.ok ? (
									<span className="icon-[solar--close-circle-linear] h-3.5 w-3.5 text-destructive" />
								) : null}
							</Button>
						</div>
						{model.probeResult && (
							<output
								className={cn(
									"max-w-full break-words text-[12px]",
									model.probeResult.ok ? "text-emerald-400" : "text-destructive",
								)}
							>
								{model.probeResult.msg}
							</output>
						)}
						{model.enabled && !model.modelKey && (
							<span className="flex max-w-full items-center gap-1 text-[11px] text-amber-500">
								<span className="icon-[solar--danger-circle-linear] h-3.5 w-3.5 shrink-0" />
								<span className="truncate">{model.labels.noModelSelected}</span>
							</span>
						)}
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection
				title={model.labels.sections.actions}
				section={SETTINGS_SECTION["knowledge-actions"]}
				description={model.status ?? undefined}
			>
				<SettingRow title={model.labels.processNow} description={model.labels.processNowDescription}>
					<Button
						type="button"
						onClick={() => void model.actions.scan()}
						disabled={!model.enabled || !model.modelKey || model.busy !== null}
						variant="outline"
						size="sm"
					>
						<span>{model.labels.processNowButton}</span>
						{model.busy === "scan" && <span className="icon-[solar--refresh-linear] h-3.5 w-3.5 animate-spin" />}
					</Button>
				</SettingRow>
				<SettingRow title={model.labels.retryFailed} description={model.labels.retryFailedDescription}>
					<Button
						type="button"
						onClick={() => void model.actions.retryFailed()}
						disabled={!model.enabled || !model.modelKey || model.busy !== null}
						variant="outline"
						size="sm"
					>
						<span>{model.labels.retryFailedButton}</span>
						{model.busy === "retry" && <span className="icon-[solar--refresh-linear] h-3.5 w-3.5 animate-spin" />}
					</Button>
				</SettingRow>
				<SettingRow title={model.labels.records} description={model.labels.recordsDescription}>
					<Button type="button" onClick={() => void model.actions.openRecords()} variant="outline" size="sm">
						<span>{model.labels.viewRecords}</span>
					</Button>
				</SettingRow>
				<SettingRow title={model.labels.clearWiki} description={model.labels.clearWikiDescription} border={false}>
					<Button
						type="button"
						onClick={model.actions.clearWiki}
						disabled={model.busy !== null}
						variant="destructive"
						size="sm"
					>
						<span className="icon-[solar--trash-bin-trash-linear] h-3.5 w-3.5" />
						<span>{model.labels.clearWikiButton}</span>
						{model.busy === "clear" && <span className="icon-[solar--refresh-linear] h-3.5 w-3.5 animate-spin" />}
					</Button>
				</SettingRow>
			</SettingSection>

			<KnowledgeHowItWorksDialog open={howItWorksOpen} onClose={() => setHowItWorksOpen(false)} />
		</div>
	);
}
