import { useMemo } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useThemeComponent } from "@vetta/theme-sdk";
import { useThemeSurface } from "@vetta/theme-sdk/appearance";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
import { InputBarContextMenuView, InputBarPlaceholder } from "@vetta/theme-ui/chat";
import { DrawerCard, type DrawerTab } from "@shared/components/DrawerCard";
import { QueueCard } from "@shared/components/QueueCard";
import { TodoCard } from "@shared/components/TodoCard";
import { SlashPanel } from "../SlashPanel";
import { AtPanel } from "../AtPanel";
import { ActionButtonBar } from "../ActionButtonBar";
import { InputActionBar } from "../InputActionBar";
import { ModelSelector } from "../ModelSelector";
import { ExecutionModeSelector } from "../ExecutionModeSelector";
import { ContextRing } from "../ContextRing";
import { QuestionPanel } from "../QuestionPanel";
import { SendButton } from "../SendButton";
import { AppshotCard } from "../AppshotCard";
import { InputBarBackground } from "./InputBarBackground";
import { InputBarCapsule } from "./InputBarCapsule";
import { InputBarToolbarButton } from "./InputBarToolbarButton";
import { SandboxPermissionCard } from "./SandboxPermissionCard";
import type { InputBarViewProps } from "./types";
import "../InputBar.css";

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 140;

const SPRING = { type: "spring" as const, stiffness: 460, damping: 32, mass: 0.9 };
const SOFT = { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] as const };
const COLLAPSE_INITIAL = { height: 0, opacity: 0 };
const COLLAPSE_ANIMATE = { height: "auto", opacity: 1 };
const COLLAPSE_EXIT = { height: 0, opacity: 0 };
const IMAGE_INITIAL = { scale: 0.8, opacity: 0 };
const IMAGE_ANIMATE = { scale: 1, opacity: 1 };
const TOOLBAR_BUTTON_HOVER = { scale: 1.06 };
const TOOLBAR_BUTTON_TAP = { scale: 0.92 };
const SEND_HINT_INITIAL = { opacity: 0, y: 2 };
const SEND_HINT_ANIMATE = { opacity: 1, y: 0 };

export function InputBarView({ model, className, classNames }: InputBarViewProps): JSX.Element {
	const surface = useThemeSurface("chat.inputBar");
	const toolbarLeftSurface = useThemeSurface("chat.inputBarToolbarLeft");
	const toolbarRightSurface = useThemeSurface("chat.inputBarToolbarRight");
	const ThemedDrawerCard = useThemeComponent("chat.inputDrawer", DrawerCard);
	const ThemedInputBarBackground = useThemeComponent(
		"chat.inputBarBackground",
		InputBarBackground,
	);
	const ThemedInputBarPlaceholder = useThemeComponent(
		"chat.inputBarPlaceholder",
		InputBarPlaceholder,
	);
	const drawerTabs = useMemo(
		(): DrawerTab[] =>
			model.drawerItems.map((item) => {
				if (item.kind === "sandbox-permission") {
					return {
						id: item.id,
						label: item.label,
						color: "bg-amber-500",
						desc: item.desc,
						pulsing: item.pulsing,
						content: <SandboxPermissionCard labels={model.labels.permission} request={item.request} />,
					};
				}
				if (item.kind === "queue") {
					return {
						id: item.id,
						label: item.label,
						color: "bg-primary",
						desc: item.desc,
						content: <QueueCard runtimeId={item.runtimeId} onSendNow={item.onSendNow} />,
					};
				}
				return {
					id: item.id,
					label: item.label,
					color: "bg-emerald-500",
					desc: item.desc,
					pulsing: item.pulsing,
					content: <TodoCard items={item.items} compact onViewMore={item.onViewMore} />,
				};
			}),
		[model.drawerItems, model.labels.permission],
	);

	const cardClass = [
		"input-card relative z-10 overflow-visible rounded-[20px] border bg-card transition-[border-color,box-shadow,transform] duration-200",
		model.isFocused ? "border-primary/20" : "border-border",
		surface?.rootClassName,
		classNames?.card,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div className={["relative px-2 pb-3 pt-1 sm:px-4 sm:pb-4", className, classNames?.root].filter(Boolean).join(" ")}>
			<AnimatePresence>
				{model.pendingQuestion && (
					<motion.div
						key="ask-user-question"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 12 }}
						transition={SOFT}
						className="absolute inset-x-0 bottom-0 z-20"
					>
						<QuestionPanel pending={model.pendingQuestion} />
					</motion.div>
				)}
			</AnimatePresence>

			<div
				className={[
					"relative mx-auto w-full max-w-2xl transition-opacity duration-150",
					model.pendingQuestion ? "pointer-events-none opacity-0" : "",
					classNames?.stack,
				]
					.filter(Boolean)
					.join(" ")}
				aria-hidden={model.pendingQuestion ? true : undefined}
			>
				<SlashPanel
					open={model.slashOpen}
					onClose={model.actions.handleSlashClose}
					onSelect={model.actions.handleSlashSelect}
					filter={model.slashFilter}
					cwd={model.effectiveCwd || undefined}
				/>

				<AtPanel
					open={model.atOpen}
					onClose={model.actions.handleAtClose}
					onSelect={model.actions.handleAtSelect}
					filter={model.actions.getAtFilter()}
					cwd={model.effectiveCwd}
				/>

				<ActionButtonBar />

				<ThemedDrawerCard
					tabs={drawerTabs}
					activeTabId={model.drawerActiveTab}
					onActiveTabChange={model.actions.setDrawerActiveTab}
				/>

				<div style={{ opacity: model.hasSession ? 1 : 0.55 }} className={cardClass}>
					<ThemeSurface slot="chat.inputBar" />
					<ThemedInputBarBackground />
					<div className={["relative z-10 rounded-[inherit]", classNames?.cardContent].filter(Boolean).join(" ")}>
						<AnimatePresence initial={false}>
							{(model.hasCapsules || model.attachedImages.length > 0) && (
								<motion.div
									key="capsules"
									initial={COLLAPSE_INITIAL}
									animate={COLLAPSE_ANIMATE}
									exit={COLLAPSE_EXIT}
									transition={SOFT}
									className="overflow-hidden rounded-t-[inherit]"
								>
									<div className={["space-y-1.5 px-3 pt-3", classNames?.capsules].filter(Boolean).join(" ")}>
										{model.pendingMessageEdit && (
											<div className="flex items-center justify-between gap-2 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-[11px] text-primary">
												<span className="min-w-0 flex-1 leading-snug">{model.pendingEditHint}</span>
												<button
													type="button"
													onClick={model.actions.cancelPendingEdit}
													className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
												>
													{model.cancelPendingEditLabel}
												</button>
											</div>
										)}
										{/* 附件第1行：Appshot 卡片 */}
										<AnimatePresence initial={false}>
											{model.appshotAttachment && (
												<motion.div
													key="appshot-capsule"
													initial={IMAGE_INITIAL}
													animate={IMAGE_ANIMATE}
													exit={IMAGE_INITIAL}
													transition={SPRING}
												>
													<AppshotCard data={model.appshotAttachment} onRemove={model.actions.removeAppshot} />
												</motion.div>
											)}
										</AnimatePresence>

										{/* 附件第2行：图片组（粘贴图片 + @文件中的图片） */}
										<AnimatePresence>
											{(model.attachedImages.length > 0 || model.hasImages) && (
												<motion.div
													key="image-row"
													initial={COLLAPSE_INITIAL}
													animate={COLLAPSE_ANIMATE}
													exit={COLLAPSE_EXIT}
													transition={SOFT}
													className="flex flex-wrap items-center gap-1.5"
												>
													{model.attachedImages.map((img) => (
														<motion.div
															key={img.id}
															initial={IMAGE_INITIAL}
															animate={IMAGE_ANIMATE}
															exit={IMAGE_INITIAL}
															transition={SPRING}
															className="group relative"
														>
															<div className="h-12 w-12 overflow-hidden rounded-lg border border-border ring-1 ring-border/40">
																<img
																	src={`data:${img.mimeType};base64,${img.data}`}
																	alt={img.name}
																	className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
																/>
															</div>
															<button
																type="button"
																onClick={() => model.actions.removeImage(img.id)}
																className="absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 hover:text-destructive"
																title={model.labels.capsule.removeImage}
																style={{ height: 18, width: 18 }}
															>
																<span className="icon-[solar--close-circle-linear] h-3 w-3" />
															</button>
														</motion.div>
													))}
													{model.imagePreviewItems.map((item, idx) => (
														<motion.div
															key={`img-file-${item.url}`}
															initial={IMAGE_INITIAL}
															animate={IMAGE_ANIMATE}
															exit={IMAGE_INITIAL}
															transition={SPRING}
															className="group relative cursor-pointer"
														>
															<div
																onClick={() => model.actions.openImagePreview(idx)}
																className="h-12 w-12 overflow-hidden rounded-lg border border-border ring-1 ring-border/40"
																title={item.name}
															>
																<img
																	src={item.url ?? item.path ?? ''}
																	alt={item.name}
																	className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
																/>
															</div>
														</motion.div>
													))}
												</motion.div>
											)}
										</AnimatePresence>

										{/* 附件第3行：插件上下文 + skill/scene badge */}
										<AnimatePresence initial={false}>
											{(model.hasPromptAttachment || model.selectedSkill) && (
												<motion.div
													key="meta-row"
													initial={COLLAPSE_INITIAL}
													animate={COLLAPSE_ANIMATE}
													exit={COLLAPSE_EXIT}
													transition={SOFT}
													className="flex flex-wrap items-center gap-1.5"
												>
													{model.hasPromptAttachment && model.promptAttachmentLabel && (
														<InputBarCapsule
															key="plugin-prompt-attachment"
															icon={model.promptAttachmentIcon ?? "icon-[solar--paperclip-linear]"}
															label={model.promptAttachmentLabel}
															labels={model.labels.capsule}
															tone="primary"
															onRemove={model.actions.removePromptAttachment}
														/>
													)}
													{model.selectedSkill && (
														<InputBarCapsule
															key="skill-capsule"
															icon={
																model.selectedSkill.type === "scene"
																	? "icon-[solar--clapperboard-open-linear]"
																	: "icon-[solar--magic-stick-linear]"
															}
															label={model.selectedSkill.alias || model.selectedSkill.name}
															labels={model.labels.capsule}
															tone="primary"
															onRemove={model.actions.removeSkill}
														/>
													)}
												</motion.div>
											)}
										</AnimatePresence>

										{/* 附件第4行：非图片文件胶囊 */}
										<AnimatePresence initial={false}>
											{model.nonImageFiles.length > 0 && (
												<motion.div
													key="file-row"
													initial={COLLAPSE_INITIAL}
													animate={COLLAPSE_ANIMATE}
													exit={COLLAPSE_EXIT}
													transition={SOFT}
													className="flex flex-wrap items-center gap-1.5"
												>
													{model.nonImageFiles.map((file) => (
														<InputBarCapsule
															key={`file-${file.path}`}
															icon={file.isDirectory ? "icon-[solar--folder-linear]" : "icon-[solar--file-linear]"}
															label={file.name}
															labels={model.labels.capsule}
															title={file.path}
															tone="muted"
															onRemove={() => model.actions.removeFile(file.path)}
														/>
													))}
												</motion.div>
											)}
										</AnimatePresence>
									</div>
								</motion.div>
							)}
						</AnimatePresence>

						<div className={["px-4 pb-1 pt-3", classNames?.textareaWrap].filter(Boolean).join(" ")}>
							<div className="relative">
								<textarea
									ref={model.textareaRef}
									rows={1}
									value={model.inputValue}
									onChange={model.actions.handleChange}
									onKeyDown={model.actions.handleKeyDown}
									onPaste={(e) => void model.actions.handlePaste(e)}
									onContextMenu={model.actions.handleContextMenu}
									onFocus={() => model.actions.setFocused(true)}
									onBlur={() => model.actions.setFocused(false)}
									disabled={!model.hasSession}
									aria-label={model.placeholderTexts[0]}
									className="w-full resize-none bg-transparent text-[13.5px] leading-[1.6] text-foreground outline-none disabled:cursor-not-allowed"
									style={{
										minHeight: `${MIN_HEIGHT}px`,
										maxHeight: `${MAX_HEIGHT}px`,
									}}
								/>
								<ThemedInputBarPlaceholder
									texts={model.placeholderTexts}
									visible={model.showPlaceholder}
									rotating={model.placeholderRotating}
								/>
							</div>
						</div>

						<div
							className={[
								"flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 pb-2 pt-1 sm:px-2.5",
								classNames?.toolbar,
							]
								.filter(Boolean)
								.join(" ")}
						>
							<div
								className={[
									"flex min-w-0 flex-shrink items-center gap-0.5",
									toolbarLeftSurface?.rootClassName,
								]
									.filter(Boolean)
									.join(" ")}
								data-theme-surface-root="chat.inputBarToolbarLeft"
							>
								<InputBarToolbarButton
									icon="icon-[solar--add-circle-linear]"
									title={model.labels.toolbar.skills}
									disabled={!model.hasSession}
									onClick={model.actions.handlePlusClick}
									active={model.slashOpen}
								/>
								<InputBarToolbarButton
									icon="icon-[solar--gallery-linear]"
									title={model.labels.toolbar.addImage}
									disabled={!model.hasSession}
									onClick={() => void model.actions.handleSelectImages()}
								/>
								<InputBarToolbarButton
									icon="icon-[solar--paperclip-linear]"
									title={model.labels.toolbar.attachFile}
									disabled={!model.hasSession}
									onClick={() => void model.actions.handleSelectFiles()}
								/>
								<div className="ml-1 h-4 w-px shrink-0 bg-border/70" />
								<div className="min-w-0 flex-shrink">
									<ExecutionModeSelector />
								</div>
							</div>

							<div
								className={[
									"ml-auto flex min-w-0 flex-shrink items-center gap-1",
									toolbarRightSurface?.rootClassName,
								]
									.filter(Boolean)
									.join(" ")}
								data-theme-surface-root="chat.inputBarToolbarRight"
							>
								<div className="min-w-0 flex-shrink">
									<ModelSelector />
								</div>
								<ContextRing className="mr-1" />
								<motion.span
									key={model.isStreaming ? "s" : model.isEmpty ? "e" : "n"}
									initial={SEND_HINT_INITIAL}
									animate={SEND_HINT_ANIMATE}
									transition={SOFT}
									className="mx-1 hidden text-[10.5px] text-muted-foreground/50 select-none md:inline"
								>
									{model.isStreaming ? "" : model.isEmpty ? model.labels.hint.send : model.labels.hint.newline}
								</motion.span>
								{model.isStreaming && !model.isEmpty ? (
									<motion.button
										type="button"
										onClick={model.actions.handleSend}
										whileHover={TOOLBAR_BUTTON_HOVER}
										whileTap={TOOLBAR_BUTTON_TAP}
										transition={SPRING}
										title={model.labels.toolbar.queue}
										className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
									>
										<span className="icon-[solar--add-square-linear] h-[18px] w-[18px]" />
									</motion.button>
								) : (
									<SendButton
										canSend={model.canSend}
										isStreaming={model.isStreaming}
										onSend={model.actions.handleSend}
										onAbort={model.actions.handleAbort}
									/>
								)}
							</div>
						</div>
					</div>
				</div>

				<InputActionBar />
			</div>

			{model.contextMenu
				? createPortal(<InputBarContextMenuView {...model.contextMenu} />, document.body)
				: null}
		</div>
	);
}
