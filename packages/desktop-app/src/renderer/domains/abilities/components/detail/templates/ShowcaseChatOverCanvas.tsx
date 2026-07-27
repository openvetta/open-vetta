import { cn } from "@vetta/ui";
import { useState } from "react";
import type { AbilityShowcaseCanvas } from "@shared/lib/api";

/**
 * 呈现模板：chat-over-canvas
 * 参考能力详情示意——左侧产品画布 CSS mock + 右侧对话气泡（非真实截图）。
 */

function BrandAvatar({
	iconUrl,
	brandName,
}: {
	iconUrl?: string;
	brandName?: string;
}): JSX.Element {
	const [failed, setFailed] = useState(false);
	const showImage = Boolean(iconUrl) && !failed;

	return (
		<div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background shadow-sm ring-1 ring-border/60">
			{showImage && iconUrl ? (
				<img
					src={iconUrl}
					alt={brandName ?? ""}
					className="h-full w-full object-contain p-0.5"
					onError={() => setFailed(true)}
				/>
			) : (
				<span className="icon-[solar--magic-stick-3-bold] h-3.5 w-3.5 text-primary" />
			)}
		</div>
	);
}

function DesignCanvas(): JSX.Element {
	return (
		<div className="relative flex h-full min-h-[148px] flex-col gap-2 p-3">
			{/* 画布顶栏 */}
			<div className="flex items-center gap-1.5">
				<span className="h-1.5 w-1.5 rounded-full bg-red-400/70" />
				<span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />
				<span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
				<div className="ml-2 h-2 flex-1 rounded-full bg-white/10" />
			</div>
			<div className="flex min-h-0 flex-1 gap-2">
				{/* 侧栏图层 */}
				<div className="flex w-[28%] flex-col gap-1.5 rounded-md bg-black/25 p-1.5 ring-1 ring-white/5">
					<div className="h-1.5 w-3/4 rounded-full bg-white/15" />
					<div className="h-1.5 w-full rounded-full bg-white/10" />
					<div className="h-1.5 w-2/3 rounded-full bg-white/10" />
					<div className="mt-1 space-y-1">
						<div className="h-6 rounded bg-white/8 ring-1 ring-white/5" />
						<div className="h-6 rounded bg-white/8 ring-1 ring-white/5" />
						<div className="h-6 rounded bg-primary/20 ring-1 ring-primary/30" />
					</div>
				</div>
				{/* 主画板：组件卡片 */}
				<div className="relative flex min-w-0 flex-1 flex-col gap-2 rounded-md bg-gradient-to-br from-white/10 to-white/5 p-2 ring-1 ring-white/10">
					<div className="flex items-center justify-between gap-2">
						<div className="h-2 w-16 rounded-full bg-white/20" />
						<div className="flex gap-1">
							<div className="h-4 w-4 rounded-full bg-sky-400/40" />
							<div className="h-4 w-4 rounded-full bg-violet-400/40" />
						</div>
					</div>
					<div className="grid flex-1 grid-cols-2 gap-1.5">
						<div className="rounded-md bg-black/20 p-1.5 ring-1 ring-white/8">
							<div className="mb-1.5 h-8 rounded bg-gradient-to-r from-sky-500/30 to-indigo-500/20" />
							<div className="h-1.5 w-4/5 rounded-full bg-white/15" />
							<div className="mt-1 h-1.5 w-1/2 rounded-full bg-white/10" />
						</div>
						<div className="rounded-md bg-black/20 p-1.5 ring-1 ring-white/8">
							<div className="mb-1.5 flex gap-1">
								<div className="h-8 flex-1 rounded bg-emerald-500/25" />
								<div className="h-8 flex-1 rounded bg-amber-500/20" />
							</div>
							<div className="h-1.5 w-3/5 rounded-full bg-white/15" />
						</div>
						<div className="col-span-2 rounded-md bg-black/20 p-1.5 ring-1 ring-white/8">
							<div className="flex items-end gap-1">
								<div className="h-5 w-2 rounded-sm bg-primary/35" />
								<div className="h-8 w-2 rounded-sm bg-primary/50" />
								<div className="h-6 w-2 rounded-sm bg-primary/40" />
								<div className="h-10 w-2 rounded-sm bg-sky-400/45" />
								<div className="h-7 w-2 rounded-sm bg-primary/35" />
								<div className="h-9 w-2 rounded-sm bg-violet-400/40" />
							</div>
						</div>
					</div>
					{/* 选区框 */}
					<div className="pointer-events-none absolute right-3 top-8 h-10 w-14 rounded border border-dashed border-sky-400/50 bg-sky-400/5" />
				</div>
			</div>
		</div>
	);
}

function CodeCanvas(): JSX.Element {
	const lines = [
		{ w: "w-[72%]", c: "bg-sky-400/35" },
		{ w: "w-[88%]", c: "bg-white/12" },
		{ w: "w-[54%]", c: "bg-emerald-400/30" },
		{ w: "w-[76%]", c: "bg-white/10" },
		{ w: "w-[40%]", c: "bg-amber-400/30" },
		{ w: "w-[82%]", c: "bg-white/12" },
		{ w: "w-[61%]", c: "bg-violet-400/30" },
		{ w: "w-[70%]", c: "bg-white/10" },
	];
	return (
		<div className="relative flex h-full min-h-[148px] flex-col gap-2 p-3 font-mono">
			<div className="flex items-center gap-1.5">
				<span className="h-1.5 w-1.5 rounded-full bg-red-400/70" />
				<span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />
				<span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
				<div className="ml-2 h-2 w-20 rounded-full bg-white/12" />
			</div>
			<div className="flex min-h-0 flex-1 gap-2 rounded-md bg-black/30 p-2 ring-1 ring-white/8">
				<div className="flex w-5 flex-col gap-1.5 pt-0.5 text-[9px] tabular-nums text-white/25">
					{lines.map((_, i) => (
						<span key={i}>{i + 12}</span>
					))}
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
					{lines.map((line, i) => (
						<div key={i} className={cn("h-2 rounded-full", line.w, line.c)} />
					))}
				</div>
			</div>
			{/* diff 高亮条 */}
			<div className="pointer-events-none absolute bottom-6 left-10 right-8 h-5 rounded bg-emerald-400/10 ring-1 ring-emerald-400/20" />
		</div>
	);
}

function DocsCanvas(): JSX.Element {
	return (
		<div className="relative flex h-full min-h-[148px] flex-col gap-2 p-3">
			<div className="flex items-center gap-1.5">
				<span className="h-1.5 w-1.5 rounded-full bg-red-400/70" />
				<span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />
				<span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
				<div className="ml-2 h-2 w-24 rounded-full bg-white/12" />
			</div>
			<div className="flex min-h-0 flex-1 gap-2">
				<div className="w-[30%] space-y-1.5 rounded-md bg-black/25 p-2 ring-1 ring-white/5">
					<div className="h-1.5 w-full rounded-full bg-white/18" />
					<div className="h-1.5 w-4/5 rounded-full bg-white/10" />
					<div className="h-1.5 w-3/5 rounded-full bg-primary/35" />
					<div className="h-1.5 w-4/5 rounded-full bg-white/10" />
					<div className="h-1.5 w-2/3 rounded-full bg-white/10" />
					<div className="mt-2 h-1.5 w-1/2 rounded-full bg-white/8" />
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-2 rounded-md bg-gradient-to-b from-white/10 to-white/5 p-2.5 ring-1 ring-white/10">
					<div className="h-2.5 w-2/5 rounded-full bg-white/25" />
					<div className="space-y-1">
						<div className="h-1.5 w-full rounded-full bg-white/12" />
						<div className="h-1.5 w-full rounded-full bg-white/10" />
						<div className="h-1.5 w-4/5 rounded-full bg-white/10" />
					</div>
					<div className="mt-1 rounded-md bg-black/20 p-2 ring-1 ring-white/8">
						<div className="mb-1.5 flex items-center gap-1.5">
							<span className="icon-[solar--checklist-minimalistic-linear] h-3 w-3 text-emerald-400/70" />
							<div className="h-1.5 w-16 rounded-full bg-white/15" />
						</div>
						<div className="space-y-1 pl-4">
							<div className="flex items-center gap-1.5">
								<span className="h-2 w-2 rounded-sm border border-emerald-400/50 bg-emerald-400/20" />
								<div className="h-1.5 w-20 rounded-full bg-white/12" />
							</div>
							<div className="flex items-center gap-1.5">
								<span className="h-2 w-2 rounded-sm border border-white/20" />
								<div className="h-1.5 w-24 rounded-full bg-white/10" />
							</div>
							<div className="flex items-center gap-1.5">
								<span className="h-2 w-2 rounded-sm border border-white/20" />
								<div className="h-1.5 w-16 rounded-full bg-white/10" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function GenericCanvas(): JSX.Element {
	return (
		<div className="relative flex h-full min-h-[148px] flex-col gap-2 p-3">
			<div className="flex items-center gap-1.5">
				<span className="h-1.5 w-1.5 rounded-full bg-red-400/70" />
				<span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />
				<span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
			</div>
			<div className="grid min-h-0 flex-1 grid-cols-3 gap-1.5">
				<div className="col-span-2 rounded-md bg-black/25 ring-1 ring-white/8" />
				<div className="space-y-1.5">
					<div className="h-[40%] rounded-md bg-primary/20 ring-1 ring-primary/25" />
					<div className="h-[55%] rounded-md bg-black/25 ring-1 ring-white/8" />
				</div>
				<div className="col-span-3 h-8 rounded-md bg-gradient-to-r from-sky-500/20 via-violet-500/15 to-transparent ring-1 ring-white/8" />
			</div>
		</div>
	);
}

function CanvasByMotif({ motif }: { motif: AbilityShowcaseCanvas }): JSX.Element {
	switch (motif) {
		case "design":
			return <DesignCanvas />;
		case "code":
			return <CodeCanvas />;
		case "docs":
			return <DocsCanvas />;
		default:
			return <GenericCanvas />;
	}
}

export function ShowcaseChatOverCanvas({
	userPrompt,
	assistantReply,
	canvas,
	brandIconUrl,
	brandName,
}: {
	userPrompt: string;
	assistantReply: string;
	canvas: AbilityShowcaseCanvas;
	brandIconUrl?: string;
	brandName?: string;
}): JSX.Element {
	return (
		<section
			className="relative overflow-hidden rounded-xl ring-1 ring-border/50"
			aria-label="ability-showcase-chat-over-canvas"
		>
			{/* 舞台底 + 细网格（color-mix，兼容 --primary 为 rgb()） */}
			<div className="absolute inset-0 bg-gradient-to-br from-muted via-background to-background" aria-hidden />
			<div
				className="absolute inset-0 opacity-80"
				style={{
					backgroundImage:
						"radial-gradient(ellipse at top left, color-mix(in srgb, var(--primary) 18%, transparent), transparent 55%)",
				}}
				aria-hidden
			/>
			<div
				className="absolute inset-0 opacity-40"
				style={{
					backgroundImage:
						"linear-gradient(to right, color-mix(in srgb, var(--border) 55%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--border) 55%, transparent) 1px, transparent 1px)",
					backgroundSize: "14px 14px",
				}}
				aria-hidden
			/>

			<div className="relative grid grid-cols-[1.05fr_0.95fr] gap-0 sm:min-h-[168px]">
				{/* 左：产品画布 mock */}
				<div className="relative border-r border-border/40 bg-black/20">
					<div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent" />
					<div className="relative text-foreground">
						<CanvasByMotif motif={canvas} />
					</div>
				</div>

				{/* 右：对话气泡层 */}
				<div className="relative flex flex-col justify-center gap-2.5 p-3">
					<div className="ml-auto max-w-[95%] rounded-2xl rounded-tr-md bg-background/90 px-2.5 py-2 text-[11px] leading-relaxed text-foreground shadow-md ring-1 ring-border/50 backdrop-blur-sm">
						{userPrompt}
					</div>
					<div className="flex max-w-[98%] items-start gap-2">
						<BrandAvatar iconUrl={brandIconUrl} brandName={brandName} />
						<div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-primary/15 px-2.5 py-2 text-[11px] leading-relaxed text-foreground/95 shadow-md ring-1 ring-primary/20 backdrop-blur-sm">
							{assistantReply}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

export function ShowcaseChatThread({
	userPrompt,
	assistantReply,
	brandIconUrl,
	brandName,
}: {
	userPrompt: string;
	assistantReply: string;
	brandIconUrl?: string;
	brandName?: string;
}): JSX.Element {
	return (
		<section className="overflow-hidden rounded-xl border border-border/50 bg-muted/30 p-3">
			<div className="flex flex-col gap-2.5">
				<div className="flex items-start gap-2">
					<div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/80 ring-1 ring-border/60">
						<span className="icon-[solar--user-rounded-bold] h-3.5 w-3.5 text-muted-foreground" />
					</div>
					<div className="min-w-0 flex-1 rounded-lg rounded-tl-sm bg-background/70 px-2.5 py-2 text-[11px] leading-relaxed text-foreground/90 ring-1 ring-border/40">
						{userPrompt}
					</div>
				</div>
				<div className="flex items-start gap-2">
					<BrandAvatar iconUrl={brandIconUrl} brandName={brandName} />
					<div className="min-w-0 flex-1 rounded-lg rounded-tl-sm bg-primary/10 px-2.5 py-2 text-[11px] leading-relaxed text-foreground/90 ring-1 ring-primary/15">
						{assistantReply}
					</div>
				</div>
			</div>
		</section>
	);
}
