export type PetBubbleStyleId = "plain" | "pink";

export type PetBubbleCornerId = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type PetBubbleStyleLabelKey = "settings.bubble.styles.plain.label" | "settings.bubble.styles.pink.label";
export type PetBubbleStyleDescriptionKey =
	| "settings.bubble.styles.plain.description"
	| "settings.bubble.styles.pink.description";

export interface PetBubbleCornerStyle {
	readonly id: PetBubbleCornerId;
	readonly backgroundPosition: string;
	readonly position: {
		readonly bottom?: string;
		readonly left?: string;
		readonly right?: string;
		readonly top?: string;
	};
}

export interface PetBubbleDecorStyle {
	readonly fileName: string;
	readonly cornerWidth: string;
	readonly cornerHeight: string;
	readonly backgroundSize: string;
	readonly corners: readonly PetBubbleCornerStyle[];
}

export interface PetBubbleSurfaceStyle {
	readonly bodyClassName: string;
	readonly textClassName: string;
	readonly style?: Readonly<Record<string, string>>;
}

export interface PetBubbleStyle {
	readonly id: PetBubbleStyleId;
	readonly labelKey: PetBubbleStyleLabelKey;
	readonly descriptionKey: PetBubbleStyleDescriptionKey;
	readonly surface: PetBubbleSurfaceStyle;
	readonly decor?: PetBubbleDecorStyle;
}

export const DEFAULT_PET_BUBBLE_STYLE_ID: PetBubbleStyleId = "pink";

export const PET_BUBBLE_STYLES: readonly PetBubbleStyle[] = [
	{
		id: "plain",
		labelKey: "settings.bubble.styles.plain.label",
		descriptionKey: "settings.bubble.styles.plain.description",
		surface: {
			bodyClassName:
				"relative min-w-40 max-w-full break-words rounded-xl border border-border/60 bg-popover/90 px-12 py-3 text-center text-[12px] font-medium leading-5 text-popover-foreground shadow-lg backdrop-blur-sm",
			textClassName: "relative max-h-20 min-w-0 overflow-hidden",
		},
	},
	{
		id: "pink",
		labelKey: "settings.bubble.styles.pink.label",
		descriptionKey: "settings.bubble.styles.pink.description",
		surface: {
			bodyClassName:
				"relative min-w-40 max-w-full break-words rounded-xl border px-12 py-3 text-center text-[12px] font-medium leading-5 shadow-lg",
			textClassName: "relative max-h-20 min-w-0 overflow-hidden",
			style: {
				backgroundColor: "#EBDFE0",
				borderColor: "#f3a6c6",
				color: "#6f2f49",
			},
		},
		decor: {
			fileName: "bubble/stoat_heart_decor_corner_border_set.png",
			cornerWidth: "7rem",
			cornerHeight: "5.25rem",
			backgroundSize: "14rem 10.5rem",
			corners: [
				{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-25px", top: "-43px" } },
				{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-25px", top: "-43px" } },
				{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-36px", left: "-25px" } },
				{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-36px", right: "-43px" } },
			],
		},
	},
] as const;

const PET_BUBBLE_STYLE_IDS = new Set<string>(PET_BUBBLE_STYLES.map((style) => style.id));

export function isPetBubbleStyleId(value: unknown): value is PetBubbleStyleId {
	return typeof value === "string" && PET_BUBBLE_STYLE_IDS.has(value);
}

export function normalizePetBubbleStyleId(value: unknown): PetBubbleStyleId {
	return isPetBubbleStyleId(value) ? value : DEFAULT_PET_BUBBLE_STYLE_ID;
}

export function getPetBubbleStyle(id: PetBubbleStyleId): PetBubbleStyle {
	return PET_BUBBLE_STYLES.find((style) => style.id === id) ?? PET_BUBBLE_STYLES[0];
}
