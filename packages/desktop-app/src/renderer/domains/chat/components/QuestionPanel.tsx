import { useThemeComponent } from "@vetta/theme-sdk";
import { useQuestionPanelModel } from "../hooks/useQuestionPanelModel";
import { QuestionPanelView } from "./question-panel/QuestionPanelView";
import type { QuestionPanelProps } from "./question-panel/types";

export function QuestionPanel({ pending, className, classNames }: QuestionPanelProps): JSX.Element {
	const model = useQuestionPanelModel(pending);
	const ThemedQuestionPanelView = useThemeComponent("chat.questionPanelView", QuestionPanelView);

	return (
		<ThemedQuestionPanelView
			pending={pending}
			className={className}
			classNames={classNames}
			onSubmitAnswers={model.onSubmitAnswers}
			onCancel={model.onCancel}
		/>
	);
}

export type { QuestionPanelProps, QuestionPanelViewProps } from "./question-panel/types";
