import { MacKeyboardPreview } from "@shared/components/MacKeyboardPreview";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { Switch } from "@shared/components/ui/switch";
import { cn } from "@shared/lib/utils";
import type { PermissionStatus } from "@preload/api";
import { Trans } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import { SettingRow, SettingSection } from "./shared";
import type { AppshotSelectValue, AppshotSettingsModel } from "./useAppshotSettingsModel";

const STATUS_DOT: Record<PermissionStatus, string> = {
	granted: "bg-emerald-500",
	denied: "bg-amber-500",
	unknown: "bg-muted-foreground/50",
};

const STATUS_TEXT_CLASS: Record<PermissionStatus, string> = {
	granted: "text-emerald-500",
	denied: "text-amber-500",
	unknown: "text-muted-foreground",
};

function StatusBadge({
	labels,
	status,
}: {
	labels: AppshotSettingsModel["labels"]["status"];
	status: PermissionStatus;
}): JSX.Element {
	return (
		<span className={cn("inline-flex items-center gap-1.5 text-[12px]", STATUS_TEXT_CLASS[status])}>
			<span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
			{labels[status]}
		</span>
	);
}

function AppshotShortcutSection({ model }: { model: AppshotSettingsModel }): JSX.Element {
	return (
		<SettingSection title={model.labels.sectionShortcut} section={SETTINGS_SECTION["appshot-gesture"]}>
			<SettingRow title={model.labels.shortcutTitle} description={model.labels.shortcutDescription} border={false}>
				<Select value={model.value} onValueChange={(value) => void model.actions.changeGesture(value as AppshotSelectValue)}>
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
			</SettingRow>
		</SettingSection>
	);
}

function AppshotPermissionsSection({ model }: { model: AppshotSettingsModel }): JSX.Element {
	return (
		<SettingSection
			title={model.labels.sectionPermissions}
			section={SETTINGS_SECTION["appshot-permissions"]}
			description={model.labels.permissionSectionDescription}
		>
			<SettingRow title={model.labels.permissions.accessibilityTitle} description={model.labels.permissions.accessibilityDescription}>
				<StatusBadge status={model.snapshot ? model.snapshot.accessibility : "unknown"} labels={model.labels.status} />
			</SettingRow>
			<SettingRow title={model.labels.permissions.screenTitle} description={model.labels.permissions.screenDescription}>
				<StatusBadge status={model.snapshot ? model.snapshot.screenRecording : "unknown"} labels={model.labels.status} />
			</SettingRow>
			<div className="flex items-center justify-between gap-4 px-5 py-4 @max-xl:flex-col @max-xl:items-stretch">
				<p className="text-[12px] text-muted-foreground">{model.labels.permissionHint}</p>
				<button
					type="button"
					onClick={model.actions.openOnboarding}
					className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					<span className="icon-[mdi--shield-key-outline] h-3.5 w-3.5" />
					{model.labels.setupPermissions}
				</button>
			</div>
		</SettingSection>
	);
}

export function AppshotSettingsView({ model }: { model: AppshotSettingsModel }): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-1.5 flex items-center gap-2">
				<h1 className="text-[20px] font-bold text-foreground">{model.labels.title}</h1>
				<span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
					{model.labels.betaBadge}
				</span>
			</div>
			<p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">
				<Trans
					i18nKey="appshotPageSubtitle"
					ns="settings"
					components={{
						hl: <span className="rounded-[4px] bg-primary/10 px-1 font-medium text-primary" />,
					}}
				/>
			</p>

			<AppshotShortcutSection model={model} />

			{model.value !== "none" && (
				<div className="mb-6 px-1.5">
					<MacKeyboardPreview highlightKeys={model.highlightKeys} />
				</div>
			)}

			<AppshotPermissionsSection model={model} />
		</div>
	);
}
