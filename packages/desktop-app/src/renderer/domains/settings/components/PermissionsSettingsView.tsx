import type { Button } from "@shared/components/ui/button";
type HostButton = typeof Button;
export type { HostButton as _HostPrimitiveHoldButton };
import type { PermissionStatus } from "@preload/api";
import { cn } from "@shared/lib/utils";
import { SETTINGS_SECTION } from "../registry";
import { SettingRow, SettingSection } from "./shared";
import type { PermissionItemModel, PermissionsSettingsModel } from "./usePermissionsSettingsModel";

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
	labels: PermissionsSettingsModel["labels"]["status"];
	status: PermissionStatus;
}): JSX.Element {
	return (
		<span className={cn("inline-flex items-center gap-1.5 text-[12px]", STATUS_TEXT_CLASS[status])}>
			<span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
			{labels[status]}
		</span>
	);
}

function PermissionItem({
	item,
	status,
	last,
	model,
}: {
	item: PermissionItemModel;
	last: boolean;
	model: PermissionsSettingsModel;
	status: PermissionStatus;
}): JSX.Element {
	const isGranted = status === "granted";
	const buttonLabel = item.hideStatus || isGranted ? model.labels.checkInSystemSettings : model.labels.goToAuthorize;
	return (
		<SettingRow title={item.title} description={item.description} border={!last}>
			<div className="flex items-center gap-3">
				{!item.hideStatus && <StatusBadge status={status} labels={model.labels.status} />}
				<button
					type="button"
					onClick={() => void model.actions.open(item.kind)}
					className="flex items-center gap-1.5 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
				>
					<span className="icon-[mdi--open-in-new] h-3.5 w-3.5 text-muted-foreground" />
					{buttonLabel}
				</button>
			</div>
		</SettingRow>
	);
}

export function PermissionsSettingsView({ model }: { model: PermissionsSettingsModel }): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-1.5 text-[20px] font-bold text-foreground">{model.labels.title}</h1>
			<p className="mb-6 text-[13px] text-muted-foreground">{model.labels.subtitle}</p>

			{model.error && (
				<div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[12px] text-destructive">
					{model.error}
				</div>
			)}

			<SettingSection title={model.labels.sectionSystem} section={SETTINGS_SECTION["permissions-system"]}>
				{model.items.map((item, idx) => (
					<PermissionItem
						key={item.kind}
						item={item}
						status={model.snapshot ? model.snapshot[item.field] : "unknown"}
						last={idx === model.items.length - 1}
						model={model}
					/>
				))}
			</SettingSection>
		</div>
	);
}
