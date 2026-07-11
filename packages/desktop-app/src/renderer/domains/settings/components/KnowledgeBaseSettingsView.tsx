import { KnowledgeHowItWorksDialog } from "@shared/components/KnowledgeHowItWorksDialog";
import { ModelSelect } from "@shared/components/ModelSelect";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@shared/components/ui/select";
import { Switch } from "@shared/components/ui/switch";
import { cn } from "@shared/lib/utils";
import { useState } from "react";
import { SettingsAiAssist } from "../ai-assist";
import { SETTINGS_SECTION } from "../registry";
import { SettingRow, SettingSection } from "./shared";
import type { KnowledgeBaseSettingsModel } from "./useKnowledgeBaseSettingsModel";

export function KnowledgeBaseSettingsView({ model }: { model: KnowledgeBaseSettingsModel }): JSX.Element {
	const [howItWorksOpen, setHowItWorksOpen] = useState(false);
	const btnClass =
		"inline-flex items-center gap-1.5 rounded-md border border-input bg-secondary px-2.5 py-1 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50";

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-[20px] font-bold text-foreground">{model.labels.title}</h1>
				<div className="flex flex-wrap items-center gap-2">
					<SettingsAiAssist tabId="knowledge" />
					<button
						type="button"
						onClick={() => setHowItWorksOpen(true)}
						className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<span className="icon-[mdi--lightbulb-on-outline] h-4 w-4" />
						<span>{model.labels.howItWorks}</span>
					</button>
				</div>
			</div>

			<SettingSection
				title={model.labels.sections.processing}
				section={SETTINGS_SECTION["knowledge-processing"]}
				description={model.labels.howItWorksDescription}
			>
				<SettingRow title={model.labels.enable} description={model.labels.enableDescription}>
					<Switch checked={model.enabled} onCheckedChange={model.actions.toggle} />
				</SettingRow>
				<SettingRow title={model.labels.interval} description={model.labels.intervalDescription}>
					<Select value={String(model.interval)} onValueChange={model.actions.changeInterval} disabled={!model.enabled}>
						<SelectTrigger className="h-7 min-w-[120px] px-2 py-1 text-[12px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{model.intervalOptions.map((minutes) => (
								<SelectItem key={minutes} value={String(minutes)} className="text-[12px]">
									{model.labels.everyNMinutes(minutes)}
								</SelectItem>
							))}
							<SelectItem value={String(model.neverInterval)} className="text-[12px]">
								{model.labels.never}
							</SelectItem>
						</SelectContent>
					</Select>
				</SettingRow>
				<SettingRow title={model.labels.parallel} description={model.labels.parallelDescription}>
					<Select
						value={String(model.agentConcurrency)}
						onValueChange={model.actions.changeAgentConcurrency}
						disabled={!model.enabled}
					>
						<SelectTrigger className="h-7 min-w-[120px] px-2 py-1 text-[12px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{model.agentConcurrencyOptions.map((count) => (
								<SelectItem key={count} value={String(count)} className="text-[12px]">
									{model.labels.parallelN(count)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
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
									"w-[220px] max-w-full",
									model.enabled && !model.modelKey && "border-amber-500/50",
								)}
								reasoning={{ value: model.reasoningLevel || undefined, onChange: model.actions.changeReasoning }}
							/>
							<button
								type="button"
								onClick={() => void model.actions.probe()}
								disabled={!model.enabled || model.probing || !model.modelKey}
								className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-secondary px-2.5 py-1 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
							>
								<span>{model.labels.testConnect}</span>
								{model.probing ? (
									<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
								) : model.probeResult?.ok ? (
									<span className="icon-[mdi--check] h-3.5 w-3.5 text-green-600 dark:text-green-400" />
								) : model.probeResult && !model.probeResult.ok ? (
									<span className="icon-[mdi--close] h-3.5 w-3.5 text-red-500" />
								) : null}
							</button>
						</div>
						{model.enabled && !model.modelKey && (
							<span className="flex max-w-full items-center gap-1 text-[11px] text-amber-500">
								<span className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5 shrink-0" />
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
					<button
						type="button"
						onClick={() => void model.actions.scan()}
						disabled={!model.enabled || !model.modelKey || model.busy !== null}
						className={btnClass}
					>
						<span>{model.labels.processNowButton}</span>
						{model.busy === "scan" && <span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />}
					</button>
				</SettingRow>
				<SettingRow title={model.labels.retryFailed} description={model.labels.retryFailedDescription}>
					<button
						type="button"
						onClick={() => void model.actions.retryFailed()}
						disabled={!model.enabled || !model.modelKey || model.busy !== null}
						className={btnClass}
					>
						<span>{model.labels.retryFailedButton}</span>
						{model.busy === "retry" && <span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />}
					</button>
				</SettingRow>
				<SettingRow title={model.labels.records} description={model.labels.recordsDescription}>
					<button type="button" onClick={() => void model.actions.openRecords()} className={btnClass}>
						<span>{model.labels.viewRecords}</span>
					</button>
				</SettingRow>
				<SettingRow title={model.labels.clearWiki} description={model.labels.clearWikiDescription} border={false}>
					<button
						type="button"
						onClick={model.actions.clearWiki}
						disabled={model.busy !== null}
						className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[12px] text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-50"
					>
						<span className="icon-[mdi--trash-can-outline] h-3.5 w-3.5" />
						<span>{model.labels.clearWikiButton}</span>
						{model.busy === "clear" && <span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />}
					</button>
				</SettingRow>
			</SettingSection>

			<KnowledgeHowItWorksDialog open={howItWorksOpen} onClose={() => setHowItWorksOpen(false)} />
		</div>
	);
}
