import {
	DefaultWindowControls,
	PageHeaderActionGroup,
	PageHeaderFrame,
	PageHeaderTitle,
	usePageHeaderModel,
	useWindowControlsModel,
} from "@vetta/desktop-theme-ui/app-shell";
import { motion } from "motion/react";
import type { JSX } from "react";
import { sanctumPageAssets } from "./assets";

export function XianxiaSanctumPageHeader(): JSX.Element {
	const pageHeader = usePageHeaderModel({ narrow: false, sidebarCollapsed: false });
	const windowControls = useWindowControlsModel();

	return (
		<PageHeaderFrame
			className="sticky top-0 z-20 h-20 w-full overflow-hidden pt-7 text-white drop-shadow-[0_2px_5px_rgba(15,23,42,0.7)]"
			contentClassName="min-w-0 items-start overflow-hidden"
			reserveMacTrafficLights={false}
			style={{ marginBottom: 0, paddingLeft: 32, paddingRight: 32 }}
			triggerVisible={false}
		>
			<div className="no-drag flex min-w-0 flex-1 items-start gap-3">
				<button
					type="button"
					aria-label="Back"
					title="Back"
					onClick={() => window.history.back()}
					className="mt-0.5 h-10 w-10 transition-transform hover:-translate-x-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
				>
					<img alt="" aria-hidden="true" className="h-full w-full object-contain" src={sanctumPageAssets.backButton} />
				</button>
				<div className="min-w-0">
					<div className="flex min-w-0 items-center gap-4">
						<PageHeaderTitle
							title={pageHeader.title}
							className="text-[31px] font-semibold leading-8 text-white"
						/>
						<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/65 text-lg leading-none text-white/90">
							i
						</span>
					</div>
					<p className="mt-1 text-[19px] leading-none text-white/90">修仙成就</p>
				</div>
			</div>
			<p className="pointer-events-none absolute left-1/2 top-[78px] hidden max-w-[42%] -translate-x-1/2 truncate text-[17px] text-white/90 xl:block">
				15 Realms of Cultivation · Forge your path, ascend to immortality
			</p>
			<PageHeaderActionGroup className="min-w-0 max-w-[45%] items-start gap-4 overflow-hidden">
				<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/55 text-2xl text-white/90">?</span>
				<div className="flex min-w-0 items-center gap-2 rounded-full bg-slate-900/25 px-2 py-1.5">
					<motion.img
						animate={{ boxShadow: "0 0 12px rgba(255,255,255,0.52)" }}
						alt=""
						aria-hidden="true"
						className="h-11 w-11 rounded-full object-cover ring-2 ring-white/65"
						initial={{ boxShadow: "0 0 0 rgba(255,255,255,0)" }}
						src={sanctumPageAssets.achievements.unlocked[1]}
						transition={{ duration: 1.8, repeat: Infinity, repeatType: "reverse" }}
					/>
					<span className="truncate text-[17px]">Barefoot Beech</span>
					<span className="icon-[solar--alt-arrow-down-linear] h-4 w-4 shrink-0" />
				</div>
				{!windowControls.isMac && <DefaultWindowControls model={windowControls} />}
			</PageHeaderActionGroup>
		</PageHeaderFrame>
	);
}
