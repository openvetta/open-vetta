import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { MultiplierTag } from "@shared/components/ModelSelect/MultiplierTag";
import { ProviderIcon } from "@shared/components/provider-icon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@shared/components/ui/dropdown-menu";
import { cn } from "@shared/lib/utils";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
import type { ModelSelectorViewProps } from "./types";

export function ModelSelectorView({
	selectedModel,
	selectedOption,
	currentLevel,
	menuLevels,
	groups,
	defaultKey,
	labels,
	className,
	classNames,
	onModelSelect,
	onReasoningSelect,
}: ModelSelectorViewProps): JSX.Element {
	const [open, setOpen] = useState(false);
	const [reasoningOpen, setReasoningOpen] = useState(false);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:outline-none data-[state=open]:bg-accent/60 data-[state=open]:text-foreground",
						className,
						classNames?.trigger,
					)}
				>
					{selectedOption && <ProviderIcon symbol={groups.find((g) => g.provider === selectedOption.provider)?.icon} className="h-3.5 w-3.5" />}
					<span className="min-w-0 flex-1 truncate text-left">{selectedOption?.displayName ?? labels.placeholder}</span>
					{currentLevel && <span className="shrink-0 text-muted-foreground">{labels.levelLabel(currentLevel)}</span>}
					<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3 shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<AnimatePresence>
				{open && (
					<DropdownMenuContent
						forceMount
						asChild
						align="start"
						className={cn("max-h-[300px] min-w-[220px] max-w-[320px] overflow-visible p-0", classNames?.content)}
						style={{ animation: "none" }}
					>
						<motion.div
							initial={{ opacity: 0, scale: 0.96, y: 8 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: 8 }}
							transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
						>
							<div className="relative overflow-visible rounded-[inherit]">
								<ThemeSurface slot="chat.modelSelectorMenu" />
								<div
									className={cn(
										"relative z-10 max-h-[300px] overflow-y-auto overflow-x-hidden rounded-[inherit] p-1",
										classNames?.contentInner,
									)}
								>
									{menuLevels.length > 0 && (
										<>
											<DropdownMenuSub open={reasoningOpen} onOpenChange={setReasoningOpen}>
												<DropdownMenuSubTrigger>
													<span className="min-w-0 flex-1 truncate">{labels.reasoningHeader}</span>
													{currentLevel && (
														<span className="shrink-0 text-muted-foreground">
															{labels.levelLabel(currentLevel)}
														</span>
													)}
												</DropdownMenuSubTrigger>
												<AnimatePresence>
													{reasoningOpen && (
														<DropdownMenuSubContent
															forceMount
															asChild
															className="min-w-[160px] overflow-visible p-0"
															style={{ animation: "none" }}
														>
															<motion.div
																initial={{ opacity: 0, scale: 0.96, x: -6 }}
																animate={{ opacity: 1, scale: 1, x: 0 }}
																exit={{ opacity: 0, scale: 0.96, x: -6 }}
																transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
															>
																<div className="relative overflow-visible rounded-[inherit]">
																	<ThemeSurface slot="chat.modelSelectorReasoningMenu" />
																	<div className="relative z-10 overflow-hidden rounded-[inherit] p-1">
																		<DropdownMenuLabel>{labels.reasoningHeader}</DropdownMenuLabel>
																		{menuLevels.map((level) => (
																			<DropdownMenuItem key={level} onSelect={() => onReasoningSelect(level)}>
																				<span className="min-w-0 flex-1 truncate">
																					{labels.levelLabel(level)}
																				</span>
																				{level === currentLevel && (
																					<span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0" />
																				)}
																			</DropdownMenuItem>
																		))}
																	</div>
																</div>
															</motion.div>
														</DropdownMenuSubContent>
													)}
												</AnimatePresence>
											</DropdownMenuSub>
											<DropdownMenuSeparator />
										</>
									)}
									<DropdownMenuLabel>{labels.modelHeader}</DropdownMenuLabel>
									{groups.map((group) => (
										<div key={group.provider}>
											<div
												className={cn(
													"flex items-center gap-1.5 px-3 pb-0.5 pt-1.5 text-[10px] font-medium text-muted-foreground/50",
													classNames?.providerHeader,
												)}
											>
												<ProviderIcon symbol={group.icon} className="h-3 w-3" />
												{group.label}
												{group.models[0]?.remote && (
													<span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
														{labels.cloudOnly}
													</span>
												)}
											</div>
											{group.models.map((model) => (
												<DropdownMenuItem
													key={model.key}
													className={classNames?.item}
													onSelect={() => onModelSelect(model.key)}
												>
													<span className="min-w-0 flex-1 truncate">{model.displayName}</span>
													<MultiplierTag multiplier={model.multiplier} />
													{model.supportsImage && (
														<span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
															{labels.visionBadge}
														</span>
													)}
													{model.key === defaultKey && (
														<span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
															{labels.defaultBadge}
														</span>
													)}
													{model.key === selectedModel && (
														<span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 shrink-0" />
													)}
												</DropdownMenuItem>
											))}
										</div>
									))}
								</div>
							</div>
						</motion.div>
					</DropdownMenuContent>
				)}
			</AnimatePresence>
		</DropdownMenu>
	);
}
