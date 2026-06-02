import { useCallback, useEffect, useState } from "react";
import type { PermissionKind, PermissionStatus, PermissionsSnapshot } from "@preload/api";
import { cn } from "@shared/lib/utils";
import { SettingRow, SettingSection } from "./shared";

interface ItemMeta {
	kind: PermissionKind;
	field: keyof PermissionsSnapshot;
	title: string;
	description: string;
	icon: string;
	/** macOS 未开放查询接口的权限项，隐藏状态徽章、按钮恒为「在系统设置中查看」 */
	hideStatus?: boolean;
}

const ITEMS: ItemMeta[] = [
	{
		kind: "full-disk-access",
		field: "fullDiskAccess",
		title: "完全磁盘访问",
		description: "允许 Vetta 读写项目目录之外的文件，未授权时 macOS 会静默拦截。",
		icon: "icon-[mdi--harddisk]",
	},
	{
		kind: "accessibility",
		field: "accessibility",
		title: "辅助功能",
		description: "用于注册全局快捷键、读取前台 App 上下文。",
		icon: "icon-[mdi--gesture-tap]",
	},
	{
		kind: "notifications",
		field: "notifications",
		title: "通知",
		description: "任务完成、错误等以 macOS 系统通知形式提醒你。",
		icon: "icon-[mdi--bell-outline]",
		hideStatus: true,
	},
];

const STATUS_TEXT: Record<PermissionStatus, string> = {
	granted: "已授权",
	denied: "未授权",
	unknown: "未知",
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

function StatusBadge({ status }: { status: PermissionStatus }): JSX.Element {
	return (
		<span className={cn("inline-flex items-center gap-1.5 text-[12px]", STATUS_TEXT_CLASS[status])}>
			<span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
			{STATUS_TEXT[status]}
		</span>
	);
}

function PermissionItem({
	meta,
	status,
	last,
	onOpen,
}: {
	meta: ItemMeta;
	status: PermissionStatus;
	last: boolean;
	onOpen: () => void;
}): JSX.Element {
	const isGranted = status === "granted";
	const buttonLabel = meta.hideStatus || isGranted ? "在系统设置中查看" : "去授权";
	return (
		<SettingRow
			title={meta.title}
			description={meta.description}
			border={!last}
		>
			<div className="flex items-center gap-3">
				{!meta.hideStatus && <StatusBadge status={status} />}
				<button
					type="button"
					onClick={onOpen}
					className="flex items-center gap-1.5 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
				>
					<span className="icon-[mdi--open-in-new] h-3.5 w-3.5 text-muted-foreground" />
					{buttonLabel}
				</button>
			</div>
		</SettingRow>
	);
}

export function PermissionsSettings(): JSX.Element {
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
			<h1 className="mb-1.5 text-[20px] font-bold text-foreground">权限管理</h1>
			<p className="mb-6 text-[13px] text-muted-foreground">
				Vetta 在 macOS 上需要以下系统权限才能完整工作
			</p>

			{error && (
				<div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[12px] text-destructive">
					{error}
				</div>
			)}

			<SettingSection title="系统权限">
				{ITEMS.map((item, idx) => (
					<PermissionItem
						key={item.kind}
						meta={item}
						status={snapshot ? snapshot[item.field] : "unknown"}
						last={idx === ITEMS.length - 1}
						onOpen={() => void handleOpen(item.kind)}
					/>
				))}
			</SettingSection>
		</div>
	);
}
