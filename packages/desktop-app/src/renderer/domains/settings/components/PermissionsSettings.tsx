import { useCallback, useEffect, useState } from "react";
import type { PermissionKind, PermissionStatus, PermissionsSnapshot } from "@preload/api";
import { useTranslation } from "react-i18next";
import { cn } from "@shared/lib/utils";
import { SettingRow, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

interface ItemMeta {
	kind: PermissionKind;
	field: keyof PermissionsSnapshot;
	title: string;
	titleKey: string;
	description: string;
	descKey: string;
	icon: string;
	/** macOS 未开放查询接口的权限项，隐藏状态徽章、按钮恒为「在系统设置中查看」 */
	hideStatus?: boolean;
}

const ITEMS: ItemMeta[] = [
	{
		kind: "full-disk-access",
		field: "fullDiskAccess",
		title: "",
		titleKey: "permFullDiskAccess",
		description: "",
		descKey: "permFullDiskAccessDesc",
		icon: "icon-[mdi--harddisk]",
	},
	{
		kind: "accessibility",
		field: "accessibility",
		title: "",
		titleKey: "permAccessibility",
		description: "",
		descKey: "permAccessibilityDesc",
		icon: "icon-[mdi--gesture-tap]",
	},
	{
		kind: "screen-recording",
		field: "screenRecording",
		title: "",
		titleKey: "permScreenRecording",
		description: "",
		descKey: "permScreenRecordingDesc",
		icon: "icon-[mdi--monitor-screenshot]",
	},
	{
		kind: "notifications",
		field: "notifications",
		title: "",
		titleKey: "permNotifications",
		description: "",
		descKey: "permNotificationsDesc",
		icon: "icon-[mdi--bell-outline]",
		hideStatus: true,
	},
];

const STATUS_TEXT: Record<PermissionStatus, string> = {
	granted: "granted",
	denied: "denied",
	unknown: "unknown",
};

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

function StatusBadge({ status, t }: { status: PermissionStatus; t: (key: string) => string }): JSX.Element {
	return (
		<span className={cn("inline-flex items-center gap-1.5 text-[12px]", STATUS_TEXT_CLASS[status])}>
			<span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
			{t(STATUS_TEXT[status])}
		</span>
	);
}

function PermissionItem({
	meta,
	status,
	last,
	onOpen,
	t,
}: {
	meta: ItemMeta;
	status: PermissionStatus;
	last: boolean;
	onOpen: () => void;
	t: (key: string) => string;
}): JSX.Element {
	const isGranted = status === "granted";
	const buttonLabel = meta.hideStatus || isGranted ? t("checkInSystemSettings") : t("goToAuthorize");
	return (
		<SettingRow
			title={t(meta.titleKey)}
			description={t(meta.descKey)}
			border={!last}
		>
			<div className="flex items-center gap-3">
				{!meta.hideStatus && <StatusBadge status={status} t={t} />}
				<button
					type="button"
					onClick={onOpen}
					className="flex items-center gap-1.5 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
				>
					<span className="icon-[mdi--open-in-new] h-3.5 w-3.5 text-muted-foreground" />
					{meta.hideStatus || isGranted ? t("checkInSystemSettings") : t("goToAuthorize")}
				</button>
			</div>
		</SettingRow>
	);
}

export function PermissionsSettings(): JSX.Element {
	const { t } = useTranslation("settings");
	const [snapshot, setSnapshot] = useState<PermissionsSnapshot | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			setSnapshot(await window.vetta.permissions.checkAll());
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	useEffect(() => {
		void refresh();
		const handler = () => {
			void refresh();
		};
		window.addEventListener("focus", handler);
		return () => {
			window.removeEventListener("focus", handler);
		};
	}, [refresh]);

	const handleOpen = useCallback(async (kind: PermissionKind) => {
		try {
			await window.vetta.permissions.openPane(kind);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-1.5 text-[20px] font-bold text-foreground">{t("permissions")}</h1>
			<p className="mb-6 text-[13px] text-muted-foreground">
				{t("permissionsDescription")}
			</p>

			{error && (
				<div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[12px] text-destructive">
					{error}
				</div>
			)}

			<SettingSection t={t as any} section={SETTINGS_SECTION["permissions-system"]}>
				{ITEMS.map((item, idx) => (
					<PermissionItem
						key={item.kind}
						meta={item}
						status={snapshot ? snapshot[item.field] : "unknown"}
						last={idx === ITEMS.length - 1}
						onOpen={() => void handleOpen(item.kind)}
						t={t as any}
					/>
				))}
			</SettingSection>
		</div>
	);
}
