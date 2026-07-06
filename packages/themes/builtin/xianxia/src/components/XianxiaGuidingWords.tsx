import { motion } from "motion/react";
import { useThemeSurface } from "@vetta/theme-sdk";
import { ThemeSurface, type NewSessionGuidingWordsProps } from "@vetta/theme-ui";
import { cn } from "@vetta/ui";
import { xianxiaAssets } from "../assets";

export function XianxiaGuidingWords({
	className,
	groups,
	mounted,
	onPick,
	...props
}: NewSessionGuidingWordsProps): JSX.Element {
	const surface = useThemeSurface("chat.newSessionGuidingWords");

	return (
		<div
			className={cn(
				"xianxia-guiding-words relative mt-5 w-full overflow-visible rounded-[20px] border border-transparent px-5 py-4",
				surface?.rootClassName,
				className,
			)}
			data-theme-surface-root="chat.newSessionGuidingWords"
			{...props}
		>
			<ThemeSurface
				className="xianxia-guiding-words-frame overflow-visible"
				slot="chat.newSessionGuidingWords"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-[inherit]"
			>
				<img
					alt=""
					className="absolute right-0 -bottom-5 h-[116px] w-auto max-w-[42%] object-contain object-right-bottom opacity-90"
					src={xianxiaAssets.inputBarBackground}
				/>
			</div>
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 8 }}
				transition={{ duration: 0.5, delay: 0.35 }}
				className="relative z-10 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-x-10"
			>
				{groups.map((group) => (
					<div key={group.id} className="flex min-w-0 flex-col gap-2">
						<div className="truncate text-[13px] font-semibold text-foreground/90" title={group.name}>
							{group.name}
						</div>
						<motion.div
							key={group.pageKey}
							initial="initial"
							animate="animate"
							variants={{ animate: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } }}
							className="flex flex-col"
						>
							{group.words.map((word, index) => (
								<motion.button
									key={`${group.pageKey}-${index}-${word}`}
									type="button"
									onClick={() => onPick(word)}
									variants={{
										initial: { opacity: 0, x: -6 },
										animate: { opacity: 1, x: 0 },
									}}
									transition={{ duration: 0.5 }}
									whileTap={{ scale: 0.98 }}
									title={word}
									className="min-h-8 border-l border-primary/20 px-4 py-1.5 text-left text-[12px] leading-relaxed text-muted-foreground transition-colors hover:text-primary"
								>
									<span className="break-words">{word}</span>
								</motion.button>
							))}
						</motion.div>
					</div>
				))}
			</motion.div>
		</div>
	);
}
