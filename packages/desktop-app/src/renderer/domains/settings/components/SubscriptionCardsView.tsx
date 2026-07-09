import { cn } from "@shared/lib/utils";
import { AnimatePresence, motion, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { RemoteModel, SubscriptionCardsModel } from "./useSubscriptionCardsModel";
import { formatMultiplier, formatWindowReset } from "./useSubscriptionCardsModel";

function hexToRgba(hex: string, alpha: number): string {
	let h = hex.replace("#", "");
	if (h.length === 3) h = h.split("").map((c) => c + c).join("");
	const n = Number.parseInt(h, 16);
	if (Number.isNaN(n)) return `rgba(245, 158, 11, ${alpha})`;
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function VettaGoBrand({ currentPlan, themeColor }: { currentPlan: string; themeColor: string }): JSX.Element {
	return (
		<div className="flex items-center gap-3">
			<motion.div
				className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-lg"
				style={{ backgroundColor: themeColor, boxShadow: `0 10px 15px -3px ${hexToRgba(themeColor, 0.3)}` }}
				animate={{ y: [0, -3, 0] }}
				transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
			>
				<span className="icon-[mdi--rocket-launch] h-6 w-6 text-white drop-shadow" />
				<motion.span
					className="pointer-events-none absolute inset-0 rounded-2xl border-2"
					style={{ borderColor: hexToRgba(themeColor, 0.6) }}
					animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.18, 1] }}
					transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				/>
			</motion.div>
			<div className="flex flex-col leading-tight">
				<span className="text-[18px] font-extrabold tracking-tight" style={{ color: themeColor }}>
					Vetta Go
				</span>
				<span className="text-[10px] font-medium tracking-[0.18em]" style={{ color: hexToRgba(themeColor, 0.7) }}>
					{currentPlan}
				</span>
			</div>
		</div>
	);
}

const cardVariants = {
	hidden: { opacity: 0, y: 14, scale: 0.985 },
	show: { opacity: 1, y: 0, scale: 1 },
};

const listVariants = {
	hidden: {},
	show: { transition: { staggerChildren: 0.04 } },
};

const chipVariants = {
	hidden: { opacity: 0, y: 8, scale: 0.96 },
	show: { opacity: 1, y: 0, scale: 1 },
};

function VettaGoCard({ model }: { model: SubscriptionCardsModel }): JSX.Element {
	const [showDone, setShowDone] = useState(false);
	const prevRefreshing = useRef(model.refreshing);
	const cardRef = useRef<HTMLDivElement>(null);
	const hoveringRef = useRef(false);
	const models = model.goProvider?.models ?? [];
	const unlimited = model.windows.length > 0 && model.windows.every((windowInfo) => windowInfo.limit <= 0);
	const themeColor = model.status.badge_color || "#f59e0b";
	const rotateX = useSpring(0, { stiffness: 150, damping: 18, mass: 0.4 });
	const rotateY = useSpring(0, { stiffness: 150, damping: 18, mass: 0.4 });

	useEffect(() => {
		const MAX = 3;
		const handle = (event: MouseEvent) => {
			const el = cardRef.current;
			if (!el || hoveringRef.current) return;
			const r = el.getBoundingClientRect();
			const dx = (event.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
			const dy = (event.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
			rotateY.set(Math.max(-MAX, Math.min(MAX, dx * MAX)));
			rotateX.set(Math.max(-MAX, Math.min(MAX, -dy * MAX)));
		};
		window.addEventListener("mousemove", handle);
		return () => window.removeEventListener("mousemove", handle);
	}, [rotateX, rotateY]);

	useEffect(() => {
		if (prevRefreshing.current && !model.refreshing) {
			setShowDone(true);
			const timer = setTimeout(() => setShowDone(false), 1600);
			prevRefreshing.current = model.refreshing;
			return () => clearTimeout(timer);
		}
		prevRefreshing.current = model.refreshing;
	}, [model.refreshing]);

	return (
		<motion.div
			ref={cardRef}
			className="mb-6"
			style={{ rotateX, rotateY, transformPerspective: 900 }}
			variants={cardVariants}
			initial="hidden"
			animate="show"
			transition={{ type: "spring", stiffness: 320, damping: 26 }}
			whileHover={{ y: -3 }}
			onMouseEnter={() => {
				hoveringRef.current = true;
				rotateX.set(0);
				rotateY.set(0);
			}}
			onMouseLeave={() => {
				hoveringRef.current = false;
			}}
		>
			<div
				className="group relative overflow-hidden rounded-2xl border p-5"
				style={{
					borderColor: hexToRgba(themeColor, 0.2),
					backgroundImage: `linear-gradient(to bottom right, ${hexToRgba(themeColor, 0.1)}, ${hexToRgba(themeColor, 0.035)}, transparent)`,
				}}
			>
				<motion.div
					className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl"
					style={{ backgroundColor: hexToRgba(themeColor, 0.12) }}
					animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
					transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				/>
				<motion.div
					className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full blur-3xl"
					style={{ backgroundColor: hexToRgba(themeColor, 0.08) }}
					animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
					transition={{ duration: 7, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: 1 }}
				/>

				<div className="relative flex items-start justify-between gap-3">
					<VettaGoBrand currentPlan={model.labels.currentPlan} themeColor={themeColor} />
					<motion.button
						type="button"
						onClick={() => void model.actions.refresh()}
						disabled={model.refreshing}
						whileTap={{ scale: 0.92 }}
						whileHover={showDone ? undefined : { backgroundColor: hexToRgba(themeColor, 0.1) }}
						className={cn(
							"flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50",
							showDone && "text-green-500",
						)}
						style={showDone ? undefined : { color: themeColor }}
					>
						<AnimatePresence mode="wait" initial={false}>
							{showDone ? (
								<motion.span
									key="done"
									initial={{ scale: 0, opacity: 0 }}
									animate={{ scale: 1, opacity: 1 }}
									exit={{ scale: 0, opacity: 0 }}
									className="flex items-center gap-1.5"
								>
									<span className="icon-[mdi--check-circle] h-3.5 w-3.5" />
									{model.labels.updated}
								</motion.span>
							) : (
								<motion.span
									key="idle"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									className="flex items-center gap-1.5"
								>
									<span className={cn("icon-[mdi--refresh] h-3.5 w-3.5", model.refreshing && "animate-spin")} />
									{model.refreshing ? model.labels.refreshing : model.labels.refresh}
								</motion.span>
							)}
						</AnimatePresence>
					</motion.button>
				</div>

				<div className="relative mt-3 flex flex-wrap items-center gap-2">
					{model.status.badge_text && (
						<span
							className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
							style={{ backgroundColor: model.status.badge_color || "#f59e0b" }}
						>
							{model.status.badge_text}
						</span>
					)}
					<span className="text-[12px] text-muted-foreground">
						{model.status.description || `${model.status.tier_name || model.labels.tokenPlan} · ${model.labels.modelsCount(models.length)}`}
					</span>
				</div>

				{model.expiry && (
					<div className="relative mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<span className="icon-[mdi--calendar-clock] h-3.5 w-3.5 shrink-0" />
						{model.labels.expiryDate(model.expiry)}
					</div>
				)}

				{unlimited ? (
					<motion.div
						className="relative mt-4 flex items-center gap-2 overflow-hidden rounded-xl border px-3 py-3 text-[13px] font-semibold"
						style={{
							borderColor: hexToRgba(themeColor, 0.3),
							backgroundImage: `linear-gradient(to right, ${hexToRgba(themeColor, 0.15)}, ${hexToRgba(themeColor, 0.1)})`,
							color: themeColor,
						}}
						initial={{ opacity: 0, scale: 0.97 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ delay: 0.1 }}
					>
						<motion.span
							className="icon-[mdi--infinity] h-5 w-5 shrink-0"
							animate={{ scale: [1, 1.15, 1] }}
							transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
						/>
						{model.labels.unlimitedQuota}
						<motion.span
							className="pointer-events-none absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent"
							animate={{ x: ["-120%", "220%"] }}
							transition={{ duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", repeatDelay: 1.4 }}
						/>
					</motion.div>
				) : model.windows.length > 0 ? (
					<div className="relative mt-4 space-y-2">
						{model.windows.map((windowInfo, i) => {
							const pct = windowInfo.limit > 0 ? Math.min(100, Math.round((windowInfo.consumed / windowInfo.limit) * 100)) : 0;
							return (
								<div key={windowInfo.kind} className="rounded-xl border border-border bg-background/40 px-3 py-2.5">
									<div className="flex items-center justify-between text-[12px]">
										<span className="font-medium text-foreground">{windowInfo.label}</span>
										<span className="tabular-nums text-muted-foreground">{pct}%</span>
									</div>
									<div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
										<motion.div
											className="h-full rounded-full"
											style={{ backgroundColor: themeColor }}
											initial={{ width: 0 }}
											animate={{ width: `${pct}%` }}
											transition={{ duration: 0.7, delay: 0.12 + i * 0.08, ease: "easeOut" }}
										/>
									</div>
									<div className="mt-1 text-[10px] text-muted-foreground">
										{formatWindowReset(windowInfo.resetAt, model.now)}
									</div>
								</div>
							);
						})}
					</div>
				) : null}

				{models.length > 0 && (
					<motion.div className="relative mt-4 grid grid-cols-2 gap-2" variants={listVariants} initial="hidden" animate="show">
						{models.map((remoteModel) => (
							<ModelChip key={remoteModel.id} model={remoteModel} hoverColor={themeColor} labels={model.labels} />
						))}
					</motion.div>
				)}
			</div>
		</motion.div>
	);
}

function ModelChip({
	model,
	hoverColor,
	labels,
}: {
	hoverColor?: string;
	labels: SubscriptionCardsModel["labels"];
	model: RemoteModel;
}): JSX.Element {
	const mul = model.multiplier;
	const showMultiplier = !!mul && (mul.input > 0 || mul.output > 0);
	const isFree = !!mul && mul.input === 0 && mul.output === 0;
	return (
		<motion.div
			variants={chipVariants}
			whileHover={
				hoverColor
					? { y: -2, scale: 1.02, borderColor: hexToRgba(hoverColor, 0.4), backgroundColor: hexToRgba(hoverColor, 0.05) }
					: { y: -2, scale: 1.02 }
			}
			className="rounded-xl border border-border bg-background/40 px-3 py-2.5 transition-colors"
		>
			<div className="flex items-center gap-1.5">
				<span className="truncate text-[12px] font-medium text-foreground">{model.name || model.id}</span>
				{model.reasoning && <span className="shrink-0 rounded bg-purple-500/10 px-1 py-0.5 text-[10px] text-purple-400">{labels.thinking}</span>}
			</div>
			{(model.input?.includes("image") || (model.tags?.length ?? 0) > 0) && (
				<div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
					{model.input?.includes("image") && <span className="rounded bg-blue-500/10 px-1 py-0.5 text-blue-400">{labels.vision}</span>}
					{model.tags?.map((tag) => (
						<span key={tag} className="rounded bg-accent px-1 py-0.5 text-muted-foreground">
							{tag.trim()}
						</span>
					))}
				</div>
			)}
			{showMultiplier && mul && (
				<div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
					<span className="icon-[mdi--circle-multiple-outline] h-3 w-3 shrink-0 opacity-70" />
					<span className="tabular-nums">{labels.modelMultiplier(formatMultiplier(mul.input))}</span>
				</div>
			)}
			{isFree && (
				<div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
					<span className="icon-[mdi--circle-multiple-outline] h-3 w-3 shrink-0 opacity-70" />
					<span>{labels.freeModel}</span>
				</div>
			)}
		</motion.div>
	);
}

export function SubscriptionCardsView({ model }: { model: SubscriptionCardsModel }): JSX.Element | null {
	if (!model.showGoCard) return null;
	return <VettaGoCard model={model} />;
}
