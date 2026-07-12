import { MacKeyboardPreview } from "@shared/components/MacKeyboardPreview";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { AppshotSettingsView as ThemeAppshotSettingsView } from "@vetta/theme-ui/settings";
import { Trans } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import type { AppshotSelectValue, AppshotSettingsModel } from "./useAppshotSettingsModel";

export function AppshotSettingsView({ model }: { model: AppshotSettingsModel }): JSX.Element {
	return (
		<ThemeAppshotSettingsView
			labels={model.labels}
			subtitle={
				<Trans
					i18nKey="appshotPageSubtitle"
					ns="settings"
					components={{
						hl: <span className="rounded-[4px] bg-primary/10 px-1 font-medium text-primary" />,
					}}
				/>
			}
			gestureSection={SETTINGS_SECTION["appshot-gesture"]}
			permissionsSection={SETTINGS_SECTION["appshot-permissions"]}
			showKeyboardPreview={model.value !== "none"}
			keyboardPreview={<MacKeyboardPreview highlightKeys={model.highlightKeys} />}
			gestureControl={
				<Select
					value={model.value}
					onValueChange={(value) => void model.actions.changeGesture(value as AppshotSelectValue)}
				>
					<SelectTrigger size="sm" className="h-8 min-w-[150px] border-border/70 bg-background/50 text-[12px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{model.options.map((option) => (
							<SelectItem key={option.value} value={option.value} className="text-[12px]">
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			}
			accessibilityStatus={model.snapshot ? model.snapshot.accessibility : "unknown"}
			screenStatus={model.snapshot ? model.snapshot.screenRecording : "unknown"}
			onOpenOnboarding={model.actions.openOnboarding}
		/>
	);
}
