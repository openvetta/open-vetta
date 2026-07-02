import { MessageCenter } from "@domains/message/components/MessageCenter";
import { SettingsMenu } from "./settings-menu/SettingsMenu";

export function SidebarBottomBar(): JSX.Element {
	return (
		<div className="flex items-center gap-1 px-1.5 py-1.5">
			<div className="flex-1">
				<SettingsMenu />
			</div>
			<MessageCenter />
		</div>
	);
}
