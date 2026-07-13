import { HorizontalSliceImageDecoration, NineSliceImageFrame } from "@vetta/theme-ui";
import { cn } from "@vetta/ui";
import { motion } from "motion/react";
import { useEffect, useRef, type JSX } from "react";
import { sanctumPageAssets } from "./assets";
import type { RealmDetailView, RealmRequirement } from "./types";

const realmDetailPanelDecoration = {
	borderWidth: "4.25rem",
	repeat: "stretch",
	slice: 180,
} as const;
const realmDetailActionDecoration = {
	height: "100%",
	leftSlice: 36,
	leftWidth: "0.9rem",
	repeat: "stretch",
	rightSlice: 36,
	rightWidth: "0.9rem",
} as const;
const realmDetailBenefits = ["跨任务协同", "综合分析能力", "复杂任务处理"] as const;
const realmDetailRewards = ["能力标签", "推荐工作流", "模板资产"] as const;
const realmDetailActions = [
	{ icon: "icon-[solar--document-add-bold]", label: "去写公文" },
	{ icon: "icon-[solar--book-2-bold]", label: "去知识库" },
	{ icon: "icon-[solar--chart-2-bold]", label: "去分析" },
	{ icon: "icon-[solar--settings-bold]", label: "去自动化" },
] as const;
const realmDetailSources = ["公文写作", "知识库", "数据洞察", "自动化"] as const;
const realmDetailOutcomeIcons = [
	"icon-[solar--medal-ribbon-star-bold]",
	"icon-[solar--workflow-bold]",
	"icon-[solar--folder-with-files-bold]",
] as const;

export function XianxiaRealmDetailPanel({
	detail,
	onClose,
}: {
	readonly detail: RealmDetailView;
	readonly onClose: () => void;
}): JSX.Element {
	const panelRef = useRef<HTMLElement>(null);

	useEffect(() => {
		const onPointerDown = (event: PointerEvent): void => {
			if (panelRef.current?.contains(event.target as Node)) return;
			onClose();
		};

		document.addEventListener("pointerdown", onPointerDown, true);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown, true);
		};
	}, [onClose]);

	return (
		<motion.aside
			animate={{ opacity: 1, x: 0 }}
			aria-label={`${detail.achievement.name}详情`}
			className="absolute right-0 top-[272px] z-30 min-h-[300px] w-[348px] text-slate-100 drop-shadow-[0_8px_24px_rgba(8,15,30,0.42)] min-[1280px]:right-[-10px] min-[1280px]:top-[282px] min-[1280px]:w-[382px]"
			exit={{ opacity: 0, x: 46 }}
			initial={{ opacity: 0, x: 80 }}
			ref={panelRef}
			role="dialog"
			transition={{ duration: 0.28, ease: "easeOut" }}
		>
			<NineSliceImageFrame
				className="min-h-[300px] w-full"
				contentClassName="relative z-10 flex min-h-[300px] flex-col px-7 pb-8 pt-3"
				decoration={realmDetailPanelDecoration}
				imageUrl={sanctumPageAssets.realmDetailPanel}
			>
				<div className="relative flex items-start justify-center border-b border-amber-100/16 pb-1">
					<div className="flex min-w-0 flex-col gap-1 px-10">
						<div className="truncate text-center text-[22px] font-semibold leading-7 text-amber-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] min-[1280px]:text-[24px]">
							{detail.achievement.name}详情
						</div>
						<div className="text-center text-[12px] leading-4 text-slate-300/80">
							{detail.achievement.englishName}
						</div>
					</div>
					<button
						aria-label="关闭境界详情"
						className="absolute right-0 top-[-0.25rem] flex h-8 w-8 items-center justify-center text-amber-100/90 outline-none transition hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-amber-200/80"
						onClick={onClose}
						type="button"
					>
						<span aria-hidden="true" className="text-[30px] font-light leading-none">
							×
						</span>
					</button>
				</div>
				<div className="xianxia-hidden-scrollbar pt-3">
					{detail.achieved ? <AchievedRealmDetailContent detail={detail} /> : <LockedRealmDetailContent detail={detail} />}
				</div>
			</NineSliceImageFrame>
		</motion.aside>
	);
}

function AchievedRealmDetailContent({
	detail,
}: {
	readonly detail: RealmDetailView;
}): JSX.Element {
	return (
		<>
			<RealmDetailSection index={1} title="境界定义">
				<p className="text-[13px] leading-5 text-slate-200/82">{detail.definition}</p>
			</RealmDetailSection>
			<RealmDetailSection index={2} title="达成条件">
				<RealmRequirementList compact requirements={detail.requirements} />
			</RealmDetailSection>
			<RealmDetailSection index={3} title="数据来源">
				<RealmSourceChips />
			</RealmDetailSection>
			<RealmDetailSection index={4} title="推荐入口">
				<RealmActionGrid />
			</RealmDetailSection>
			<RealmDetailSection index={5} title="达成后收益">
				<RealmOutcomeGrid items={realmDetailRewards} />
			</RealmDetailSection>
		</>
	);
}

function LockedRealmDetailContent({
	detail,
}: {
	readonly detail: RealmDetailView;
}): JSX.Element {
	return (
		<>
			<RealmDetailSection index={1} title="境界定义">
				<p className="text-[13px] leading-5 text-slate-200/82">{detail.definition}</p>
			</RealmDetailSection>
			<RealmDetailSection index={2} title="前置关系">
				<p className="text-[13px] leading-5 text-slate-200/82">
					{detail.previousRealmName ?? "起始境界"} <span className="px-1 text-amber-100">→</span> {detail.achievement.name}
					{detail.nextRealmName ? <><span className="px-1 text-amber-100">→</span> {detail.nextRealmName}</> : null}
				</p>
			</RealmDetailSection>
			<RealmDetailSection index={3} title="当前差距">
				<RealmRequirementList requirements={detail.requirements} />
			</RealmDetailSection>
			<RealmDetailSection index={4} title="数据来源">
				<RealmSourceChips />
			</RealmDetailSection>
			<RealmDetailSection index={5} title="建议修炼路径">
				<RealmActionGrid />
			</RealmDetailSection>
			<RealmDetailSection index={6} title="达成后代表">
				<RealmOutcomeGrid items={realmDetailBenefits} />
			</RealmDetailSection>
			<RealmDetailSection index={7} title="成长收获预览">
				<RealmOutcomeGrid items={realmDetailRewards} />
			</RealmDetailSection>
		</>
	);
}

function RealmDetailSection({
	children,
	index,
	title,
}: {
	readonly children: JSX.Element;
	readonly index: number;
	readonly title: string;
}): JSX.Element {
	return (
		<section className="mb-3 border-b border-white/10 pb-3 last:mb-0 last:border-b-0">
			<h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold leading-5 text-amber-100">
				<span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border border-amber-100/45 text-[12px]">
					{index}
				</span>
				<span>{title}</span>
			</h3>
			{children}
		</section>
	);
}

function RealmRequirementList({
	compact = false,
	requirements,
}: {
	readonly compact?: boolean;
	readonly requirements: readonly RealmRequirement[];
}): JSX.Element {
	return (
		<div className={cn("space-y-2", compact && "space-y-1.5")}>
			{requirements.map((requirement) => (
				<div className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.75rem] items-center gap-2" key={requirement.label}>
					<div className="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-slate-200/82">
						<span className={cn(requirement.icon, "h-4 w-4 flex-none text-amber-100/90")} />
						<span className="truncate">{requirement.label}</span>
					</div>
					<div className="h-1.5 overflow-hidden rounded-full bg-slate-950/45">
						<div
							className="h-full rounded-full bg-gradient-to-r from-sky-200 to-amber-100"
							style={{ width: getRequirementProgress(requirement) }}
						/>
					</div>
					<div className="text-right text-[12px] leading-4 text-slate-200/80">
						{requirement.current} / {requirement.target}
					</div>
				</div>
			))}
		</div>
	);
}

function RealmSourceChips(): JSX.Element {
	return (
		<div className="flex flex-wrap gap-2">
			{realmDetailSources.map((source) => (
				<span className="rounded border border-white/14 bg-white/6 px-3 py-1 text-[12px] leading-4 text-slate-200/82" key={source}>
					{source}
				</span>
			))}
		</div>
	);
}

function RealmActionGrid(): JSX.Element {
	return (
		<div className="grid grid-cols-2 gap-2 min-[1280px]:grid-cols-4">
			{realmDetailActions.map((action) => (
				<button className="relative flex h-9 min-w-0 items-center justify-center gap-1.5 px-2 text-[12px] font-semibold text-slate-700 outline-none transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-amber-200/80" key={action.label} type="button">
					<HorizontalSliceImageDecoration
						decoration={realmDetailActionDecoration}
						imageUrl={sanctumPageAssets.realmDetailActionButton}
					/>
					<span className={cn(action.icon, "relative z-10 h-4 w-4 flex-none")} />
					<span className="relative z-10 truncate">{action.label}</span>
				</button>
			))}
		</div>
	);
}

function RealmOutcomeGrid({
	items,
}: {
	readonly items: readonly string[];
}): JSX.Element {
	return (
		<div className="grid grid-cols-3 gap-2">
			{items.map((item, index) => (
				<div className="rounded border border-amber-100/18 bg-slate-950/18 px-2 py-2 text-center text-[12px] leading-4 text-slate-200/82" key={item}>
					<span className={cn(realmDetailOutcomeIcons[index] ?? realmDetailOutcomeIcons[0], "mx-auto mb-1 block h-5 w-5 text-amber-100")} />
					{item}
				</div>
			))}
		</div>
	);
}

function getRequirementProgress(requirement: RealmRequirement): string {
	return `${Math.round((requirement.current / requirement.target) * 100)}%`;
}
