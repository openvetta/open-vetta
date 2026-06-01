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

/**
 * ask_user_question 的 transcript 富视图：逐问题列出问题文本 + 用户最终所选答案
 * （高亮选中项，回显 badges）。取消时整体显示「已取消」。
 */
export function AskUserQuestionView({ block }: AskUserQuestionViewProps): JSX.Element {
	const questions = parseQuestions(block.args);
	const resolution = block.uiDetails?.askUserQuestion;
	const cancelled = resolution?.cancelled === true;
	const answersByQuestion = new Map<string, string[]>();
	for (const a of resolution?.answers ?? []) answersByQuestion.set(a.question, a.answers);

	return (
		<div className="flex flex-col gap-2">
			{cancelled && (
				<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
					<span className="icon-[mdi--close-circle-outline] size-3.5" />
					用户已取消，未作答
				</div>
			)}
			{questions.map((q, i) => {
				const chosen = answersByQuestion.get(q.question) ?? [];
				return (
					<div key={i} className="rounded-lg border border-border/60 bg-background/40 p-2">
						<div className="mb-1 flex items-center gap-1.5">
							{q.header && (
								<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{q.header}</span>
							)}
							<span className="text-[12px] text-foreground/90">{q.question}</span>
						</div>
						<div className="flex flex-col gap-1">
							{q.options.map((opt) => {
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
										<span>{opt.label}</span>
										{opt.badges?.map((b) => (
											<span key={b} className="rounded-full bg-primary/15 px-1 text-[9px] text-primary">
												{b}
											</span>
										))}
									</div>
								);
							})}
							{/* 自由文本答案（不在 options 内）。 */}
							{chosen
								.filter((c) => !q.options.some((o) => o.label === c))
								.map((custom) => (
									<div
										key={custom}
										className="flex items-center gap-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-foreground"
									>
										<span className="icon-[mdi--pencil] size-3 shrink-0 text-primary" />
										<span>{custom}</span>
									</div>
								))}
						</div>
					</div>
				);
			})}
		</div>
	);
}
