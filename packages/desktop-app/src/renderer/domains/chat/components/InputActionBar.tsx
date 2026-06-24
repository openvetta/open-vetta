import { useAtom, useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useCallback } from "react";
import {
	activeInputActionIdsAtom,
	activeToolNamesAtom,
	knowledgeBaseEnabledAtom,
	knowledgeRetrievalActiveAtom,
	pluginInputActionsAtom,
} from "@shared/store/atoms";
import type { RegisteredInputAction } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";

/** 知识检索 badge 对应的工具：任一激活即视为知识库可用。 */
const KNOWLEDGE_TOOLS = ["kb_filter_by_tags", "kb_list_available_tags"];

/**
 * badge 是否随其对应工具的 scope 显示。activeTools 为 null（未知：新建会话页 / 尚未加载）时
 * 回退显示；已知则按工具是否在激活集内决定。单一真相源，避免「显示了但工具被场景屏蔽」。
 */
function knowledgeVisible(activeTools: Set<string> | null): boolean {
	return activeTools === null || KNOWLEDGE_TOOLS.some((t) => activeTools.has(t));
}
function actionVisible(action: RegisteredInputAction, activeTools: Set<string> | null): boolean {
	return activeTools === null || !action.requiresActiveTool || activeTools.has(action.requiresActiveTool);
}

/**
 * Plugin input-action toggles, shown as a borderless row seated on the recessed
 * "ledge" beneath the AI input card. Clicking activates an action; clicking
 * again deactivates. Active ids are tracked in activeInputActionIdsAtom and
 * consumed at send time (decoratePrompt → PromptRequest.metadata). Distinct
 * from ActionButtonBar.
 */
export function InputActionBar(): JSX.Element | null {
	const allActions = useAtomValue(pluginInputActionsAtom);
	const [activeIds, setActiveIds] = useAtom(activeInputActionIdsAtom);
	const [knowledgeActive, setKnowledgeActive] = useAtom(knowledgeRetrievalActiveAtom);
	const knowledgeBaseEnabled = useAtomValue(knowledgeBaseEnabledAtom);
	const activeTools = useAtomValue(activeToolNamesAtom);
	// badge 跟随工具 scope：仅显示其对应工具在本会话激活的 badge。
	const showKnowledge = knowledgeBaseEnabled && knowledgeVisible(activeTools);
	const actions = allActions.filter((a) => actionVisible(a, activeTools));

	const toggle = useCallback(
		(actionId: string, onToggle: ((active: boolean) => boolean | void) | undefined) => {
			const willActivate = !activeIds.has(actionId);
			// Let the action veto its own activation (e.g. a plugin that requires
			// configuration first) by returning false. Deactivation can't be vetoed.
			if (willActivate && onToggle?.(true) === false) return;
			if (!willActivate) onToggle?.(false);
			setActiveIds((prev) => {
				const next = new Set(prev);
				if (willActivate) next.add(actionId);
				else next.delete(actionId);
				return next;
			});
		},
		[activeIds, setActiveIds],
	);

	if (!showKnowledge && actions.length === 0) return null;

	return (
		<motion.div
			// 从卡片背后向下滑出：初始整体上移并被 z-10 的输入卡遮住，再滑落露出下沿，
			// 视觉上像是从 AI input bar 里滑出来。
			initial={{ y: "-100%", opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			transition={{ type: "spring", stiffness: 440, damping: 36, mass: 0.9 }}
			className="input-ledge relative z-0 -mt-[18px] mx-3 flex flex-wrap gap-0.5 rounded-b-[14px] px-3 pb-1 pt-[22px]"
		>
			<AnimatePresence initial={false}>
				{showKnowledge && (
				<motion.button
					key="__builtin_knowledge_retrieval__"
					type="button"
					layout
					initial={{ scale: 0.7, opacity: 0, y: -6 }}
					animate={{ scale: 1, opacity: 1, y: 0 }}
					exit={{ scale: 0.7, opacity: 0, y: -4 }}
					transition={{ type: "spring", stiffness: 520, damping: 30 }}
					whileTap={{ scale: 0.95 }}
					onClick={() => setKnowledgeActive((v) => !v)}
					title="开启后，这次提问会让 AI 优先去你的知识库里找答案"
					className={cn(
						"flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[12px] font-medium transition-colors",
						knowledgeActive
							? "text-primary"
							: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
					)}
				>
					<motion.span
						className="icon-[mdi--book-search-outline] flex h-3.5 w-3.5 items-center justify-center"
						animate={knowledgeActive ? { rotate: [0, -8, 8, 0] } : { rotate: 0 }}
						transition={{ duration: 0.4 }}
					/>
					<span>知识检索</span>
				</motion.button>
				)}
				{actions.map((action, idx) => {
					const active = activeIds.has(action.actionId);
					return (
						<motion.button
							key={action.actionId}
							type="button"
							layout
							initial={{ scale: 0.7, opacity: 0, y: -6 }}
							animate={{ scale: 1, opacity: 1, y: 0 }}
							exit={{ scale: 0.7, opacity: 0, y: -4 }}
							transition={{ type: "spring", stiffness: 520, damping: 30, delay: idx * 0.03 }}
							whileTap={{ scale: 0.95 }}
							onClick={() => toggle(action.actionId, action.onToggle)}
							className={cn(
								"flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[12px] font-medium transition-colors",
								active
									? "text-primary"
									: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
							)}
						>
							{action.icon && (
								<motion.span
									className="flex h-3.5 w-3.5 items-center justify-center"
									animate={active ? { rotate: [0, -8, 8, 0] } : { rotate: 0 }}
									transition={{ duration: 0.4 }}
								>
									{action.icon}
								</motion.span>
							)}
							<span>{action.label}</span>
						</motion.button>
					);
				})}
			</AnimatePresence>
		</motion.div>
	);
}

/**
 * Capsule chips for currently-active input actions, attached to the right of the
 * permission/execution-mode selector inside the input toolbar. Clicking a chip
 * deactivates that action (mirrors the toggle in InputActionBar).
 */
export function ActiveInputActionChips(): JSX.Element | null {
	const actions = useAtomValue(pluginInputActionsAtom);
	const [activeIds, setActiveIds] = useAtom(activeInputActionIdsAtom);
	const [knowledgeActive, setKnowledgeActive] = useAtom(knowledgeRetrievalActiveAtom);
	const knowledgeBaseEnabled = useAtomValue(knowledgeBaseEnabledAtom);
	const activeTools = useAtomValue(activeToolNamesAtom);
	const showKnowledge = knowledgeBaseEnabled && knowledgeVisible(activeTools);

	const deactivate = useCallback(
		(actionId: string, onToggle: ((active: boolean) => void) | undefined) => {
			setActiveIds((prev) => {
				const next = new Set(prev);
				next.delete(actionId);
				onToggle?.(false);
				return next;
			});
		},
		[setActiveIds],
	);

	const activeActions = actions.filter((a) => activeIds.has(a.actionId) && actionVisible(a, activeTools));

	return (
		<AnimatePresence initial={false}>
			{knowledgeActive && showKnowledge && (
				<motion.button
					key="__builtin_knowledge_retrieval__"
					type="button"
					layout
					initial={{ scale: 0.7, opacity: 0, x: -6 }}
					animate={{ scale: 1, opacity: 1, x: 0 }}
					exit={{ scale: 0.7, opacity: 0, x: -4 }}
					transition={{ type: "spring", stiffness: 520, damping: 30 }}
					whileTap={{ scale: 0.95 }}
					onClick={() => setKnowledgeActive(false)}
					title="点击取消"
					className="group flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11.5px] font-medium text-primary transition-colors hover:bg-primary/15"
				>
					<span className="icon-[mdi--book-search-outline] flex h-3 w-3 items-center justify-center" />
					<span className="max-w-[120px] truncate">知识检索</span>
					<span className="icon-[solar--close-circle-linear] h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
				</motion.button>
			)}
			{activeActions.map((action) => (
				<motion.button
					key={action.actionId}
					type="button"
					layout
					initial={{ scale: 0.7, opacity: 0, x: -6 }}
					animate={{ scale: 1, opacity: 1, x: 0 }}
					exit={{ scale: 0.7, opacity: 0, x: -4 }}
					transition={{ type: "spring", stiffness: 520, damping: 30 }}
					whileTap={{ scale: 0.95 }}
					onClick={() => deactivate(action.actionId, action.onToggle)}
					title="点击取消"
					className="group flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11.5px] font-medium text-primary transition-colors hover:bg-primary/15"
				>
					{action.icon && <span className="flex h-3 w-3 items-center justify-center">{action.icon}</span>}
					<span className="max-w-[120px] truncate">{action.label}</span>
					<span className="icon-[solar--close-circle-linear] h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
				</motion.button>
			))}
		</AnimatePresence>
	);
}
