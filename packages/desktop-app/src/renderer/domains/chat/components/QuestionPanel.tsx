import { useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { type PendingQuestion, pendingQuestionsAtom, type QuestionItem } from "@shared/store/atoms";

interface QuestionPanelProps {
	pending: PendingQuestion;
}

interface QState {
	/** 选中的选项 label 集合（单选时最多 1 个）。 */
	selected: string[];
	/** Other 自由文本。 */
	otherText: string;
	/** Other 输入是否激活。 */
	otherActive: boolean;
}

function emptyState(): QState {
	return { selected: [], otherText: "", otherActive: false };
}

/** 该问题的最终答案：选中标签 + （激活且非空的）Other 文本。 */
function answersOf(state: QState): string[] {
	const out = [...state.selected];
	const other = state.otherText.trim();
	if (state.otherActive && other) out.push(other);
	return out;
}

function isAnswered(state: QState): boolean {
	return answersOf(state).length > 0;
}

/**
 * ask_user_question 的「问答面板」：待答时接管输入栏。多问题以紧凑可折叠的堆叠列表
 * 呈现、可自由切换；已答的问题折叠成所选答案摘要。逃生出口=取消按钮 + 每题 Other。
 */
export function QuestionPanel({ pending }: QuestionPanelProps): JSX.Element {
	const setPendingQuestions = useSetAtom(pendingQuestionsAtom);
	const questions = pending.questions;
	const [states, setStates] = useState<QState[]>(() => questions.map(() => emptyState()));
	const [expanded, setExpanded] = useState(0);
	const [submitting, setSubmitting] = useState(false);

	const allAnswered = useMemo(() => states.every(isAnswered), [states]);

	const remove = useCallback(() => {
		setPendingQuestions((prev) => {
			const next = { ...prev };
			delete next[pending.sessionId];
			return next;
		});
	}, [pending.sessionId, setPendingQuestions]);

	const submit = useCallback(() => {
		if (!allAnswered || submitting) return;
		setSubmitting(true);
		const answers = questions.map((q, i) => ({ question: q.question, answers: answersOf(states[i]) }));
		void window.vetta.session.respondToQuestion(pending.requestId, { cancelled: false, answers });
		remove();
	}, [allAnswered, submitting, questions, states, pending.requestId, remove]);

	const cancel = useCallback(() => {
		if (submitting) return;
		setSubmitting(true);
		void window.vetta.session.respondToQuestion(pending.requestId, { cancelled: true, answers: [] });
		remove();
	}, [submitting, pending.requestId, remove]);

	const toggleOption = useCallback(
		(qIndex: number, label: string, multiSelect: boolean) => {
			setStates((prev) =>
				prev.map((s, i) => {
					if (i !== qIndex) return s;
					if (multiSelect) {
						const has = s.selected.includes(label);
						return { ...s, selected: has ? s.selected.filter((l) => l !== label) : [...s.selected, label] };
					}
					// 单选：选中即替换，并关闭 Other。
					return { ...s, selected: [label], otherActive: false };
				}),
			);
			// 单选答完自动前进到下一题。
			if (!multiSelect && qIndex < questions.length - 1) setExpanded(qIndex + 1);
		},
		[questions.length],
	);

	const activateOther = useCallback((qIndex: number, multiSelect: boolean) => {
		setStates((prev) =>
			prev.map((s, i) => {
				if (i !== qIndex) return s;
				// 单选下激活 Other 清掉已选项。
				return { ...s, otherActive: true, selected: multiSelect ? s.selected : [] };
			}),
		);
	}, []);

	const setOtherText = useCallback((qIndex: number, text: string) => {
		setStates((prev) => prev.map((s, i) => (i === qIndex ? { ...s, otherText: text, otherActive: true } : s)));
	}, []);

	return (
		<div className="relative mx-auto w-full max-w-2xl px-2 pb-3 pt-1 sm:px-4 sm:pb-4">
			<div className="rounded-[20px] border border-primary/30 bg-card p-3 shadow-sm">
				<div className="mb-2 flex items-center gap-2 px-1">
					<span className="icon-[mdi--comment-question-outline] size-4 text-primary" />
					<span className="text-sm font-medium text-foreground">Vetta 需要你的选择</span>
					{questions.length > 1 && (
						<span className="text-xs text-muted-foreground">
							{states.filter(isAnswered).length}/{questions.length}
						</span>
					)}
				</div>

				<div className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto">
					{questions.map((q, qIndex) => (
						<QuestionRow
							key={qIndex}
							question={q}
							state={states[qIndex]}
							isExpanded={expanded === qIndex}
							onHeaderClick={() => setExpanded(expanded === qIndex ? -1 : qIndex)}
							onToggleOption={(label) => toggleOption(qIndex, label, q.multiSelect ?? false)}
							onActivateOther={() => activateOther(qIndex, q.multiSelect ?? false)}
							onOtherText={(text) => setOtherText(qIndex, text)}
						/>
					))}
				</div>

				<div className="mt-3 flex items-center justify-end gap-2">
					<Button variant="ghost" size="sm" onClick={cancel} disabled={submitting}>
						取消
					</Button>
					<Button size="sm" onClick={submit} disabled={!allAnswered || submitting}>
						提交
					</Button>
				</div>
			</div>
		</div>
	);
}

interface QuestionRowProps {
	question: QuestionItem;
	state: QState;
	isExpanded: boolean;
	onHeaderClick: () => void;
	onToggleOption: (label: string) => void;
	onActivateOther: () => void;
	onOtherText: (text: string) => void;
}

function QuestionRow({
	question,
	state,
	isExpanded,
	onHeaderClick,
	onToggleOption,
	onActivateOther,
	onOtherText,
}: QuestionRowProps): JSX.Element {
	const answered = isAnswered(state);
	const summary = answersOf(state).join("、");
	const multiSelect = question.multiSelect ?? false;

	return (
		<div className="rounded-xl border border-border bg-background/40">
			<button
				type="button"
				onClick={onHeaderClick}
				className="flex w-full items-center gap-2 px-3 py-2 text-left"
			>
				<span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
					{question.header}
				</span>
				<span className="min-w-0 flex-1 truncate text-sm text-foreground">
					{isExpanded ? question.question : answered ? summary : question.question}
				</span>
				{answered && !isExpanded && <span className="icon-[mdi--check-circle] size-4 shrink-0 text-primary" />}
				<span
					className={`icon-[mdi--chevron-down] size-4 shrink-0 text-muted-foreground transition-transform ${
						isExpanded ? "rotate-180" : ""
					}`}
				/>
			</button>

			{isExpanded && (
				<div className="flex flex-col gap-1.5 px-3 pb-3">
					{multiSelect && <p className="text-xs text-muted-foreground">可多选</p>}
					{question.options.map((opt) => {
						const selected = state.selected.includes(opt.label);
						return (
							<button
								key={opt.label}
								type="button"
								onClick={() => onToggleOption(opt.label)}
								className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
									selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
								}`}
							>
								<div className="flex items-center gap-2">
									<span
										className={`size-3.5 shrink-0 ${
											selected
												? multiSelect
													? "icon-[mdi--checkbox-marked] text-primary"
													: "icon-[mdi--radiobox-marked] text-primary"
												: multiSelect
													? "icon-[mdi--checkbox-blank-outline] text-muted-foreground"
													: "icon-[mdi--radiobox-blank] text-muted-foreground"
										}`}
									/>
									<span className="text-sm font-medium text-foreground">{opt.label}</span>
									{opt.badges?.map((badge) => (
										<span
											key={badge}
											className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary"
										>
											{badge}
										</span>
									))}
								</div>
								{opt.description && (
									<span className="pl-5 text-xs text-muted-foreground">{opt.description}</span>
								)}
							</button>
						);
					})}

					{/* Other 自由输入：总是可用 */}
					<div
						className={`flex flex-col gap-1 rounded-lg border px-3 py-2 ${
							state.otherActive ? "border-primary bg-primary/5" : "border-dashed border-border"
						}`}
					>
						<button
							type="button"
							onClick={onActivateOther}
							className="flex items-center gap-2 text-left text-sm text-muted-foreground"
						>
							<span className="icon-[mdi--pencil-outline] size-3.5 shrink-0" />
							其它（自定义输入）
						</button>
						{state.otherActive && (
							<Input
								autoFocus
								value={state.otherText}
								onChange={(e) => onOtherText(e.target.value)}
								placeholder="输入你的答案…"
								className="h-8"
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
