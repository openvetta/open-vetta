import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { SkillInfo } from "@preload/api";
import type { SelectedSkill } from "@shared/store/atoms";
import { SlashPanel } from "./SlashPanel";

interface SkillPromptAreaProps {
	prompt: string;
	onPromptChange: (value: string) => void;
	skill: SelectedSkill | null | undefined;
	onSkillChange: (skill: SelectedSkill | null) => void;
	placeholder?: string;
	minHeight?: number;
	className?: string;
	autoFocus?: boolean;
}

/**
 * 批量任务 / 自动化 dialog 共用的"带技能/场景"prompt 输入区。
 *
 * 行为与会话页 InputBar 对齐：
 * - textarea 为空且首字符为 `/` 时唤起 SlashPanel；中间出现 `/` 不触发。
 * - 底部"+"按钮可随时打开/关闭面板。
 * - 选中的技能/场景以胶囊形式悬浮在 textarea 上方，点击可移除。
 * - 若存储的 skill 在当前已安装列表中查不到，胶囊会带"未安装"标记。
 */
export function SkillPromptArea({
	prompt,
	onPromptChange,
	skill,
	onSkillChange,
	placeholder,
	minHeight = 120,
	className,
	autoFocus,
}: SkillPromptAreaProps): JSX.Element {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [slashOpen, setSlashOpen] = useState(false);
	const slashDismissedRef = useRef(false);
	const [installedSkills, setInstalledSkills] = useState<SkillInfo[] | null>(null);

	// 拉一次已安装列表，用于胶囊上"未安装"标记。
	useEffect(() => {
		void window.vetta.skills.list().then(setInstalledSkills);
	}, []);

	const skillMissing = useMemo(() => {
		if (!skill || installedSkills === null) return false;
		return !installedSkills.some((s) => s.name === skill.name && s.type === skill.type);
	}, [skill, installedSkills]);

	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
		const val = e.target.value;
		onPromptChange(val);

		// 仅当整段以 `/` 开头且没有空格时算激活，与会话页一致。
		const slashActive = val === "/" || (val.startsWith("/") && !val.includes(" "));
		if (!slashActive) {
			slashDismissedRef.current = false;
			if (slashOpen) setSlashOpen(false);
		} else if (!slashDismissedRef.current) {
			if (!slashOpen) setSlashOpen(true);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
		// 面板打开时，方向键/Enter/Esc 交给 SlashPanel，避免落到 textarea。
		if (
			slashOpen &&
			(e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape" || e.key === "Tab")
		) {
			e.preventDefault();
			return;
		}
		// Backspace 在空输入下移除胶囊。
		if (e.key === "Backspace" && prompt === "" && skill) {
			e.preventDefault();
			onSkillChange(null);
		}
	};

	const handleSlashClose = useCallback(() => {
		setSlashOpen(false);
		if (prompt === "/" || (prompt.startsWith("/") && !prompt.includes(" "))) {
			slashDismissedRef.current = true;
		}
	}, [prompt]);

	const handleSlashSelect = useCallback(
		(picked: SkillInfo) => {
			onSkillChange({ name: picked.name, alias: picked.alias, type: picked.type });
			setSlashOpen(false);
			if (prompt.startsWith("/")) {
				onPromptChange("");
			}
			textareaRef.current?.focus();
		},
		[onSkillChange, onPromptChange, prompt],
	);

	const handlePlusClick = (): void => {
		setSlashOpen((prev) => !prev);
	};

	const handleRemoveSkill = (): void => {
		onSkillChange(null);
		textareaRef.current?.focus();
	};

	const isScene = skill?.type === "scene";

	return (
		<div className={`relative ${className ?? ""}`}>
			<SlashPanel
				open={slashOpen}
				onClose={handleSlashClose}
				onSelect={handleSlashSelect}
				filter={prompt.startsWith("/") ? prompt : ""}
			/>

			<div className="rounded-lg border border-border/60 bg-background/30">
				<AnimatePresence initial={false}>
					{skill && (
						<motion.div
							key="skill-capsule-row"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
							className="overflow-hidden"
						>
							<div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
								<button
									type="button"
									onClick={handleRemoveSkill}
									title={skillMissing ? "技能未安装，点击移除" : "点击移除"}
									className={`group flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
										skillMissing
											? "border-amber-500/40 bg-amber-500/10 text-amber-500"
											: "border-primary/20 bg-primary/10 text-primary"
									}`}
								>
									<span
										className={`${isScene ? "icon-[mdi--movie-open-outline]" : "icon-[mdi--puzzle-outline]"} h-3 w-3 shrink-0`}
									/>
									<span className="max-w-[160px] truncate">{skill.alias || skill.name}</span>
									{skillMissing && (
										<span className="shrink-0 rounded-sm bg-amber-500/20 px-1 py-px text-[9px] font-medium">
											未安装
										</span>
									)}
									<span className="icon-[mdi--close] h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
								</button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				<textarea
					ref={textareaRef}
					value={prompt}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					placeholder={placeholder ?? "输入提示词…使用 / 唤出技能/场景"}
					autoFocus={autoFocus}
					className="block w-full resize-y border-none bg-transparent px-3 pt-2.5 pb-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
					style={{ minHeight }}
				/>

				<div className="flex items-center justify-start gap-1 border-t border-border/40 px-2 py-1.5">
					<button
						type="button"
						onClick={handlePlusClick}
						title="技能/场景"
						className={`flex h-7 items-center gap-1 rounded-md px-2 text-[12px] transition-colors ${
							slashOpen
								? "bg-primary/10 text-primary"
								: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
						}`}
					>
						<span className="icon-[mdi--plus] h-3.5 w-3.5" />
						<span>技能/场景</span>
					</button>
				</div>
			</div>
		</div>
	);
}
