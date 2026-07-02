import type { ComponentPropsWithoutRef } from "react";

export type WindowControlKind = "close" | "maximize" | "minimize" | "restore";

export interface WindowControlItem {
	action: () => void;
	kind: WindowControlKind;
	label: string;
}

export interface WindowControlsModel {
	controls: WindowControlItem[];
	isMac: boolean;
	isMaximized: boolean;
}

export interface WindowControlsProps {
	className?: string;
	classNames?: {
		button?: string;
		closeButton?: string;
		icon?: string;
	};
}

export interface WindowControlsComponentProps extends WindowControlsProps {
	model: WindowControlsModel;
}

export interface WindowControlButtonProps extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
	control: WindowControlItem;
	iconClassName?: string;
}
