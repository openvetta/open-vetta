import type { SessionExecutionMode } from "@shared/store/atoms";

export interface ExecutionModeOptionModel {
	mode: SessionExecutionMode;
	icon: string;
	label: string;
	title: string;
	disabled: boolean;
	selected: boolean;
}

export interface ExecutionModeSelectorViewProps {
	open: boolean;
	disabled: boolean;
	selectedOption: ExecutionModeOptionModel;
	options: ExecutionModeOptionModel[];
	className?: string;
	classNames?: {
		root?: string;
		trigger?: string;
		content?: string;
		contentInner?: string;
		item?: string;
	};
	onOpenChange: (open: boolean) => void;
	onSelect: (mode: SessionExecutionMode) => void;
}
