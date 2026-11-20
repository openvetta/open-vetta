/**
 * VettaKbd 的键位解析：把快捷键串或键位 token 解析成各平台的显示文案。
 *
 * 约定：
 * - 快捷键串用 "+" 连接（"mod+shift+k"），token 大小写不敏感，多单词写法按去空格匹配
 *   （"CmdOrCtrl" / "page up"）。
 * - "mod" 是平台主修饰键：mac 显示 ⌘，windows/linux 显示 Ctrl；"ctrl" 始终指物理 Control 键，
 *   因此 mac 上显示 ⌃、windows 上显示 Ctrl。需要完全分系统时，把该项写成
 *   { mac: "⌃", windows: "Ctrl" } 这类对象。
 * - mac 的修饰键与功能键按硬件印字显示符号（⌘ ⌥ ⌃ ⇧ ⏎ ⎋ ⌫ …），windows/linux 显示单词。
 *   键盘印字不随界面语言翻译，故这里不接 i18n。
 */

export type VettaKbdPlatform = "mac" | "windows" | "linux";

/** 单项键位：token 字符串按平台解析；对象按平台直接给出文案。 */
export type VettaKbdKey = string | Partial<Record<VettaKbdPlatform, string>>;

type LabelTable = Record<string, string>;

const ARROW_LABELS: LabelTable = {
	up: "↑",
	arrowup: "↑",
	down: "↓",
	arrowdown: "↓",
	left: "←",
	arrowleft: "←",
	right: "→",
	arrowright: "→",
};

const MOD_ALIASES = ["mod", "cmdorctrl", "cmdorcontrol", "commandorcontrol", "controlormeta"];

function withMod(table: LabelTable, modLabel: string): LabelTable {
	const out: LabelTable = { ...table };
	for (const alias of MOD_ALIASES) out[alias] = modLabel;
	return out;
}

const MAC_LABELS: LabelTable = withMod(
	{
		...ARROW_LABELS,
		cmd: "⌘",
		command: "⌘",
		meta: "⌘",
		win: "⌘",
		ctrl: "⌃",
		control: "⌃",
		alt: "⌥",
		option: "⌥",
		opt: "⌥",
		shift: "⇧",
		enter: "⏎",
		return: "⏎",
		backspace: "⌫",
		delete: "⌦",
		del: "⌦",
		esc: "⎋",
		escape: "⎋",
		tab: "⇥",
		capslock: "⇪",
		caps: "⇪",
		space: "Space",
		spacebar: "Space",
		home: "↖",
		end: "↘",
		pageup: "⇞",
		pagedown: "⇟",
		fn: "fn",
		plus: "+",
		minus: "-",
	},
	"⌘",
);

const WINDOWS_LABELS: LabelTable = withMod(
	{
		...ARROW_LABELS,
		cmd: "Win",
		command: "Win",
		meta: "Win",
		win: "Win",
		ctrl: "Ctrl",
		control: "Ctrl",
		alt: "Alt",
		option: "Alt",
		opt: "Alt",
		shift: "Shift",
		enter: "Enter",
		return: "Enter",
		backspace: "Backspace",
		delete: "Del",
		del: "Del",
		esc: "Esc",
		escape: "Esc",
		tab: "Tab",
		capslock: "Caps",
		caps: "Caps",
		space: "Space",
		spacebar: "Space",
		home: "Home",
		end: "End",
		pageup: "PgUp",
		pagedown: "PgDn",
		fn: "Fn",
		plus: "+",
		minus: "-",
	},
	"Ctrl",
);

const LINUX_LABELS: LabelTable = {
	...WINDOWS_LABELS,
	cmd: "Super",
	command: "Super",
	meta: "Super",
	win: "Super",
};

const KEY_LABELS: Record<VettaKbdPlatform, LabelTable> = {
	mac: MAC_LABELS,
	windows: WINDOWS_LABELS,
	linux: LINUX_LABELS,
};

const SPOKEN_MAC: LabelTable = {
	...ARROW_LABELS,
	up: "Up Arrow",
	arrowup: "Up Arrow",
	down: "Down Arrow",
	arrowdown: "Down Arrow",
	left: "Left Arrow",
	arrowleft: "Left Arrow",
	right: "Right Arrow",
	arrowright: "Right Arrow",
	cmd: "Command",
	command: "Command",
	meta: "Command",
	win: "Command",
	ctrl: "Control",
	control: "Control",
	alt: "Option",
	option: "Option",
	opt: "Option",
	shift: "Shift",
	enter: "Return",
	return: "Return",
	backspace: "Delete",
	delete: "Forward Delete",
	del: "Forward Delete",
	esc: "Escape",
	escape: "Escape",
	tab: "Tab",
	capslock: "Caps Lock",
	caps: "Caps Lock",
	space: "Space",
	spacebar: "Space",
	home: "Home",
	end: "End",
	pageup: "Page Up",
	pagedown: "Page Down",
	fn: "Fn",
	plus: "Plus",
	minus: "Minus",
};

const SPOKEN_WINDOWS: LabelTable = {
	...SPOKEN_MAC,
	up: "Up Arrow",
	cmd: "Windows",
	command: "Windows",
	meta: "Windows",
	win: "Windows",
	alt: "Alt",
	option: "Alt",
	opt: "Alt",
	backspace: "Backspace",
	delete: "Delete",
	del: "Delete",
};

const SPOKEN_LABELS: Record<VettaKbdPlatform, LabelTable> = {
	mac: withMod(SPOKEN_MAC, "Command"),
	windows: withMod(SPOKEN_WINDOWS, "Control"),
	linux: withMod({ ...SPOKEN_WINDOWS, cmd: "Super", command: "Super", meta: "Super", win: "Super" }, "Control"),
};

/** 当前窗口所在平台；只在宿主确实拿不到平台信息时回落到 windows。 */
export function detectKbdPlatform(): VettaKbdPlatform {
	if (typeof navigator === "undefined") return "windows";
	const platform = navigator.platform?.toUpperCase() ?? "";
	if (platform.includes("MAC")) return "mac";
	if (platform.includes("WIN")) return "windows";
	if (platform.includes("LINUX")) return "linux";
	const ua = navigator.userAgent ?? "";
	if (/Mac OS X|Macintosh/.test(ua)) return "mac";
	if (/Windows/.test(ua)) return "windows";
	return "linux";
}

function normalizeToken(token: string): string {
	return token.trim().toLowerCase().replace(/\s+/g, "");
}

/** 把快捷键串拆成键位；数组输入原样返回（保留分系统对象）。 */
export function splitKbdKeys(keys: string | readonly VettaKbdKey[]): VettaKbdKey[] {
	if (typeof keys !== "string") return [...keys];
	const trimmed = keys.trim();
	if (!trimmed) return [];
	return trimmed
		.split("+")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

/** 解析单个键位的显示文案。未知 token 原样返回，避免静默吞掉按键。 */
export function resolveKbdKey(key: VettaKbdKey, platform: VettaKbdPlatform = detectKbdPlatform()): string {
	if (typeof key !== "string") {
		return key[platform] ?? key.windows ?? key.mac ?? key.linux ?? "";
	}
	const token = normalizeToken(key);
	if (!token) return "";
	const label = KEY_LABELS[platform][token];
	if (label !== undefined) return label;
	if (/^f([1-9]|1[0-2])$/.test(token)) return token.toUpperCase();
	if (token.length === 1) return token.toUpperCase();
	return key.trim();
}

/** 解析整串快捷键的显示文案（逐键）。 */
export function resolveKbdKeys(
	keys: string | readonly VettaKbdKey[],
	platform: VettaKbdPlatform = detectKbdPlatform(),
): string[] {
	return splitKbdKeys(keys).map((key) => resolveKbdKey(key, platform));
}

/** 逐键的读屏文案（键帽符号本身读不出含义）。 */
export function describeKbdKeys(
	keys: string | readonly VettaKbdKey[],
	platform: VettaKbdPlatform = detectKbdPlatform(),
): string {
	const spoken = splitKbdKeys(keys).map((key) => {
		if (typeof key !== "string") return resolveKbdKey(key, platform);
		const token = normalizeToken(key);
		const label = SPOKEN_LABELS[platform][token];
		if (label !== undefined) return label;
		if (/^f([1-9]|1[0-2])$/.test(token)) return token.toUpperCase();
		if (token.length === 1) return token.toUpperCase();
		return key.trim();
	});
	return spoken.filter((part) => part.length > 0).join(" ");
}
