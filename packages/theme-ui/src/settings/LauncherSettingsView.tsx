import { ButtonGroup, ButtonGroupItem } from "@vetta-org/ui/button-group";
import { Button } from "@vetta-org/ui/button";
import { cn, GLASS_PANEL_CLASS } from "@vetta-org/ui/utils";
import { LayoutGroup } from "motion/react";
import type { JSX } from "react";
import { CommandMenuRow } from "../overlays/CommandMenuRow";
import { COMMAND_MENU_FLOATING_GROUP_CLASS } from "../overlays/CommandMenuView";
import { SplashInputHeader } from "../overlays/SplashParts";
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
	/** 预览底部按钮组的文案，与真实面板同一套（「新会话」「打开」「关闭」）。 */
	readonly previewNewSession: string;
	readonly previewOpen: string;
	readonly previewClose: string;
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

/**
 * 设置 → 启动器。
 *
 * ⌘T 面板没有常驻入口，没用过 Arc / Raycast 的人不会下意识去按，这一页负责让人「看见」它：
 * Hero 里把真实面板放在液态渐变底上（静止，装饰件宁可不动），底栏给出当前快捷键和「立即试试」；
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
				<div className="relative px-6 pt-10 pb-8">
					<LiquidBackdrop />
					<LauncherPreview groups={previewGroups} labels={labels} shortcut={shortcut} />
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

/**
 * 面板缩影：直接用真实面板的部件（玻璃底、输入头、行、浮动按钮组），只把交互关掉，
 * 这样面板改版时预览自动跟上，不会与真实 UI 走样。
 *
 * - inert：整块不进 Tab 顺序、不响应点击；aria-hidden 让读屏器只当它是示意图。
 * - LayoutGroup：真实面板的选中条用 layoutId 做滑动，不隔开的话打开 ⌘T 时选中条会从预览里「飞」过去。
 * - 静止：行首状态图标在真实面板里会转 / 呼吸，预览里一律停住（装饰件宁可静止，毛玻璃窗口每帧都要重合成）。
 */
function LauncherPreview({
	groups,
	labels,
	shortcut,
}: {
	groups: readonly LauncherPreviewGroupView[];
	labels: LauncherSettingsViewLabels;
	shortcut: string;
}): JSX.Element {
	const firstId = groups[0]?.rows[0] ? rowId(0, 0) : undefined;
	return (
		<div aria-hidden="true" inert className="relative flex w-full select-none justify-center [&_*]:animate-none!">
			<LayoutGroup id="launcher-settings-preview">
				<div className={cn("relative w-full max-w-[460px] overflow-hidden rounded-2xl", GLASS_PANEL_CLASS)}>
					<SplashInputHeader
						icon="icon-[solar--magnifer-linear]"
						label={labels.title}
						value=""
						placeholder={labels.previewPlaceholder}
						onChange={noop}
						autoFocus={false}
						inputProps={{ readOnly: true, tabIndex: -1 }}
						trailing={<VettaKbd keys={shortcut} size="sm" variant="flat" />}
					/>
					<div className="relative px-1.5 pt-1.5 pb-14">
						{groups.map((group, groupIndex) => (
							<div key={group.label} className="mb-1 last:mb-0">
								<div className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground/70">
									{group.label}
								</div>
								{group.rows.map((row, index) => (
									<CommandMenuRow
										key={row.title}
										item={{
											id: rowId(groupIndex, index),
											title: row.title,
											titleHighlights: [],
											subtitle: row.meta,
											icon: row.icon,
											status: row.status,
											statusLabel: row.status ? labels.status[row.status] : undefined,
										}}
										active={rowId(groupIndex, index) === firstId}
										suppressSelectionAnimation
										onActivate={noop}
										onHover={noop}
										registerRef={noop}
									/>
								))}
							</div>
						))}
						<div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2">
							<ButtonGroup className={COMMAND_MENU_FLOATING_GROUP_CLASS}>
								<ButtonGroupItem
									tabIndex={-1}
									aria-label={labels.previewNewSession}
									icon={<span aria-hidden="true" className="icon-[solar--pen-new-square-linear] size-4" />}
								/>
							</ButtonGroup>
							<ButtonGroup className={COMMAND_MENU_FLOATING_GROUP_CLASS}>
								<ButtonGroupItem
									tabIndex={-1}
									label={
										<span className="inline-flex items-center gap-2">
											{labels.previewOpen}
											<VettaKbd keys="enter" size="sm" variant="flat" />
										</span>
									}
								/>
								<ButtonGroupItem
									tabIndex={-1}
									label={
										<span className="inline-flex items-center gap-2">
											{labels.previewClose}
											<VettaKbd keys="esc" size="sm" variant="flat" />
										</span>
									}
								/>
							</ButtonGroup>
						</div>
					</div>
				</div>
			</LayoutGroup>
		</div>
	);
}

/**
 * 液态渐变底：几团互相交叠的模糊色斑，给玻璃面板一个有颜色起伏的背景，模糊与饱和度增强才看得出来。
 * 只用主题色与语义白名单里的 emerald / amber；静止不动。深色下整体压一档，避免色斑透过玻璃发刺。
 */
function LiquidBackdrop(): JSX.Element {
	return (
		<div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden bg-muted/40 dark:opacity-80">
			<span className="absolute -top-20 -left-12 h-64 w-64 rounded-full bg-primary/60 blur-3xl" />
			<span className="absolute top-10 -right-16 h-56 w-72 rounded-full bg-emerald-500/40 blur-3xl" />
			<span className="absolute -bottom-24 left-1/4 h-60 w-80 rounded-full bg-amber-500/40 blur-3xl" />
			<span className="absolute right-1/4 bottom-6 h-36 w-36 rounded-full bg-primary/40 blur-2xl" />
			<span className="absolute top-1/3 left-1/3 h-28 w-40 rounded-full bg-emerald-500/30 blur-2xl" />
		</div>
	);
}

function rowId(group: number, row: number): string {
	return `preview-${group}-${row}`;
}

function noop(): void {}
