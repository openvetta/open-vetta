import type { PendingQuestion } from "@shared/store/atoms";
import { pendingQuestionsAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useCallback } from "react";

export interface QuestionPanelModel {
	onSubmitAnswers: (answers: Array<{ question: string; answers: string[] }>) => void;
	onCancel: () => void;
}

export function useQuestionPanelModel(pending: PendingQuestion): QuestionPanelModel {
	const setPendingQuestions = useSetAtom(pendingQuestionsAtom);

	const remove = useCallback(() => {
		setPendingQuestions((prev) => {
			const next = { ...prev };
			delete next[pending.sessionId];
			return next;
		});
	}, [pending.sessionId, setPendingQuestions]);

	const onSubmitAnswers = useCallback(
		(answers: Array<{ question: string; answers: string[] }>) => {
			void window.vetta.session.respondToQuestion(pending.requestId, { cancelled: false, answers });
			remove();
		},
		[pending.requestId, remove],
	);

	const onCancel = useCallback(() => {
		void window.vetta.session.respondToQuestion(pending.requestId, { cancelled: true, answers: [] });
		remove();
	}, [pending.requestId, remove]);

	return { onSubmitAnswers, onCancel };
}
