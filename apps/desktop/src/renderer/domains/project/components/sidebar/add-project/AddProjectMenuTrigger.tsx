import { AddProjectMenuTriggerView } from "@vetta-org/theme-ui/sidebar/AddProjectMenuTriggerView";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { useTranslation } from "react-i18next";
import type { AddProjectMenuProps } from "./types";

interface AddProjectMenuTriggerProps extends ComponentPropsWithoutRef<"button"> {
	open: boolean;
	variant: NonNullable<AddProjectMenuProps["variant"]>;
}

// PopoverTrigger asChild 会注入 ref 与事件处理，需原样转发给按钮。
export const AddProjectMenuTrigger = forwardRef<HTMLButtonElement, AddProjectMenuTriggerProps>(
	function AddProjectMenuTrigger({ open, variant, ...props }, ref): JSX.Element {
		const { t } = useTranslation("project");
		return (
			<AddProjectMenuTriggerView
				ref={ref}
				label={t("actions.newProject")}
				open={open}
				variant={variant}
				{...props}
			/>
		);
	},
);
