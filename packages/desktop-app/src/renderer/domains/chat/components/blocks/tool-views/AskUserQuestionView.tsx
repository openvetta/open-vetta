import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { QuestionItem, ToolCallBlock } from "@shared/store/atoms";

interface AskUserQuestionViewProps {
	block: ToolCallBlock;
}

function parseQuestions(args: Record<string, unknown>): QuestionItem[] {
	const raw = args.questions;
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((q): q is Record<string, unknown> => typeof q === "object" && q !== null)
		.map((q) => ({
			question: typeof q.question === "string" ? q.question : "",
			header: typeof q.header === "string" ? q.header : "",
			multiSelect: q.multiSelect === true,
			options: Array.isArray(q.options)
				? (q.options as Array<Record<string, unknown>>).map((o) => ({
						label: typeof o.label === "string" ? o.label : "",
						description: typeof o.description === "string" ? o.description : "",
						badges: Array.isArray(o.badges) ? (o.badges.filter((b) => typeof b === "string") as string[]) : undefined,
					}))
				: [],
		}));
}

const SWITCH = { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] as const };

/**
 * ask_user_question 的 transcript 富视图：回显问题与用户最终所选答案。
 * 单问题直接平铺；多问题用可切换的 tab（滑动下划线 + 内容淡入淡出）逐个查看。
 */
export function AskUserQuestionView({ block }: AskUserQuestionViewProps): JSX.Element | null {
	const { t } = useTranslation("chat");
	const questions = parseQuestions(block.args);
	const resolution = block.uiDetails?.askUserQuestion;
	const cancelled = resolution?.cancelled === true;
	const answersByQuestion = new Map<string, string[]>();
	for (const a of resolution?.answers ?? []) answersByQuestion.set(a.question, a.answers);
	const [active, setActive] = useState(0);

	if (questions.length === 0) {
		return cancelled ? <CancelledBanner /> : null;
	}

	const single = questions.length === 1;
	const activeIndex = Math.min(active, questions.length - 1);

	return (
		<div className="flex flex-col gap-2">
			{cancelled && <CancelledBanner />}

			{!single && (
				<div className="flex items-center gap-0.5 overflow-x-auto">
					{questions.map((q, i) => {
						const answered = (answersByQuestion.get(q.question) ?? []).length > 0;
						const isActive = i === activeIndex;
						return (
							<button
								key={i}
								type="button"
								onClick={() => setActive(i)}
								className={`relative flex shrink-0 items-center gap-1 rounded-t-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
									isActive ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground/80"
								}`}
							>
								<span className="max-w-[120px] truncate">
								{q.header || t("askUserQuestion.defaultQuestionLabel", { number: i + 1 })}
							</span>
								{answered && <span className="icon-[mdi--check-circle] size-3 shrink-0 text-primary" />}
								{isActive && (
									<motion.span
										layoutId={`askq-tab-underline-${block.toolCallId}`}
										className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary"
										transition={SWITCH}
									/>
								)}
							</button>
						);
					})}
				</div>
			)}

			{single ? (
				<QuestionBody question={questions[0]} chosen={answersByQuestion.get(questions[0].question) ?? []} showHeader />
			) : (
				<div className="relative overflow-hidden">
					<AnimatePresence mode="wait" initial={false}>
						<motion.div
							key={activeIndex}
							initial={{ opacity: 0, x: 10 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -10 }}
							transition={SWITCH}
						>
							<QuestionBody
								question={questions[activeIndex]}
								chosen={answersByQuestion.get(questions[activeIndex].question) ?? []}
							/>
						</motion.div>
					</AnimatePresence>
				</div>
			)}
		</div>
	);
}

function CancelledBanner(): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
			<span className="icon-[mdi--close-circle-outline] size-3.5" />
			{t("askUserQuestion.cancelledMessage")}
		</div>
	);
}

interface QuestionBodyProps {
	question: QuestionItem;
	chosen: string[];
	/** 单问题时在正文顶部显示 header 标签；多问题时 header 已在 tab 上，不重复。 */
	showHeader?: boolean;
}

function QuestionBody({ question, chosen, showHeader }: QuestionBodyProps): JSX.Element {
	return (
		<div className="rounded-lg border border-border/60 bg-background/40 p-2">
			<div className="mb-2 flex items-start gap-1.5">
				{showHeader && question.header && (
					<span className="shrink-0 whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-[10px] leading-5 text-muted-foreground">
						{question.header}
					</span>
				)}
				<span className="min-w-0 flex-1 text-[12px] leading-5 text-foreground/90">{question.question}</span>
			</div>
			<div className="flex flex-col gap-1">
				{question.options.map((opt) => {
					const isChosen = chosen.includes(opt.label);
					return (
						<div
							key={opt.label}
							className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] ${
								isChosen ? "bg-primary/10 text-foreground" : "text-muted-foreground/60"
							}`}
						>
							<span
								className={`size-3 shrink-0 ${
									isChosen ? "icon-[mdi--check-circle] text-primary" : "icon-[mdi--circle-outline]"
								}`}
							/>
							<span className="min-w-0 flex-1">{opt.label}</span>
							{opt.badges?.map((b) => (
								<span key={b} className="shrink-0 rounded-full bg-primary/15 px-1 text-[9px] text-primary">
									{b}
								</span>
							))}
						</div>
					);
				})}
				{/* 自由文本答案（不在 options 内）。 */}
				{chosen
					.filter((c) => !question.options.some((o) => o.label === c))
					.map((custom) => (
						<div
							key={custom}
							className="flex items-center gap-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-foreground"
						>
							<span className="icon-[mdi--pencil] size-3 shrink-0 text-primary" />
							<span className="min-w-0 flex-1">{custom}</span>
						</div>
					))}
			</div>
		</div>
	);
}
