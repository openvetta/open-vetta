import type { JSX } from "react";
import { SettingsMenuActionButton } from "./SettingsMenuActionButton";

export interface AddProjectMenuItemProps {
	icon: string;
	/** Fully resolved label (host i18n). */
	label: string;
	onSelect: () => void;
}

/** 与底部设置菜单共用同一个菜单项，保证全局下拉样式一致。 */
export function AddProjectMenuItem({ icon, label, onSelect }: AddProjectMenuItemProps): JSX.Element {
	return (
		<SettingsMenuActionButton icon={icon} onClick={onSelect}>
			{label}
		</SettingsMenuActionButton>
	);
}
