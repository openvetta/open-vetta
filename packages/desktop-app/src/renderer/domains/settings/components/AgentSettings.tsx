import { useCallback, useEffect, useState } from "react";
import type { PersonaOption } from "@preload/api.js";
import { Button } from "@shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { Slider } from "@shared/components/ui/slider";
import { Switch } from "@shared/components/ui/switch";
import { cn } from "@shared/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { SettingHeading, SettingRow, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

const personaItemVariants = {
	hidden: { opacity: 0, x: -12 },
	show: { opacity: 1, x: 0 },
};

const MIN_IMAGES = 1;
const MAX_IMAGES = 10;

function clampImages(value: number): number {
	if (!Number.isFinite(value)) return 2;
	return Math.min(Math.max(Math.round(value), MIN_IMAGES), MAX_IMAGES);
}

export function AgentSettings(): JSX.Element {
	const [maxRecentImages, setMaxRecentImages] = useState(2);

	// 个性化：人设清单 + 当前配置（已落盘基线）+ 本地缓冲。
	const [personas, setPersonas] = useState<PersonaOption[]>([]);
	const [personaId, setPersonaId] = useState("default");
	const [customPrompt, setCustomPrompt] = useState("");
	const [applied, setApplied] = useState({ personaId: "default", customPrompt: "" });
	const [saving, setSaving] = useState(false);
	const [justSaved, setJustSaved] = useState(false);
	const [personaOpen, setPersonaOpen] = useState(false);

	// 实验性功能：ask_user_question 开关（默认关）。
	const [askUserQuestionEnabled, setAskUserQuestionEnabled] = useState(false);

	useEffect(() => {
		void window.vetta.session.getMaxRecentImages().then((v) => setMaxRecentImages(clampImages(v)));
		void window.vetta.session.getPersonas().then(setPersonas);
		void window.vetta.session.getPersonalization().then((cfg) => {
			setPersonaId(cfg.personaId);
			setCustomPrompt(cfg.customPrompt);
			setApplied(cfg);
		});
		void window.vetta.config.get().then((cfg) => {
			setAskUserQuestionEnabled(cfg.experimental?.askUserQuestion === true);
		});
	}, []);

	// 开关切换：落盘 + 即时注入/清除问答 handler（能力=注册）。下一条消息生效，无需重启。
	const handleToggleAskUserQuestion = useCallback((checked: boolean) => {
		setAskUserQuestionEnabled(checked);
		void window.vetta.config.set({ experimental: { askUserQuestion: checked } });
		void window.vetta.session.setQuestionEnabled(checked);
	}, []);

	const dirty = personaId !== applied.personaId || customPrompt !== applied.customPrompt;
	const selectedPersona = personas.find((p) => p.id === personaId);

	const handleApply = useCallback(async () => {
		setSaving(true);
		const startedAt = performance.now();
		try {
			const next = { personaId, customPrompt };
			await window.vetta.session.setPersonalization(next);
			setApplied(next);
			// IPC 通常 <50ms 就返回，直接收尾会让按钮文案一闪而过、产生抖动。
			// 兜一个最短可见时长，让「应用中…」稳定显示后再切到「已应用」。
			const elapsed = performance.now() - startedAt;
			if (elapsed < 450) await new Promise((resolve) => setTimeout(resolve, 450 - elapsed));
			setJustSaved(true);
			setTimeout(() => setJustSaved(false), 1500);
		} finally {
			setSaving(false);
		}
	}, [personaId, customPrompt]);

	// 拖拽中只更新本地 state（UI 实时跟手），不落盘。
	const handlePreview = useCallback((pos: number) => {
		setMaxRecentImages(clampImages(pos));
	}, []);

	// 松手 / 点击刻度时才持久化一次，避免拖拽过程中每格都写文件造成卡顿。
	const handleCommit = useCallback((pos: number) => {
		const value = clampImages(pos);
		setMaxRecentImages(value);
		void window.vetta.session.setMaxRecentImages(value);
	}, []);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">Agent配置</h1>

			<div className="mb-6 p-1.5">
				<SettingHeading section={SETTINGS_SECTION["agent-personalization"]} className="mb-1" />
				<p className="mb-4 text-[12px] text-muted-foreground">
					为 agent 选择一个预设人设，并可在其之上追加自定义指令。应用后在每个 session 的下一条消息生效，无需重启。
				</p>

				<div>
					<div className="text-[13px] font-medium text-foreground">人设</div>
					<Popover open={personaOpen} onOpenChange={setPersonaOpen}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className={cn(
									"mt-2 flex h-8 w-full max-w-[280px] items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors",
									personaOpen
										? "border-primary bg-background"
										: "border-border/70 bg-background/50 hover:border-muted-foreground/40",
								)}
							>
								<span className="truncate text-foreground">{selectedPersona?.label ?? "默认"}</span>
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
											{personas.map((p) => (
												<motion.div key={p.id} variants={personaItemVariants}>
													<button
														type="button"
														onClick={() => {
															setPersonaOpen(false);
															setPersonaId(p.id);
														}}
														className={cn(
															"flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium transition-colors",
															personaId === p.id ? "bg-accent text-foreground" : "text-foreground hover:bg-accent",
														)}
													>
														<span className="truncate">{p.label}</span>
														{personaId === p.id && (
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
					{selectedPersona?.description && (
						<p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{selectedPersona.description}</p>
					)}
				</div>

				<div className="mt-5">
					<div className="text-[13px] font-medium text-foreground">自定义指令</div>
					<p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
						在所选人设之上追加的个人化指令，会拼接到系统提示词末尾。留空表示不追加。
					</p>
					<textarea
						value={customPrompt}
						onChange={(e) => setCustomPrompt(e.target.value)}
						placeholder="例如：默认用中文回答；代码注释保持简洁……"
						className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground outline-none focus:border-primary"
						style={{ minHeight: "120px" }}
					/>
				</div>

				<div className="mt-4 flex justify-end">
					<Button
						variant="primary"
						size="sm"
						className="min-w-[76px]"
						disabled={!dirty || saving}
						onClick={() => void handleApply()}
					>
						{saving ? "应用中…" : justSaved && !dirty ? "已应用" : "应用"}
					</Button>
				</div>
			</div>

			<div>
				<SettingSection section={SETTINGS_SECTION["agent-images"]}>
					<div className="px-5 py-4">
						<div className="flex items-baseline justify-between gap-4">
							<div className="text-[13px] font-medium text-foreground">上下文保留图片数</div>
							<div className="shrink-0 text-[13px] font-semibold tabular-nums text-primary">
								{maxRecentImages} 张
							</div>
						</div>
						<p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
							上下文中最多保留最近几张图片，更早的图片会被替换为文字占位以节省显存 / token。算力较低的机器（如本地小显存 GPU）建议调低，否则多图并存容易撑爆显存；算力充足或使用云端模型时可适当调高以保留更多视觉上下文。
						</p>

						<div className="mt-7 px-2.5">
							<Slider
								value={[maxRecentImages]}
								min={MIN_IMAGES}
								max={MAX_IMAGES}
								step={1}
								onValueChange={(vals) => handlePreview(vals[0])}
								onValueCommit={(vals) => handleCommit(vals[0])}
								aria-label="上下文保留图片数"
							/>
							<div className="mt-3 flex w-full items-center justify-between gap-1 px-0.5 text-[11px] font-medium text-muted-foreground">
								{Array.from({ length: MAX_IMAGES }, (_, i) => {
									const pos = i + MIN_IMAGES;
									const isCurrent = pos === maxRecentImages;
									return (
										<button
											type="button"
											key={pos}
											onClick={() => handleCommit(pos)}
											aria-label={`保留 ${pos} 张`}
											className="flex w-0 cursor-pointer flex-col items-center gap-1.5 outline-none"
										>
											<span className="h-1 w-px bg-muted-foreground/50" />
											<span className={isCurrent ? "text-primary" : "transition-colors hover:text-foreground"}>
												{pos}
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
				<SettingSection section={SETTINGS_SECTION["agent-experimental"]}>
					<SettingRow
						title="提问用户面板"
						description="开启后 agent 可在执行途中向你提多选题，输入栏会临时变为问答选择界面。"
						border={false}
					>
						<Switch checked={askUserQuestionEnabled} onCheckedChange={handleToggleAskUserQuestion} />
					</SettingRow>
				</SettingSection>
			</div>
		</div>
	);
}
