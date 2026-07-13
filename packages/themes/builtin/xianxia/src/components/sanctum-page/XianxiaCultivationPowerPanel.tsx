import { cn } from "@vetta/ui";
import { motion } from "motion/react";
import type { JSX } from "react";
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

export function XianxiaCultivationPowerPanel({
	cultivation,
}: {
	readonly cultivation: SanctumCultivationView;
}): JSX.Element {
	return (
		<section className="relative aspect-[2172/724] min-h-[236px] w-full min-w-0 overflow-visible px-[31px] py-[17px] text-white">
			<img
				alt=""
				aria-hidden="true"
				className="absolute inset-0 h-full w-full object-fill drop-shadow-[0_0_10px_rgba(255,246,210,0.5)]"
				src={sanctumPageAssets.cultivationPowerPanel}
			/>
			<div className="relative z-10 grid h-full min-w-0 grid-cols-[minmax(0,1fr)_9.5rem] gap-4 min-[1280px]:grid-cols-[minmax(0,1fr)_10.5rem] min-[1280px]:gap-6">
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
						<div className="mt-2 flex min-w-0 items-end gap-3">
							<XianxiaCultivationNumber
								className="drop-shadow-[0_1px_4px_rgba(15,23,42,0.75)]"
								digitClassName="h-[48px] min-[1280px]:h-[58px]"
								value={cultivation.currentPower}
							/>
							<span className="pb-1.5 text-[25px] font-semibold leading-none text-slate-100/95 min-[1280px]:pb-2 min-[1280px]:text-[30px]">/ {formatCultivationNumber(cultivation.maxPower)}</span>
						</div>
						<div className="mt-2 h-3 w-[82%] shrink-0 overflow-hidden rounded-full border border-amber-100/45 bg-slate-950/35 shadow-inner">
							<motion.div
								animate={{ width: cultivation.progressPercent }}
								className="h-full rounded-full bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 shadow-[0_0_7px_rgba(255,240,190,0.75)]"
								initial={{ width: "0%" }}
								transition={{ delay: 0.38, duration: 0.75, ease: "easeOut" }}
							/>
						</div>
						<p className="mt-2 text-[13px] font-semibold tracking-[0.08em] text-slate-200/70">
							数据来自真实使用行为
						</p>
					</div>
					<div className="mt-auto grid min-h-[4.65rem] shrink-0 grid-cols-[1.1fr_repeat(3,1fr)] overflow-hidden rounded-[10px] border border-white/18 bg-slate-900/18">
						<div className="flex min-w-0 items-start px-3 pt-3 text-[15px] font-semibold tracking-[0.08em] text-slate-200/90 min-[1280px]:px-4 min-[1280px]:text-[17px]">
							最近增长
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
			</div>
		</section>
	);
}
