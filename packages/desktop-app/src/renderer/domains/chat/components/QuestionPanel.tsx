import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { useThemeComponent } from "@vetta/theme-sdk";
import { pendingQuestionsAtom } from "@shared/store/atoms";
import { QuestionPanelView } from "./question-panel/QuestionPanelView";
import type { QuestionPanelProps } from "./question-panel/types";

export function QuestionPanel({ pending, className, classNames }: QuestionPanelProps): JSX.Element {
	const setPendingQuestions = useSetAtom(pendingQuestionsAtom);
	const ThemedQuestionPanelView = useThemeComponent("chat.questionPanelView", QuestionPanelView);

	const remove = useCallback(() => {
		setPendingQuestions((prev) => {
			const next = { ...prev };
			delete next[pending.sessionId];
			return next;
		});
	}, [pending.sessionId, setPendingQuestions]);

	const handleSubmitAnswers = useCallback(
		(answers: Array<{ question: string; answers: string[] }>) => {
			void window.vetta.session.respondToQuestion(pending.requestId, { cancelled: false, answers });
			remove();
		},
		[pending.requestId, remove],
	);

	const handleCancel = useCallback(() => {
		void window.vetta.session.respondToQuestion(pending.requestId, { cancelled: true, answers: [] });
		remove();
	}, [pending.requestId, remove]);

	return (
		<ThemedQuestionPanelView
			pending={pending}
			className={className}
			classNames={classNames}
			onSubmitAnswers={handleSubmitAnswers}
			onCancel={handleCancel}
		/>
	);
}

export type { QuestionPanelProps, QuestionPanelViewProps } from "./question-panel/types";
