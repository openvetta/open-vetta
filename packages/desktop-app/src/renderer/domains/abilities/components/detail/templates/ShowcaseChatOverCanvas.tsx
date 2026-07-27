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

/** 画布外壳：窗口点 + 内容区。左侧插画统一走这里，保持克制。 */
function CanvasFrame({ children }: { children: JSX.Element }): JSX.Element {
	return (
		<div className="flex h-full min-h-[148px] flex-col gap-2.5 p-3.5">
			<div className="flex items-center gap-1.5">
				<span className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
				<span className="h-1.5 w-1.5 rounded-full bg-foreground/15" />
				<span className="h-1.5 w-1.5 rounded-full bg-foreground/10" />
			</div>
			{children}
		</div>
	);
}

function DesignCanvas(): JSX.Element {
	return (
		<CanvasFrame>
			<div className="relative min-h-0 flex-1 rounded-lg bg-foreground/[0.04] p-2.5 ring-1 ring-foreground/8">
				<div className="flex h-full gap-2">
					<div className="h-full w-1/2 rounded-md bg-gradient-to-br from-primary/30 to-primary/10" />
					<div className="flex h-full flex-1 flex-col gap-2">
						<div className="flex-1 rounded-md bg-foreground/8" />
						<div className="h-1/3 rounded-md bg-foreground/5" />
					</div>
				</div>
				{/* 选区框 */}
				<div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 top-1/2 rounded-md border border-dashed border-primary/40" />
			</div>
		</CanvasFrame>
	);
}

function CodeCanvas(): JSX.Element {
	const lines = ["w-[70%]", "w-[86%]", "w-[52%]", "w-[74%]", "w-[38%]"];
	return (
		<CanvasFrame>
			<div className="flex min-h-0 flex-1 gap-2.5 rounded-lg bg-foreground/[0.04] p-2.5 ring-1 ring-foreground/8">
				<div className="w-px shrink-0 bg-foreground/10" />
				<div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
					{lines.map((width, index) => (
						<div
							key={width}
							className={cn(
								"h-1.5 rounded-full",
								width,
								index === 2 ? "bg-primary/45" : "bg-foreground/12",
							)}
						/>
					))}
				</div>
			</div>
		</CanvasFrame>
	);
}

function DocsCanvas(): JSX.Element {
	return (
		<CanvasFrame>
			<div className="flex min-h-0 flex-1 flex-col gap-2.5 rounded-lg bg-foreground/[0.04] p-3 ring-1 ring-foreground/8">
				<div className="h-2 w-2/5 rounded-full bg-foreground/25" />
				<div className="space-y-1.5">
					<div className="h-1.5 w-full rounded-full bg-foreground/10" />
					<div className="h-1.5 w-5/6 rounded-full bg-foreground/10" />
				</div>
				<div className="mt-auto space-y-1.5">
					<div className="flex items-center gap-2">
						<span className="h-2.5 w-2.5 rounded-sm bg-primary/40" />
						<div className="h-1.5 w-1/2 rounded-full bg-foreground/12" />
					</div>
					<div className="flex items-center gap-2">
						<span className="h-2.5 w-2.5 rounded-sm ring-1 ring-foreground/15" />
						<div className="h-1.5 w-2/3 rounded-full bg-foreground/8" />
					</div>
				</div>
			</div>
		</CanvasFrame>
	);
}

function GenericCanvas(): JSX.Element {
	return (
		<CanvasFrame>
			<div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg bg-foreground/[0.04] p-2.5 ring-1 ring-foreground/8">
				<div className="flex-1 rounded-md bg-gradient-to-br from-primary/25 to-transparent" />
				<div className="flex gap-2">
					<div className="h-6 flex-1 rounded-md bg-foreground/8" />
					<div className="h-6 w-1/3 rounded-md bg-foreground/5" />
				</div>
			</div>
		</CanvasFrame>
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
				<div className="relative border-r border-border/40 bg-foreground/[0.03]">
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
