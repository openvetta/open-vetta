import type { CardDescriptor, ConversationMessage, PluginCardProps } from "@vetta/plugin-sdk";
import { Component, type ComponentType, type ErrorInfo, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

/** A card descriptor resolved to its renderer + display metadata. */
export interface ResolvedCard {
	/** Stable React key. */
	id: string;
	descriptor: CardDescriptor;
	/** True while synthesized from an in-flight tool (renderer shows a skeleton). */
	pending: boolean;
	Component: ComponentType<PluginCardProps>;
	/** Tab label. */
	title: string;
	/** Tab icon (React node), optional. */
	icon?: ReactNode;
}

class CardErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true };
	}
	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("Plugin card failed", error, info.componentStack);
	}
	render(): ReactNode {
		return this.state.failed ? null : this.props.children;
	}
}

function CardBody({ card, message }: { card: ResolvedCard; message: ConversationMessage }): JSX.Element {
	const { Component: Renderer } = card;
	return (
		<CardErrorBoundary>
			<Renderer descriptor={card.descriptor} pending={card.pending} message={message} />
		</CardErrorBoundary>
	);
}

/** Stacked-cards toggle icon (收纳). */
function IconStack({ active }: { active: boolean }): JSX.Element {
	return (
		<svg viewBox="0 0 24 24" fill="none" className={active ? "text-primary" : ""}>
			<rect x="4" y="4" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
			<path d="M7 17.5h10M9 20.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
		</svg>
	);
}

/** Flat-list toggle icon (列表). */
function IconList({ active }: { active: boolean }): JSX.Element {
	return (
		<svg viewBox="0 0 24 24" fill="none" className={active ? "text-primary" : ""}>
			<rect x="4" y="4.5" width="16" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
			<rect x="4" y="13.5" width="16" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
		</svg>
	);
}

type Layout = "stacked" | "list";

/**
 * Renders a message's plugin cards. With a single card, the card alone (no
 * chrome). With ≥2, an operation area on top — a tab switcher on the left, a
 * 列表/收纳 layout toggle on the right — over the card content.
 *
 * 收纳 (stacked, the default) shows one card at a time via tabs; 列表 lays them
 * all out vertically. The layout is ephemeral local state — 列表 is a transient
 * form that falls back to 收纳 on unmount / session switch (never persisted).
 */
export function MessageCards({
	cards,
	message,
}: {
	cards: ResolvedCard[];
	message: ConversationMessage;
}): JSX.Element | null {
	const { t } = useTranslation("chat");
	const [layout, setLayout] = useState<Layout>("stacked");
	const [activeId, setActiveId] = useState<string>(cards[0]?.id ?? "");

	if (cards.length === 0) return null;
	if (cards.length === 1) {
		return (
			<div className="flex flex-col gap-2" data-vetta-message-cards={message.id}>
				<CardBody card={cards[0]!} message={message} />
			</div>
		);
	}

	const active = cards.find((c) => c.id === activeId) ?? cards[0]!;

	return (
		<div className="flex flex-col gap-2" data-vetta-message-cards={message.id}>
			<div className="flex items-center gap-2">
				<div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
					{cards.map((card) => {
						const isActive = layout === "stacked" && card.id === active.id;
						return (
							<button
								key={card.id}
								type="button"
								onClick={() => {
									setActiveId(card.id);
									if (layout !== "stacked") setLayout("stacked");
								}}
								className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
									isActive
										? "bg-muted text-foreground"
										: "text-muted-foreground hover:bg-muted/60 hover:text-foreground/80"
								}`}
							>
								{card.icon != null && (
									<span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full">
										{card.icon}
									</span>
								)}
								<span className="max-w-[120px] truncate">{card.title}</span>
								{card.pending && <span className="processing-shimmer h-1.5 w-1.5 rounded-full bg-primary" />}
							</button>
						);
					})}
				</div>
				<div className="flex shrink-0 items-center gap-0.5">
					<button
						type="button"
						title={t("messageCards.layoutStacked")}
						onClick={() => setLayout("stacked")}
						className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-muted ${
							layout === "stacked" ? "text-foreground" : "text-muted-foreground"
						}`}
					>
						<span className="h-3.5 w-3.5">
							<IconStack active={layout === "stacked"} />
						</span>
					</button>
					<button
						type="button"
						title={t("messageCards.layoutList")}
						onClick={() => setLayout("list")}
						className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-muted ${
							layout === "list" ? "text-foreground" : "text-muted-foreground"
						}`}
					>
						<span className="h-3.5 w-3.5">
							<IconList active={layout === "list"} />
						</span>
					</button>
				</div>
			</div>
			{layout === "stacked" ? (
				<CardBody key={active.id} card={active} message={message} />
			) : (
				<div className="flex flex-col gap-3">
					{cards.map((card) => (
						<CardBody key={card.id} card={card} message={message} />
					))}
				</div>
			)}
		</div>
	);
}
