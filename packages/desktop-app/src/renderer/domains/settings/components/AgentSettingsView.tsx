import { Button } from "@vetta/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@vetta/ui";
import { Slider } from "@shared/components/ui/slider";
import { Switch } from "@vetta/ui";
import { cn } from "@shared/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SettingsAiAssist } from "../ai-assist";
import { SETTINGS_SECTION } from "../registry";
import { SettingHeading, SettingRow, SettingSection } from "@vetta/theme-ui/settings";
import type { AgentSettingsModel } from "./useAgentSettingsModel";

const personaItemVariants = {
	hidden: { opacity: 0, x: -12 },
	show: { opacity: 1, x: 0 },
};

export interface AgentSettingsViewProps {
	model: AgentSettingsModel;
}

export function AgentSettingsView({ model }: AgentSettingsViewProps): JSX.Element {
	const [personaOpen, setPersonaOpen] = useState(false);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-[20px] font-bold text-foreground">{model.labels.title}</h1>
				<SettingsAiAssist tabId="agent" />
			</div>

			<div className="mb-6 p-1.5">
				<SettingHeading
					title={model.labels.sections.personalization}
					section={SETTINGS_SECTION["agent-personalization"]}
					className="mb-1"
				/>
				<p className="mb-4 text-[12px] text-muted-foreground">{model.labels.agentDescription}</p>

				<div>
					<div className="text-[13px] font-medium text-foreground">{model.labels.persona}</div>
					<Popover open={personaOpen} onOpenChange={setPersonaOpen}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className={cn(
									"mt-2 flex h-8 w-full max-w-[200px] items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors",
									personaOpen ? "bg-accent" : "bg-muted hover:bg-accent",
								)}
							>
								<span className="truncate text-foreground">
									{model.selectedPersona?.label ?? model.labels.defaultPersona}
								</span>
								<span className="icon-[mdi--chevron-down] ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
							</button>
						</PopoverTrigger>
						<AnimatePresence>
							{personaOpen && (
								<PopoverContent
									forceMount
									asChild
									align="start"
									sideOffset={6}
									className="w-[var(--radix-popover-trigger-width)] gap-0 overflow-hidden rounded-lg border border-border p-1"
									style={{ animation: "none" }}
								>
									<motion.div
										initial={{ opacity: 0, scale: 0.96, y: -8 }}
										animate={{ opacity: 1, scale: 1, y: 0 }}
										exit={{ opacity: 0, scale: 0.96, y: -8 }}
										transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
									>
										<motion.div
											variants={{
												hidden: {},
												show: { transition: { staggerChildren: 0.025, delayChildren: 0.02 } },
											}}
											initial="hidden"
											animate="show"
										>
											{model.personas.map((persona) => (
												<motion.div key={persona.id} variants={personaItemVariants}>
													<button
														type="button"
														onClick={() => {
															setPersonaOpen(false);
															model.actions.setPersonaId(persona.id);
														}}
														className={cn(
															"flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium transition-colors",
															model.personaId === persona.id
																? "bg-accent text-foreground"
																: "text-foreground hover:bg-accent",
														)}
													>
														<span className="truncate">{persona.label}</span>
														{model.personaId === persona.id && (
															<span className="icon-[mdi--check] ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
														)}
													</button>
												</motion.div>
											))}
										</motion.div>
									</motion.div>
								</PopoverContent>
							)}
						</AnimatePresence>
					</Popover>
					{model.selectedPersona?.description && (
						<p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
							{model.selectedPersona.description}
						</p>
					)}
				</div>

				<div className="mt-5">
					<div className="text-[13px] font-medium text-foreground">{model.labels.customInstructions}</div>
					<p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
						{model.labels.customInstructionsDescription}
					</p>
					<textarea
						value={model.customPrompt}
						onChange={(event) => model.actions.setCustomPrompt(event.target.value)}
						placeholder={model.labels.customInstructionsPlaceholder}
						className="mt-3 w-full resize-y rounded-lg bg-muted px-3 py-2 text-[13px] leading-relaxed text-foreground outline-none transition-colors focus:bg-accent focus:ring-1 focus:ring-primary/30"
						style={{ minHeight: "120px" }}
					/>
				</div>

				<div className="mt-4 flex justify-end">
					<Button
						variant="primary"
						size="sm"
						className="min-w-[76px]"
						disabled={!model.dirty || model.saving}
						onClick={() => void model.actions.applyPersonalization()}
					>
						{model.saving
							? model.labels.saving
							: model.justSaved && !model.dirty
								? model.labels.applied
								: model.labels.apply}
					</Button>
				</div>
			</div>

			<div>
				<SettingSection title={model.labels.sections.images} section={SETTINGS_SECTION["agent-images"]}>
					<div className="px-5 py-4">
						<div className="flex items-baseline justify-between gap-4">
							<div className="text-[13px] font-medium text-foreground">{model.labels.maxRecentImages}</div>
							<div className="shrink-0 text-[13px] font-semibold tabular-nums text-primary">
								{model.maxRecentImages} {model.labels.images}
							</div>
						</div>
						<p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
							{model.labels.maxRecentImagesDescription}
						</p>

						<div className="mt-7 px-2.5">
							<Slider
								value={[model.maxRecentImages]}
								min={model.minImages}
								max={model.maxImages}
								step={1}
								onValueChange={(values) => model.actions.previewMaxRecentImages(values[0])}
								onValueCommit={(values) => model.actions.commitMaxRecentImages(values[0])}
								aria-label={model.labels.maxRecentImages}
							/>
							<div className="mt-3 flex w-full items-center justify-between gap-1 px-0.5 text-[11px] font-medium text-muted-foreground">
								{Array.from({ length: model.maxImages }, (_, index) => {
									const position = index + model.minImages;
									const isCurrent = position === model.maxRecentImages;
									return (
										<button
											type="button"
											key={position}
											onClick={() => model.actions.commitMaxRecentImages(position)}
											aria-label={`${model.labels.maxRecentImages}: ${position}`}
											className="flex w-0 cursor-pointer flex-col items-center gap-1.5 outline-none"
										>
											<span className="h-1 w-px bg-muted-foreground/50" />
											<span className={isCurrent ? "text-primary" : "transition-colors hover:text-foreground"}>
												{position}
											</span>
										</button>
									);
								})}
							</div>
						</div>
					</div>
				</SettingSection>
			</div>

			<div className="mt-2">
				<SettingSection title={model.labels.sections.experimental} section={SETTINGS_SECTION["agent-experimental"]}>
					<SettingRow
						title={model.labels.appOp}
						description={model.labels.appOpDescription}
					>
						<Switch checked={model.vettaCliEnabled} onCheckedChange={model.actions.toggleVettaCli} />
					</SettingRow>
					<SettingRow
						title={model.labels.inputPrediction}
						description={model.labels.inputPredictionDescription}
					>
						<Switch
							checked={model.promptPredictionEnabled}
							onCheckedChange={model.actions.togglePromptPrediction}
						/>
					</SettingRow>
					<SettingRow
						title={model.labels.agentSkill}
						description={model.labels.agentSkillDescription}
						border={false}
					>
						<Switch checked={model.agentSkillsEnabled} onCheckedChange={model.actions.toggleAgentSkills} />
					</SettingRow>
				</SettingSection>
			</div>
		</div>
	);
}
