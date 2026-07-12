import type { JSX } from "react";
import { SettingsMenuActionButton } from "./SettingsMenuActionButton";

export interface SettingsMenuDownloadsItemProps {
	label: string;
	activeDownloads: number;
	onOpenDownloads: () => void;
}

export function SettingsMenuDownloadsItem({
	label,
	activeDownloads,
	onOpenDownloads,
}: SettingsMenuDownloadsItemProps): JSX.Element {
	return (
		<SettingsMenuActionButton icon="icon-[solar--download-linear]" onClick={onOpenDownloads}>
			{label}
			{activeDownloads > 0 && (
				<span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
					{activeDownloads}
				</span>
			)}
		</SettingsMenuActionButton>
	);
}
