import { cn } from "@vetta/ui";
import type { ReactNode } from "react";
import type { CapabilityDetailSection } from "../../detail/types";
import { ShowcaseChatOverCanvas, ShowcaseChatThread } from "./templates/ShowcaseChatOverCanvas";

function SectionTitle({ children }: { children: ReactNode }): JSX.Element {
	return <h3 className="mb-2 text-[13px] font-semibold text-foreground">{children}</h3>;
}

function IntroSection({ section }: { section: Extract<CapabilityDetailSection, { type: "intro" }> }): JSX.Element {
	return (
		<section>
			{section.title ? <SectionTitle>{section.title}</SectionTitle> : null}
			<p className="text-[12px] leading-[1.65] text-muted-foreground whitespace-pre-line">{section.body}</p>
		</section>
	);
}

function ImageSection({
	section,
}: {
	section: Extract<CapabilityDetailSection, { type: "media"; kind: "image" }>;
}): JSX.Element {
	return (
		<section className="overflow-hidden rounded-xl border border-border/50 bg-muted/20">
			<img src={section.src} alt={section.alt ?? ""} className="max-h-48 w-full object-cover" />
		</section>
	);
}

function FeatureListSection({
	section,
}: {
	section: Extract<CapabilityDetailSection, { type: "featureList" }>;
}): JSX.Element {
	return (
		<section>
			{section.title ? <SectionTitle>{section.title}</SectionTitle> : null}
			<ul className="space-y-1.5">
				{section.items.map((item) => (
					<li key={item} className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
						<span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
						<span>{item}</span>
					</li>
				))}
			</ul>
		</section>
	);
}

function ScenariosSection({
	section,
}: {
	section: Extract<CapabilityDetailSection, { type: "scenarios" }>;
}): JSX.Element {
	return (
		<section>
			{section.title ? <SectionTitle>{section.title}</SectionTitle> : null}
			<ul className="space-y-2">
				{section.items.map((item) => (
					<li key={item.label} className="flex items-center gap-2 text-[12px] text-muted-foreground">
						<span
							className={cn(
								"h-3.5 w-3.5 shrink-0 text-muted-foreground/70",
								item.icon?.startsWith("icon-[") ? item.icon : "icon-[solar--widget-2-linear]",
							)}
						/>
						<span>{item.label}</span>
					</li>
				))}
			</ul>
		</section>
	);
}

function PermissionsSection({
	section,
	detailLinkLabel,
	onOpenDetail,
	showDetailLink,
}: {
	section: Extract<CapabilityDetailSection, { type: "permissions" }>;
	detailLinkLabel: string;
	onOpenDetail?: () => void;
	showDetailLink: boolean;
}): JSX.Element {
	return (
		<section>
			{section.title ? <SectionTitle>{section.title}</SectionTitle> : null}
			{section.lead ? (
				<p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">{section.lead}</p>
			) : null}
			<ul className="space-y-1.5">
				{section.items.map((item) => (
					<li key={item} className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
						<span className="icon-[solar--check-circle-bold] mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
						<span>{item}</span>
					</li>
				))}
			</ul>
			{section.showDetailLink && showDetailLink && onOpenDetail ? (
				<button
					type="button"
					onClick={onOpenDetail}
					className="mt-2 text-[12px] font-medium text-primary hover:underline"
				>
					{detailLinkLabel}
				</button>
			) : null}
		</section>
	);
}

function ReviewsSection({
	section,
	countLabel,
}: {
	section: Extract<CapabilityDetailSection, { type: "reviews" }>;
	countLabel: string;
}): JSX.Element {
	const score = section.score ?? 0;
	const fullStars = Math.min(5, Math.max(0, Math.round(score)));

	return (
		<section>
			{section.title ? <SectionTitle>{section.title}</SectionTitle> : null}
			{(section.score != null || section.count != null) && (
				<div className="mb-2 flex flex-wrap items-center gap-2">
					{section.score != null && (
						<>
							<span className="text-[18px] font-semibold tabular-nums text-foreground">
								{section.score.toFixed(1)}
							</span>
							<span className="flex items-center gap-0.5 text-amber-400">
								{Array.from({ length: 5 }, (_, index) => (
									<span
										key={index}
										className={cn(
											"h-3.5 w-3.5",
											index < fullStars
												? "icon-[solar--star-bold]"
												: "icon-[solar--star-linear] text-muted-foreground/40",
										)}
									/>
								))}
							</span>
						</>
					)}
					{section.count != null && (
						<span className="text-[11px] text-muted-foreground/70">{countLabel}</span>
					)}
				</div>
			)}
			<ul className="space-y-2">
				{section.quotes.map((quote) => (
					<li
						key={quote}
						className="rounded-lg bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground"
					>
						“{quote}”
					</li>
				))}
			</ul>
		</section>
	);
}

function ShowcaseSection({
	section,
}: {
	section: Extract<CapabilityDetailSection, { type: "showcase" }>;
}): JSX.Element {
	if (section.template === "chat-over-canvas") {
		return (
			<ShowcaseChatOverCanvas
				userPrompt={section.userPrompt}
				assistantReply={section.assistantReply}
				canvas={section.canvas}
				brandIconUrl={section.brandIconUrl}
				brandName={section.brandName}
			/>
		);
	}
	return (
		<ShowcaseChatThread
			userPrompt={section.userPrompt}
			assistantReply={section.assistantReply}
			brandIconUrl={section.brandIconUrl}
			brandName={section.brandName}
		/>
	);
}

export function CapabilityDetailSectionView({
	section,
	detailLinkLabel,
	reviewsCountLabel,
	onOpenPermissionDetails,
	canOpenPermissionDetails,
}: {
	section: CapabilityDetailSection;
	detailLinkLabel: string;
	reviewsCountLabel: string;
	onOpenPermissionDetails?: () => void;
	canOpenPermissionDetails: boolean;
}): JSX.Element | null {
	switch (section.type) {
		case "intro":
			return <IntroSection section={section} />;
		case "showcase":
			return <ShowcaseSection section={section} />;
		case "media":
			return <ImageSection section={section} />;
		case "featureList":
			return <FeatureListSection section={section} />;
		case "scenarios":
			return <ScenariosSection section={section} />;
		case "permissions":
			return (
				<PermissionsSection
					section={section}
					detailLinkLabel={detailLinkLabel}
					onOpenDetail={onOpenPermissionDetails}
					showDetailLink={canOpenPermissionDetails}
				/>
			);
		case "reviews":
			return <ReviewsSection section={section} countLabel={reviewsCountLabel} />;
		default:
			return null;
	}
}
