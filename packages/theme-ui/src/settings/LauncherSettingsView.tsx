import type { JSX } from "react";
import { Button } from "@vetta-org/ui/button";
import { cn } from "@vetta-org/ui/utils";
import { VettaKbd } from "../shared/VettaKbd";
import { SettingHeading, SettingRow, SettingSection, type SettingSectionMeta } from "./SettingChrome";
import { ShortcutRecorderView } from "./ShortcutRecorderView";

export type LauncherPreviewStatusView = "waiting" | "running" | "unread";

export interface LauncherPreviewRowView {
	readonly icon: string;
	readonly title: string;
	readonly meta: string;
	readonly status?: LauncherPreviewStatusView;
}

export interface LauncherPreviewGroupView {
	readonly label: string;
	readonly rows: readonly LauncherPreviewRowView[];
}

export interface LauncherFeatureView {
	readonly icon: string;
	readonly title: string;
	readonly description: string;
}

export interface LauncherSettingsViewLabels {
	readonly title: string;
	readonly subtitle: string;
	/** Hero 底栏：「随时按」+ 键帽 +「唤起启动器」。 */
	readonly pressBefore: string;
	readonly pressAfter: string;
	readonly tryNow: string;
	readonly previewPlaceholder: string;
	readonly status: Record<LauncherPreviewStatusView, string>;
	readonly featuresTitle: string;
	readonly shortcutSectionTitle: string;
	readonly shortcutTitle: string;
	readonly shortcutDescription: string;
	readonly shortcutPlaceholder: string;
	readonly resetLabel: string;
	readonly sidebarHint: string;
}

export interface LauncherSettingsViewProps {
	readonly labels: LauncherSettingsViewLabels;
	readonly previewGroups: readonly LauncherPreviewGroupView[];
	readonly features: readonly LauncherFeatureView[];
	readonly featuresSection: SettingSectionMeta;
	readonly shortcutSection: SettingSectionMeta;
	/** 当前生效的唤起快捷键（"mod+t"）；跟随用户改键。 */
	readonly shortcut: string;
	readonly shortcutIsDefault: boolean;
	readonly onShortcutChange: (shortcut: string) => void;
	readonly onShortcutReset: () => void;
	readonly eventToShortcut: (event: KeyboardEvent) => string | null;
	readonly onOpenLauncher: () => void;
}

const STATUS_CLASS: Record<LauncherPreviewStatusView, string> = {
	waiting: "bg-amber-500/15 text-amber-500",
	running: "bg-primary/10 text-primary",
	unread: "bg-emerald-500/15 text-emerald-500",
};

const STATUS_DOT_CLASS: Record<LauncherPreviewStatusView, string> = {
	waiting: "bg-amber-500",
	running: "bg-primary",
	unread: "bg-emerald-500",
};

/**
 * 设置 → 启动器。
 *
 * ⌘T 面板没有常驻入口，没用过 Arc / Raycast 的人不会下意识去按，这一页负责让人「看见」它：
 * Hero 里放一张静态的面板缩影（不放动效，装饰件宁可静止），底栏给出当前快捷键和「立即试试」；
 * 下面讲它能做什么，最后是改键。缩影里的分组与状态和真实面板同名同色，用户打开后能对上号。
 */
export function LauncherSettingsView({
	labels,
	previewGroups,
	features,
	featuresSection,
	shortcutSection,
	shortcut,
	shortcutIsDefault,
	onShortcutChange,
	onShortcutReset,
	eventToShortcut,
	onOpenLauncher,
}: LauncherSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-8">
			<h1 className="mb-1.5 text-[20px] font-bold text-foreground">{labels.title}</h1>
			<p className="mb-6 text-[13px] leading-relaxed text-muted-foreground">{labels.subtitle}</p>

			<section className="mb-8 overflow-hidden rounded-2xl border border-border bg-card">
				<div className="relative flex justify-center bg-gradient-to-b from-primary/10 via-primary/5 to-transparent px-6 pt-8 pb-6">
					<LauncherPreview
						groups={previewGroups}
						placeholder={labels.previewPlaceholder}
						shortcut={shortcut}
						statusLabels={labels.status}
					/>
				</div>
				<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
					<p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
						<span>{labels.pressBefore}</span>
						<VettaKbd keys={shortcut} size="sm" />
						<span>{labels.pressAfter}</span>
					</p>
					<Button variant="primary" onClick={onOpenLauncher}>
						<span aria-hidden="true" className="icon-[solar--rocket-2-linear] h-3.5 w-3.5" />
						{labels.tryNow}
					</Button>
				</div>
			</section>

			{/*
			 * 单卡片分行，而不是 2×2 网格：网格里各卡描述长短不一，换行后高度参差、末尾常剩孤字；
			 * 整行宽度下每条描述一行放得下，行高一致，也和下面的设置分区是同一种版式。
			 */}
			<div className="mb-6" data-setting-section-highlight-target={featuresSection.id}>
				<SettingHeading section={featuresSection} title={labels.featuresTitle} className="mb-3" />
				<ul className="overflow-hidden rounded-xl border border-border bg-card">
					{features.map((feature) => (
						<li
							key={feature.title}
							className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
						>
							<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<span aria-hidden="true" className={cn(feature.icon, "h-4 w-4")} />
							</span>
							<div className="min-w-0 flex-1">
								<div className="text-[13px] font-medium text-foreground">{feature.title}</div>
								<p className="mt-0.5 text-[12px] text-muted-foreground">{feature.description}</p>
							</div>
						</li>
					))}
				</ul>
			</div>

			<SettingSection section={shortcutSection} title={labels.shortcutSectionTitle}>
				<SettingRow title={labels.shortcutTitle} description={labels.shortcutDescription} border={false}>
					<ShortcutRecorderView
						value={shortcut}
						isDefault={shortcutIsDefault}
						onChange={onShortcutChange}
						onReset={onShortcutReset}
						placeholder={labels.shortcutPlaceholder}
						resetLabel={labels.resetLabel}
						eventToShortcut={eventToShortcut}
					/>
				</SettingRow>
			</SettingSection>
			<p className="-mt-3 flex items-center gap-1.5 px-1 text-[12px] text-muted-foreground/70">
				<span aria-hidden="true" className="icon-[solar--magnifer-linear] h-3 w-3" />
				{labels.sidebarHint}
			</p>
		</div>
	);
}

/** 面板缩影：纯展示，不可交互，读屏器只需知道这是一张示意图。 */
function LauncherPreview({
	groups,
	placeholder,
	shortcut,
	statusLabels,
}: {
	groups: readonly LauncherPreviewGroupView[];
	placeholder: string;
	shortcut: string;
	statusLabels: LauncherSettingsViewLabels["status"];
}): JSX.Element {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none w-full max-w-[440px] select-none overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
		>
			<div className="flex h-11 items-center gap-2.5 border-b border-border/60 px-3.5">
				<span className="icon-[solar--magnifer-linear] h-4 w-4 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground/70">{placeholder}</span>
				<VettaKbd keys={shortcut} variant="flat" />
			</div>
			<div className="px-1.5 pt-1.5 pb-2">
				{groups.map((group) => (
					<div key={group.label} className="mb-1 last:mb-0">
						<div className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground/70">
							{group.label}
						</div>
						{group.rows.map((row, index) => (
							<div
								key={row.title}
								className={cn(
									"flex h-9 items-center gap-2.5 rounded-lg px-2.5",
									// 第一行模拟键盘选中态，让人一眼看出「回车就打开它」。
									group === groups[0] && index === 0 && "bg-accent",
								)}
							>
								<span className={cn(row.icon, "h-4 w-4 shrink-0 text-muted-foreground")} />
								<span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{row.title}</span>
								{row.status ? (
									<span
										className={cn(
											"inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
											STATUS_CLASS[row.status],
										)}
									>
										<span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_CLASS[row.status])} />
										{statusLabels[row.status]}
									</span>
								) : null}
								<span className="shrink-0 text-[11px] text-muted-foreground/60">{row.meta}</span>
							</div>
						))}
					</div>
				))}
			</div>
		</div>
	);
}
