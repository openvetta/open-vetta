import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";

export const MAIN_SPACE = "main";
export const SPACE_ICONS = {
	folder: "icon-[solar--folder-linear]",
	code: "icon-[solar--code-linear]",
	star: "icon-[solar--star-linear]",
	book: "icon-[solar--book-linear]",
	rocket: "icon-[solar--rocket-linear]",
	case: "icon-[solar--case-linear]",
	cup: "icon-[solar--cup-linear]",
	gamepad: "icon-[solar--gamepad-linear]",
	music: "icon-[solar--music-note-linear]",
	pen: "icon-[solar--pen-linear]",
	palette: "icon-[solar--palette-linear]",
	camera: "icon-[solar--camera-linear]",
	video: "icon-[solar--video-frame-linear]",
	globe: "icon-[solar--globe-linear]",
	idea: "icon-[solar--lightbulb-linear]",
	heart: "icon-[solar--heart-linear]",
	cart: "icon-[solar--cart-large-linear]",
	chart: "icon-[solar--chart-2-linear]",
	growth: "icon-[solar--graph-up-linear]",
	notebook: "icon-[solar--notebook-linear]",
	document: "icon-[solar--document-text-linear]",
	layers: "icon-[solar--layers-minimalistic-linear]",
	chip: "icon-[solar--cpu-bolt-linear]",
	planet: "icon-[solar--planet-linear]",
	cloud: "icon-[solar--cloud-linear]",
	bolt: "icon-[solar--bolt-linear]",
	leaf: "icon-[solar--leaf-linear]",
	shop: "icon-[solar--shop-linear]",
	gallery: "icon-[solar--gallery-linear]",
	bookmark: "icon-[solar--bookmark-linear]",
	clipboard: "icon-[solar--clipboard-list-linear]",
	checklist: "icon-[solar--checklist-linear]",
	target: "icon-[solar--target-linear]",
	medal: "icon-[solar--medal-star-linear]",
	testTube: "icon-[solar--test-tube-linear]",
	server: "icon-[solar--server-square-linear]",
	moon: "icon-[solar--moon-linear]",
	sun: "icon-[solar--sun-2-linear]",
	confetti: "icon-[solar--confetti-linear]",
	key: "icon-[solar--key-linear]",
	lock: "icon-[solar--lock-keyhole-linear]",
	mapPin: "icon-[solar--map-point-linear]",
	routing: "icon-[solar--routing-2-linear]",
	shield: "icon-[solar--shield-check-linear]",
	chat: "icon-[solar--chat-round-linear]",
	wallet: "icon-[solar--wallet-linear]",
	basketball: "icon-[solar--basketball-linear]",
	football: "icon-[solar--football-linear]",
	buildings: "icon-[solar--buildings-2-linear]",
	bed: "icon-[solar--bed-linear]",
	paw: "icon-[solar--paw-linear]",
	snowflake: "icon-[solar--snowflake-linear]",
	crown: "icon-[solar--crown-star-linear]",
	atom: "icon-[solar--atom-linear]",
	user: "icon-[solar--user-linear]",
	team: "icon-[solar--users-group-rounded-linear]",
	compass: "icon-[solar--compass-linear]",
	flag: "icon-[solar--flag-2-linear]",
	telescope: "icon-[solar--telescope-linear]",
	satellite: "icon-[solar--satellite-linear]",
	/** 主工作空间的图标。保留在集合内以兼容既有配置，但不出现在可选列表里，避免与列表项重复。 */
	home: "icon-[solar--home-smile-angle-linear]",
};

export type SpaceIconValue = keyof typeof SPACE_ICONS;
export type SpaceIcon = { kind: "solar"; value: SpaceIconValue } | { kind: "emoji"; value: string };
/** 新建/编辑工作空间时可选的图标：主工作空间专用的 `home` 不在其中。 */
export const SPACE_ICON_VALUES = (Object.keys(SPACE_ICONS) as SpaceIconValue[]).filter((value) => value !== "home");
export const MAIN_SPACE_ICON: SpaceIcon = { kind: "solar", value: "home" };
const FALLBACK_SPACE_ICON: SpaceIcon = { kind: "solar", value: "folder" };
export interface Space {
	id: string;
	name: string;
	icon: SpaceIcon;
	/**
	 * 空间内的会话能否看见同空间的兄弟项目（ADR-0159）。缺省视为开启，旧配置无需迁移；
	 * 只有明确关闭时才写 `false`。
	 */
	siblingProjects?: boolean;
}

/** 空间是否开启「会话能看见同空间的项目」。主空间不支持。 */
export function spaceShowsSiblingProjects(space: Pick<Space, "siblingProjects">): boolean {
	return space.siblingProjects !== false;
}

export type SpaceItem = { kind: "project" | "conversation"; key: string };
export type SpaceLocation =
	| { kind: "project"; cwd: string }
	| { kind: "conversation"; cwd: string; path: string; viewer?: boolean }
	| { kind: "team"; teamId: string; sessionId: string; projectCwd?: string };

export interface SpaceState {
	spaces: Space[];
	selected: string;
	projects: Record<string, string>;
	conversations: Record<string, string>;
	locations: Record<string, SpaceLocation>;
}

export const INITIAL_SPACES: SpaceState = {
	spaces: [],
	selected: MAIN_SPACE,
	projects: {},
	conversations: {},
	locations: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSpaceEmoji(value: string): boolean {
	return (
		/\p{Emoji_Presentation}|\p{Extended_Pictographic}|\u20e3/u.test(value) &&
		[...new Intl.Segmenter().segment(value)].length === 1 &&
		value.length <= 32
	);
}

function isIcon(icon: unknown): icon is SpaceIcon {
	return (
		isRecord(icon) &&
		typeof icon.value === "string" &&
		((icon.kind === "solar" && Object.hasOwn(SPACE_ICONS, icon.value)) ||
			(icon.kind === "emoji" && isSpaceEmoji(icon.value)))
	);
}

export function spaceExists(state: SpaceState, id: string): boolean {
	return id === MAIN_SPACE || state.spaces.some((space) => space.id === id);
}

function isLocation(value: unknown): value is SpaceLocation {
	if (!isRecord(value)) return false;
	switch (value.kind) {
		case "project":
			return typeof value.cwd === "string";
		case "conversation":
			return (
				typeof value.cwd === "string" &&
				typeof value.path === "string" &&
				(value.viewer === undefined || typeof value.viewer === "boolean")
			);
		case "team":
			return (
				typeof value.teamId === "string" &&
				typeof value.sessionId === "string" &&
				(value.projectCwd === undefined || typeof value.projectCwd === "string")
			);
		default:
			return false;
	}
}

export function readSpaces(value: unknown): SpaceState {
	if (!isRecord(value)) return INITIAL_SPACES;
	const ids = new Set([MAIN_SPACE]);
	const spaces: Space[] = [];
	for (const item of Array.isArray(value.spaces) ? value.spaces : []) {
		if (
			!isRecord(item) ||
			typeof item.id !== "string" ||
			!item.id ||
			ids.has(item.id) ||
			typeof item.name !== "string" ||
			!item.name.trim()
		)
			continue;
		ids.add(item.id);
		spaces.push({
			id: item.id,
			name: item.name,
			// 不认识的图标（例如更新版本新增的）回退为文件夹而不是丢掉整个空间：空间数据
			// 跨版本共享（ADR-0160），丢弃会在下次保存时把它从共享存储里删掉。
			icon: isIcon(item.icon) ? item.icon : FALLBACK_SPACE_ICON,
			...(item.siblingProjects === false ? { siblingProjects: false } : {}),
		});
	}
	const memberships = (entries: unknown) =>
		Object.fromEntries(
			Object.entries(isRecord(entries) ? entries : {}).filter(
				(entry): entry is [string, string] =>
					typeof entry[1] === "string" && ids.has(entry[1]) && entry[1] !== MAIN_SPACE,
			),
		);
	return {
		spaces,
		selected: typeof value.selected === "string" && ids.has(value.selected) ? value.selected : MAIN_SPACE,
		projects: memberships(value.projects),
		conversations: memberships(value.conversations),
		locations: Object.fromEntries(
			Object.entries(isRecord(value.locations) ? value.locations : {}).filter(
				(entry): entry is [string, SpaceLocation] => ids.has(entry[0]) && isLocation(entry[1]),
			),
		),
	};
}

const storage = createJSONStorage<unknown>();
export const spacesAtom = atomWithStorage<SpaceState>(
	"vetta.desktop-spaces.v1",
	INITIAL_SPACES,
	{
		getItem: (key, initial) => readSpaces(storage.getItem(key, initial)),
		setItem: (key, value) => storage.setItem(key, value),
		removeItem: (key) => storage.removeItem(key),
		subscribe: (key, callback, initial) =>
			storage.subscribe?.(key, (value) => callback(readSpaces(value)), initial) ?? (() => {}),
	},
	{ getOnInit: true },
);
export const selectedSpaceAtom = atom((get) => get(spacesAtom).selected);

export function spaceOf(state: SpaceState, { kind, key }: SpaceItem): string {
	const membership = kind === "project" ? state.projects : state.conversations;
	return Object.hasOwn(membership, key) ? membership[key] : MAIN_SPACE;
}

export function selectSpace(state: SpaceState, id: string): SpaceState {
	return spaceExists(state, id) && state.selected !== id ? { ...state, selected: id } : state;
}

export function assignSpace(state: SpaceState, item: SpaceItem, id: string): SpaceState {
	if (!spaceExists(state, id)) id = MAIN_SPACE;
	if (spaceOf(state, item) === id) return state;
	const field = item.kind === "project" ? "projects" : "conversations";
	const membership = { ...state[field] };
	if (id === MAIN_SPACE) delete membership[item.key];
	else
		Object.defineProperty(membership, item.key, { value: id, enumerable: true, configurable: true, writable: true });
	return { ...state, [field]: membership };
}

export function reorderSpace(state: SpaceState, source: string, target: string): SpaceState {
	const from = state.spaces.findIndex(({ id }) => id === source);
	const to = state.spaces.findIndex(({ id }) => id === target);
	if (from === -1 || to === -1 || from === to) return state;
	const spaces = [...state.spaces];
	spaces.splice(to, 0, ...spaces.splice(from, 1));
	return { ...state, spaces };
}

export function forgetSpace(state: SpaceState, id: string): SpaceState {
	if (id === MAIN_SPACE || !spaceExists(state, id)) return state;
	const locations = { ...state.locations };
	if (state.selected === id && locations[id]) locations[MAIN_SPACE] = locations[id];
	delete locations[id];
	return {
		spaces: state.spaces.filter((space) => space.id !== id),
		selected: state.selected === id ? MAIN_SPACE : state.selected,
		projects: Object.fromEntries(Object.entries(state.projects).filter(([, owner]) => owner !== id)),
		conversations: Object.fromEntries(Object.entries(state.conversations).filter(([, owner]) => owner !== id)),
		locations,
	};
}

export const spaceEditorAtom = atom<{ space?: Space; move?: SpaceItem } | null>(null);
