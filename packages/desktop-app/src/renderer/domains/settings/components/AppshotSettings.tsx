import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { PermissionStatus, PermissionsSnapshot } from "@preload/api";
import { cn } from "@shared/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { MacKeyboardPreview, type MacKeyId } from "@shared/components/MacKeyboardPreview";
import { SettingRow, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

type AppshotGestureValue = "both-shift" | "both-mod" | "both-alt";
/** 应用快照下拉值：手势三选一 + "none"（不启用）。 */
type AppshotSelectValue = AppshotGestureValue | "none";

/** 应用快照选项：labelKey 存常量、渲染期 t() 解析（不写死文案）。"none" 在最后表示关闭。 */
const APPSHOT_OPTIONS = [
	{ value: "both-mod", labelKey: "appshotGestureBothMod" },
	{ value: "both-alt", labelKey: "appshotGestureBothAlt" },
	{ value: "both-shift", labelKey: "appshotGestureBothShift" },
	{ value: "none", labelKey: "appshotGestureNone" },
] as const satisfies ReadonlyArray<{ value: AppshotSelectValue; labelKey: string }>;

/** 手势 → 键盘预览高亮键（左右同一功能键）。 */
const APPSHOT_HIGHLIGHT: Record<AppshotGestureValue, MacKeyId[]> = {
	"both-shift": ["shift-left", "shift-right"],
	"both-mod": ["command-left", "command-right"],
	"both-alt": ["option-left", "option-right"],
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
			{t(status)}
		</span>
	);
}

/** 触发快捷键：下拉选一组左右功能键（或关闭）。 */
function ShortcutSection({
	value,
	onChange,
	t,
}: {
	value: AppshotSelectValue;
	onChange: (next: AppshotSelectValue) => void;
	t: (key: string, opts?: Record<string, unknown>) => string;
}): JSX.Element {
	const glyphs: Record<AppshotGestureValue, string> = {
		"both-shift": "⇧",
		"both-mod": "⌘",
		"both-alt": "⌥",
	};

	return (
		<SettingSection t={t as any} section={SETTINGS_SECTION["appshot-gesture"]}>
			<SettingRow title={t("appshotShortcutRowTitle")} description={t("appshotShortcutRowDesc")} border={false}>
				<Select value={value} onValueChange={(v) => onChange(v as AppshotSelectValue)}>
					<SelectTrigger size="sm" className="h-8 min-w-[150px] border-border/70 bg-background/50 text-[12px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{APPSHOT_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value} className="text-[12px]">
								{option.value === "none"
									? t(option.labelKey)
									: t(option.labelKey, { key: glyphs[option.value] })}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</SettingRow>
		</SettingSection>
	);
}

/** 权限卡：辅助功能 + 屏幕录制状态，底部 CTA 打开授权引导窗。 */
function PermissionsSection({
	snapshot,
	onSetup,
	t,
}: {
	snapshot: PermissionsSnapshot | null;
	onSetup: () => void;
	t: (key: string) => string;
}): JSX.Element {
	return (
		<SettingSection t={t as any} section={SETTINGS_SECTION["appshot-permissions"]} description={t("appshotPermSectionDesc")}>
			<SettingRow title={t("onboardingPermAccessibility")} description={t("onboardingPermAccessibilityDesc")}>
				<StatusBadge status={snapshot ? snapshot.accessibility : "unknown"} t={t} />
			</SettingRow>
			<SettingRow title={t("onboardingPermScreen")} description={t("onboardingPermScreenDesc")}>
				<StatusBadge status={snapshot ? snapshot.screenRecording : "unknown"} t={t} />
			</SettingRow>
			<div className="flex items-center justify-between gap-4 px-5 py-4 @max-xl:flex-col @max-xl:items-stretch">
				<p className="text-[12px] text-muted-foreground">{t("appshotPermHint")}</p>
				<button
					type="button"
					onClick={onSetup}
					className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					<span className="icon-[mdi--shield-key-outline] h-3.5 w-3.5" />
					{t("appshotSetupPermissions")}
				</button>
			</div>
		</SettingSection>
	);
}

export function AppshotSettings(): JSX.Element {
	const { t } = useTranslation("settings");
	const [value, setValue] = useState<AppshotSelectValue>("none");
	const [snapshot, setSnapshot] = useState<PermissionsSnapshot | null>(null);

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			const appshot = config.appshot;
			const enabled = appshot?.enabled === true;
			const gesture =
				appshot?.gesture === "both-mod" || appshot?.gesture === "both-alt" ? appshot.gesture : "both-shift";
			setValue(enabled ? gesture : "none");
		});
	}, []);

	const refreshPermissions = useCallback(async () => {
		try {
			setSnapshot(await window.vetta.permissions.checkAll());
		} catch (err) {
			console.warn("[AppshotSettings] permissions check failed", err);
		}
	}, []);

	// 挂载即查一次；窗口重新聚焦时刷新（用户可能刚在系统设置/引导窗完成授权）。
	useEffect(() => {
		void refreshPermissions();
		const handler = () => void refreshPermissions();
		window.addEventListener("focus", handler);
		return () => window.removeEventListener("focus", handler);
	}, [refreshPermissions]);

	const openOnboarding = useCallback(() => {
		void window.vetta.appshot.openOnboarding();
	}, []);

	const handleChange = useCallback(
		async (next: AppshotSelectValue) => {
			setValue(next);
			// none=关闭；其余=开启并记录手势。config.set 深合并，关闭时保留上次 gesture。
			await window.vetta.config.set(
				next === "none" ? { appshot: { enabled: false } } : { appshot: { enabled: true, gesture: next } },
			);
			// 让原生双键同按监听按新配置立即启停/切换。
			await window.vetta.appshot.reloadGesture();
			// 开启时若权限未就绪，打开引导窗。
			if (next !== "none") {
				const snap = await window.vetta.permissions.checkAll().catch(() => null);
				setSnapshot(snap);
				if (snap && (snap.accessibility !== "granted" || snap.screenRecording !== "granted")) openOnboarding();
			}
		},
		[openOnboarding],
	);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-1.5 flex items-center gap-2">
				<h1 className="text-[20px] font-bold text-foreground">{t("tabAppshot")}</h1>
				<span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
					{t("betaBadge")}
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

			<ShortcutSection value={value} onChange={(next) => void handleChange(next)} t={t as any} />

			{value !== "none" && (
				<div className="mb-6 px-1.5">
					<MacKeyboardPreview highlightKeys={APPSHOT_HIGHLIGHT[value]} />
				</div>
			)}

			<PermissionsSection snapshot={snapshot} onSetup={openOnboarding} t={t as any} />
		</div>
	);
}
