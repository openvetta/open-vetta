import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Popover, PopoverTrigger } from "@shared/components/ui/popover";
import { useThemeComponent } from "@shared/theme/module";
import { SettingsMenuPopover } from "./SettingsMenuPopover";
import { SettingsMenuTrigger } from "./SettingsMenuTrigger";
import { useRefreshBillingOnOpen, useSettingsMenuModel } from "./useSettingsMenuModel";

export function SettingsMenu(): JSX.Element {
	const [open, setOpen] = useState(false);
	const model = useSettingsMenuModel(open, setOpen);
	const refreshBillingOnOpen = useRefreshBillingOnOpen();
	const ThemeSettingsMenuTrigger = useThemeComponent("sidebar.settingsTrigger", SettingsMenuTrigger);

	const handleOpenChange = (next: boolean): void => {
		model.actions.setOpen(next);
		refreshBillingOnOpen(next, model.user !== null);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<ThemeSettingsMenuTrigger model={model} />
			</PopoverTrigger>
			<AnimatePresence>
				{open && <SettingsMenuPopover model={model} />}
			</AnimatePresence>
		</Popover>
	);
}
