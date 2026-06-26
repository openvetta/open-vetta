export type PetBubbleStyleId =
	| "plain"
	| "pink"
	| "spring-festival"
	| "dragon-boat"
	| "mid-autumn"
	| "qingming"
	| "winter-solstice";

export type PetBubbleCornerId = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type PetBubbleStyleLabelKey =
	| "settings.bubble.styles.plain.label"
	| "settings.bubble.styles.pink.label"
	| "settings.bubble.styles.springFestival.label"
	| "settings.bubble.styles.dragonBoat.label"
	| "settings.bubble.styles.midAutumn.label"
	| "settings.bubble.styles.qingming.label"
	| "settings.bubble.styles.winterSolstice.label";
export type PetBubbleStyleDescriptionKey =
	| "settings.bubble.styles.plain.description"
	| "settings.bubble.styles.pink.description"
	| "settings.bubble.styles.springFestival.description"
	| "settings.bubble.styles.dragonBoat.description"
	| "settings.bubble.styles.midAutumn.description"
	| "settings.bubble.styles.qingming.description"
	| "settings.bubble.styles.winterSolstice.description";

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

const SPRING_FESTIVAL_BUBBLE_CORNERS: readonly PetBubbleCornerStyle[] = [
	{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-24px", top: "-33px" } },
	{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-11px", top: "-33px" } },
	{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-22px", left: "-25px" } },
	{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-22px", right: "-11px" } },
];

const DRAGON_BOAT_BUBBLE_CORNERS: readonly PetBubbleCornerStyle[] = [
	{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-35px", top: "-31px" } },
	{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-20px", top: "-31px" } },
	{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-26px", left: "-32px" } },
	{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-26px", right: "-27px" } },
];

const MID_AUTUMN_BUBBLE_CORNERS: readonly PetBubbleCornerStyle[] = [
	{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-28px", top: "-34px" } },
	{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-17px", top: "-37px" } },
	{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-29px", left: "-27px" } },
	{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-29px", right: "-32px" } },
];

const QINGMING_BUBBLE_CORNERS: readonly PetBubbleCornerStyle[] = [
	{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-23px", top: "-36px" } },
	{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-11px", top: "-33px" } },
	{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-24px", left: "-28px" } },
	{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-24px", right: "-26px" } },
];

const WINTER_SOLSTICE_BUBBLE_CORNERS: readonly PetBubbleCornerStyle[] = [
	{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-28px", top: "-30px" } },
	{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-28px", top: "-31px" } },
	{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-24px", left: "-32px" } },
	{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-24px", right: "-27px" } },
];

function createFestivalBubbleDecor(fileName: string, corners: readonly PetBubbleCornerStyle[]): PetBubbleDecorStyle {
	return {
		fileName,
		cornerWidth: "5.5rem",
		cornerHeight: "5.5rem",
		backgroundSize: "11rem 11rem",
		corners,
	};
}

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
	{
		id: "spring-festival",
		labelKey: "settings.bubble.styles.springFestival.label",
		descriptionKey: "settings.bubble.styles.springFestival.description",
		surface: {
			bodyClassName:
				"relative min-w-40 max-w-full break-words rounded-xl border px-12 py-3 text-center text-[12px] font-medium leading-5 shadow-lg",
			textClassName: "relative max-h-20 min-w-0 overflow-hidden",
			style: {
				backgroundColor: "#FFF3EA",
				borderColor: "#E35B4F",
				color: "#7B1F1A",
			},
		},
		decor: createFestivalBubbleDecor(
			"bubble/stoat_spring_festival_corner_border_set.png",
			SPRING_FESTIVAL_BUBBLE_CORNERS,
		),
	},
	{
		id: "dragon-boat",
		labelKey: "settings.bubble.styles.dragonBoat.label",
		descriptionKey: "settings.bubble.styles.dragonBoat.description",
		surface: {
			bodyClassName:
				"relative min-w-40 max-w-full break-words rounded-xl border px-12 py-3 text-center text-[12px] font-medium leading-5 shadow-lg",
			textClassName: "relative max-h-20 min-w-0 overflow-hidden",
			style: {
				backgroundColor: "#F2F8E9",
				borderColor: "#76A96D",
				color: "#28513C",
			},
		},
		decor: createFestivalBubbleDecor(
			"bubble/stoat_dragon_boat_festival_corner_border_set.png",
			DRAGON_BOAT_BUBBLE_CORNERS,
		),
	},
	{
		id: "mid-autumn",
		labelKey: "settings.bubble.styles.midAutumn.label",
		descriptionKey: "settings.bubble.styles.midAutumn.description",
		surface: {
			bodyClassName:
				"relative min-w-40 max-w-full break-words rounded-xl border px-12 py-3 text-center text-[12px] font-medium leading-5 shadow-lg",
			textClassName: "relative max-h-20 min-w-0 overflow-hidden",
			style: {
				backgroundColor: "#FFF7E3",
				borderColor: "#D7A743",
				color: "#65420D",
			},
		},
		decor: createFestivalBubbleDecor(
			"bubble/stoat_mid_autumn_festival_corner_border_set.png",
			MID_AUTUMN_BUBBLE_CORNERS,
		),
	},
	{
		id: "qingming",
		labelKey: "settings.bubble.styles.qingming.label",
		descriptionKey: "settings.bubble.styles.qingming.description",
		surface: {
			bodyClassName:
				"relative min-w-40 max-w-full break-words rounded-xl border px-12 py-3 text-center text-[12px] font-medium leading-5 shadow-lg",
			textClassName: "relative max-h-20 min-w-0 overflow-hidden",
			style: {
				backgroundColor: "#F4F9EF",
				borderColor: "#8CBF7A",
				color: "#36592F",
			},
		},
		decor: createFestivalBubbleDecor("bubble/stoat_qingming_festival_corner_border_set.png", QINGMING_BUBBLE_CORNERS),
	},
	{
		id: "winter-solstice",
		labelKey: "settings.bubble.styles.winterSolstice.label",
		descriptionKey: "settings.bubble.styles.winterSolstice.description",
		surface: {
			bodyClassName:
				"relative min-w-40 max-w-full break-words rounded-xl border px-12 py-3 text-center text-[12px] font-medium leading-5 shadow-lg",
			textClassName: "relative max-h-20 min-w-0 overflow-hidden",
			style: {
				backgroundColor: "#EEF7FA",
				borderColor: "#6EAFC3",
				color: "#245160",
			},
		},
		decor: createFestivalBubbleDecor(
			"bubble/stoat_winter_solstice_corner_border_set.png",
			WINTER_SOLSTICE_BUBBLE_CORNERS,
		),
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
