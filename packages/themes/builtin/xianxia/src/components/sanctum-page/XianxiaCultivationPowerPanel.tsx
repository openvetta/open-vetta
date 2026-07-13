import { NineSliceImageFrame } from "@vetta/theme-ui";
import { cn, Popover, PopoverContent, PopoverTrigger } from "@vetta/ui";
import { motion } from "motion/react";
import { useMemo, useState, type JSX } from "react";
import { sanctumPageAssets } from "./assets";
import { formatCultivationNumber } from "./cultivationView";
import type { SanctumCultivationView } from "./types";
import { XianxiaCultivationNumber } from "./XianxiaCultivationNumber";

const cultivationDataSources = [
	{ icon: "icon-[solar--checklist-minimalistic-bold]", label: "完成任务" },
	{ icon: "icon-[solar--document-text-bold]", label: "引用知识库" },
	{ icon: "icon-[solar--magic-stick-3-bold]", label: "生成有效结果" },
	{ icon: "icon-[solar--settings-bold]", label: "建立自动化" },
] as const;
const cultivationPowerPanelDecoration = {
	borderWidth: "2.5rem",
	repeat: "stretch",
	slice: 110,
} as const;
const cultivationCompositionPanelDecoration = {
	borderWidth: "2.25rem",
	repeat: "stretch",
	slice: 80,
} as const;

interface CultivationCompositionItem {
	readonly icon: string;
	readonly label: string;
	readonly percent: number;
	readonly value: number;
}

export function XianxiaCultivationPowerPanel({
	cultivation,
}: {
	readonly cultivation: SanctumCultivationView;
}): JSX.Element {
	const [compositionOpen, setCompositionOpen] = useState(false);
	const [compositionMounted, setCompositionMounted] = useState(false);
	const compositionItems = useMemo(() => getCultivationCompositionItems(cultivation), [cultivation]);
	const handleCompositionOpenChange = (open: boolean): void => {
		if (open) {
			setCompositionMounted(true);
			setCompositionOpen(true);
			return;
		}
		setCompositionOpen(false);
	};

	return (
		<NineSliceImageFrame
			className="w-full min-w-0 overflow-visible text-white drop-shadow-[0_0_10px_rgba(255,246,210,0.5)]"
			contentClassName="relative z-10 grid min-w-0 grid-cols-[minmax(0,1fr)_9.5rem] gap-4 px-[31px] py-[17px] min-[1280px]:grid-cols-[minmax(0,1fr)_10.5rem] min-[1280px]:gap-6"
			decoration={cultivationPowerPanelDecoration}
			imageUrl={sanctumPageAssets.cultivationPowerPanel}
		>
			<div className="flex min-w-0 flex-col">
				<div className="flex items-center gap-3">
					<span className="text-[18px] text-amber-100 drop-shadow-[0_0_5px_rgba(255,245,205,0.8)]">✧</span>
					<h2 className="text-[22px] font-semibold leading-7 text-amber-50 drop-shadow-[0_1px_3px_rgba(15,23,42,0.65)] min-[1280px]:text-[24px] min-[1280px]:leading-8">
						修为值
					</h2>
					<span className="text-[16px] text-slate-200/90 min-[1280px]:text-[18px]">Cultivation Power</span>
					<span className="icon-[solar--info-circle-linear] h-5 w-5 flex-none text-slate-200/75" />
				</div>
				<div className="ml-4 min-[1280px]:ml-6">
					<div className="mt-4 flex min-w-0 items-end gap-3">
						<XianxiaCultivationNumber
							className="drop-shadow-[0_1px_4px_rgba(15,23,42,0.75)]"
							digitClassName="h-[48px] min-[1280px]:h-[58px]"
							value={cultivation.currentPower}
						/>
						<span className="pb-1.5 text-[25px] font-semibold leading-none text-slate-100/95 min-[1280px]:pb-2 min-[1280px]:text-[30px]">/ {formatCultivationNumber(cultivation.maxPower)}</span>
					</div>
					<div className="mt-2 h-3 w-[82%] shrink-0 overflow-hidden rounded-full border border-[#edd2aa]/55 bg-slate-950/35 p-[2px] shadow-inner">
						<motion.div
							animate={{ width: cultivation.progressPercent }}
							className="h-full rounded-full bg-[#edd2aa] shadow-[0_0_5px_rgba(237,210,170,0.58)]"
							initial={{ width: "0%" }}
							transition={{ delay: 0.38, duration: 0.75, ease: "easeOut" }}
						/>
					</div>
					<p className="mt-2 text-[13px] font-semibold tracking-[0.08em] text-slate-200/70">
						数据来自真实使用行为
					</p>
				</div>
				<div className="relative mt-2 grid min-h-[4.65rem] shrink-0 grid-cols-[1.1fr_repeat(3,1fr)] overflow-visible rounded-[10px] border border-white/18 bg-slate-900/18">
					<div className="flex min-w-0 flex-col items-start px-3 pt-3 min-[1280px]:px-4">
						<div className="text-[15px] font-semibold tracking-[0.08em] text-slate-200/90 min-[1280px]:text-[17px]">
							最近增长
						</div>
						<div className="relative mt-1">
							<Popover open={compositionMounted} onOpenChange={handleCompositionOpenChange}>
								<PopoverTrigger asChild>
									<button
										className="inline-flex items-center gap-1 text-[12px] font-semibold leading-4 text-[#edd2aa] outline-none transition hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-amber-200/80"
										type="button"
									>
										<span>修为构成</span>
										<span className="icon-[solar--alt-arrow-down-linear] h-3.5 w-3.5" />
									</button>
								</PopoverTrigger>
								{compositionMounted && (
									<PopoverContent
										align="start"
										className="z-[100] w-[520px] border-0 bg-transparent p-0 text-slate-700 shadow-none outline-none"
										side="bottom"
										sideOffset={8}
									>
										<XianxiaCultivationCompositionPanel
											currentPower={cultivation.currentPower}
											items={compositionItems}
											maxPower={cultivation.maxPower}
											onExitComplete={() => {
												if (!compositionOpen) setCompositionMounted(false);
											}}
											open={compositionOpen}
										/>
									</PopoverContent>
								)}
							</Popover>
						</div>
					</div>
					{cultivation.growth.map((item, index) => (
						<div
							className="relative flex min-w-0 flex-col items-center justify-center px-2 py-1.5 text-center"
							key={item.label}
						>
							{index > 0 && <span className="absolute bottom-3 left-0 top-3 w-px bg-white/16" />}
							<div className="truncate text-[13px] leading-5 text-slate-200/85">{item.label}</div>
							<XianxiaCultivationNumber
								className="mt-0.5 drop-shadow-[0_1px_3px_rgba(15,23,42,0.62)]"
								digitClassName="h-[24px] min-[1280px]:h-[28px]"
								prefix="+"
								value={item.value}
							/>
						</div>
					))}
				</div>
			</div>
			<div className="mt-[26px] flex min-h-0 flex-col rounded-[10px] border border-slate-300/60 bg-slate-50/82 px-3 py-3 text-slate-700 shadow-[inset_0_0_12px_rgba(255,255,255,0.65)]">
				<div className="mb-2 text-[14px] font-semibold leading-5 tracking-[0.08em] text-slate-700 min-[1280px]:text-[15px]">
					数据来源:
				</div>
				<div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5">
					{cultivationDataSources.map((source) => (
						<div className="flex min-w-0 items-center gap-2" key={source.label}>
							<span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-slate-400/55 bg-slate-700 text-amber-100 shadow-[0_1px_3px_rgba(15,23,42,0.28)]">
								<span className={cn(source.icon, "h-3.5 w-3.5")} />
							</span>
							<span className="truncate text-[13px] font-semibold leading-5 min-[1280px]:text-[14px]">{source.label}</span>
						</div>
					))}
				</div>
			</div>
		</NineSliceImageFrame>
	);
}

function XianxiaCultivationCompositionPanel({
	currentPower,
	items,
	maxPower,
	onExitComplete,
	open,
}: {
	readonly currentPower: number;
	readonly items: readonly CultivationCompositionItem[];
	readonly maxPower: number;
	readonly onExitComplete: () => void;
	readonly open: boolean;
}): JSX.Element {
	return (
		<motion.div
			animate={open ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.96, y: -10 }}
			className="w-[520px] origin-top text-slate-700 drop-shadow-[0_8px_20px_rgba(15,23,42,0.28)]"
			initial={{ opacity: 0, scale: 0.96, y: -10 }}
			onAnimationComplete={() => {
				if (!open) onExitComplete();
			}}
			style={{ pointerEvents: open ? "auto" : "none" }}
			transition={{ duration: 0.22, ease: "easeOut" }}
		>
			<NineSliceImageFrame
				className="w-full"
				contentClassName="relative z-10 px-7 py-5"
				decoration={cultivationCompositionPanelDecoration}
				imageUrl={sanctumPageAssets.cultivationCompositionPanel}
			>
				<div className="mb-4 flex items-baseline gap-2 pb-3">
					<h3 className="text-[22px] font-semibold leading-7 text-slate-800">修为值构成</h3>
					<span className="text-[13px] text-slate-500">（基于真实使用行为）</span>
				</div>
				<div className="grid grid-cols-[repeat(4,minmax(0,1fr))_0.78fr] items-start gap-3 text-center">
					{items.map((item, index) => (
						<div className="relative min-w-0" key={item.label}>
							{index > 0 && (
								<span className="absolute left-[-0.5rem] top-12 text-[34px] leading-none text-slate-500/80">+</span>
							)}
							<div className="text-[13px] font-semibold leading-5 text-slate-600">{item.label}</div>
							<div className="mx-auto mt-2 flex h-14 w-14 items-center justify-center rounded-full border border-[#edd2aa]/70 bg-slate-700 text-[#edd2aa] shadow-[0_2px_7px_rgba(15,23,42,0.28)]">
								<span className={cn(item.icon, "h-7 w-7")} />
							</div>
							<div className="mt-2 text-[24px] font-semibold leading-7 text-slate-800">{item.percent}%</div>
							<div className="mt-1 text-[12px] leading-4 text-slate-500">
								{formatCultivationNumber(item.value)} / {formatCultivationNumber(currentPower)}
							</div>
						</div>
					))}
					<div className="relative min-w-0">
						<span className="absolute left-[-0.5rem] top-12 text-[34px] leading-none text-slate-500/80">=</span>
						<div className="text-[13px] font-semibold leading-5 text-slate-600">修为值</div>
						<div className="mx-auto mt-2 flex h-14 w-14 items-center justify-center rounded-full border border-[#edd2aa]/70 text-[#b6925d]">
							<span className="icon-[solar--stars-bold] h-7 w-7" />
						</div>
						<div className="mt-2 text-[24px] font-semibold leading-7 text-slate-800">{formatCultivationNumber(currentPower)}</div>
						<div className="mt-1 text-[12px] leading-4 text-slate-500">/ {formatCultivationNumber(maxPower)}</div>
					</div>
				</div>
				<div className="mt-5 flex items-center justify-between pt-3 text-[13px] leading-5 text-slate-600">
					<span>完成任务、引用知识库、生成有效结果、建立自动化都会累计修为。</span>
					<span className="inline-flex items-center gap-1 font-semibold text-slate-700">
						了解规则
						<span className="icon-[solar--alt-arrow-right-linear] h-4 w-4" />
					</span>
				</div>
			</NineSliceImageFrame>
		</motion.div>
	);
}

function getCultivationCompositionItems(cultivation: SanctumCultivationView): readonly CultivationCompositionItem[] {
	const breakdown = cultivation.scoreBreakdown;
	const items = [
		{
			icon: "icon-[solar--document-text-bold]",
			label: "文稿生成",
			value: breakdown.messages + breakdown.turns + breakdown.depth,
		},
		{
			icon: "icon-[solar--chart-2-bold]",
			label: "数据洞察",
			value: breakdown.activeTime + breakdown.sessions + breakdown.tokens + breakdown.projects,
		},
		{
			icon: "icon-[solar--shield-check-bold]",
			label: "风险审查",
			value: breakdown.tools + breakdown.knowledge,
		},
		{
			icon: "icon-[solar--arrow-up-bold]",
			label: "自动化任务",
			value: breakdown.batch + breakdown.automation + breakdown.streak,
		},
	];
	const total = items.reduce((sum, item) => sum + item.value, 0);

	return items.map((item) => ({
		...item,
		percent: total > 0 ? Math.round((item.value / total) * 100) : 0,
		value: total > 0 ? Math.floor((item.value / total) * cultivation.currentPower) : 0,
	}));
}
