import type { JSX, ReactNode } from "react";
import type { SettingSectionMeta } from "./SettingChrome";
import { SettingHeading } from "./SettingChrome";

export interface TeamSettingsViewProps {
	readonly tokenPresent: boolean;
	readonly loginRequiredLabel: string;
	readonly description: string;
	readonly section: SettingSectionMeta;
	/** Host join/create Buttons. */
	readonly headerActions: ReactNode;
	/** Team list or detail body. */
	readonly body: ReactNode;
	/** Host create/join dialogs. */
	readonly dialogs: ReactNode;
}

export function TeamSettingsView({
	tokenPresent,
	loginRequiredLabel,
	description,
	section,
	headerActions,
	body,
	dialogs,
}: TeamSettingsViewProps): JSX.Element {
	if (!tokenPresent) {
		return <div className="p-6 text-center text-[13px] text-muted-foreground">{loginRequiredLabel}</div>;
	}

	return (
		<div className="mx-auto w-full max-w-2xl space-y-6 px-8 pb-12">
			<div className="flex items-center justify-between">
				<div>
					<SettingHeading section={section} className="text-[18px] font-bold" />
					<p className="mt-1 text-[12px] text-muted-foreground">{description}</p>
				</div>
				<div className="flex gap-2">{headerActions}</div>
			</div>
			{body}
			{dialogs}
		</div>
	);
}
