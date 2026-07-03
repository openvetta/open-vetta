import type { PendingQuestion } from "@shared/store/atoms";

export interface QuestionPanelProps {
	pending: PendingQuestion;
	className?: string;
	classNames?: QuestionPanelClassNames;
}

export interface QuestionPanelClassNames {
	root?: string;
	panel?: string;
	content?: string;
	body?: string;
	footer?: string;
}

export interface QuestionPanelViewProps extends QuestionPanelProps {
	onSubmitAnswers: (answers: Array<{ question: string; answers: string[] }>) => void;
	onCancel: () => void;
}
