/**
 * 生成感的机检：把 skill 规则表里「量得出来」的那几条，在截图的同一帧 DOM 上量。
 *
 * 和 layout-probe 的区别在判据的性质：那边量的是「一定画错了」（空图标、被裁的字），
 * 这边量的是审美规则——渐变、静止阴影、玻璃、字距拉开的小号大写、正文太小、等宽字、
 * 图标方块、表情符号。它们不是错，是用户一眼读成「AI 做的」的那些习惯，taste-skill
 * 的研究里高分站点几乎不用。模型看自己的截图时恰恰最认不出这些，所以交给量。
 *
 * 只在发过方向的设计上报（`direction.json` 里有选定的方向）：风格包或 DESIGN.md 主导的
 * 设计可能正需要其中某样东西，那时报出来就是误报。规则来自 taste-skill v2 的
 * scripts/lib/rules.mjs（MIT），阈值按 frame 的落地页 / App 两种语境区分，见 TELL_RULES。
 */

import type { SourceIssue } from "./check-sources";
import type { DirectionTells } from "../direction/record";

/** 每条规则最多回报几处，同 layout-probe。 */
const MAX_PER_RULE = 3;

/**
 * 在离屏页面里执行，与 LAYOUT_PROBE_SCRIPT 拼在一起跑（offscreen-raster.ts）。约束同那边：
 * 不依赖外部符号、不抛；每条规则各自 try 住。这里只量、只带回数值，阈值和措辞在
 * 下面的 TELL_RULES 里按语境决定。
 */
export const TELLS_PROBE_SCRIPT = `(() => {
	const MAX = ${MAX_PER_RULE};
	const out = [];
	const counts = {};
	const push = (rule, el, detail, value) => {
		counts[rule] = (counts[rule] || 0) + 1;
		if (counts[rule] > MAX) return;
		let node = el;
		let source = null;
		while (node && !source) {
			source = node.getAttribute && node.getAttribute("data-vetd-source");
			node = node.parentElement;
		}
		// 整页级的发现（字体数）挂在 body 上，带回整页文字只是噪音。
		const text = el && el !== document.body && el.textContent ? el.textContent.trim().slice(0, 40) : "";
		out.push({ rule, source: source || null, detail, text, value: typeof value === "number" ? value : null });
	};
	const safe = (fn) => { try { fn(); } catch {} };
	const root = document.body;
	if (!root) return [];
	const all = Array.from(root.querySelectorAll("*"));
	const visible = (el) => {
		const r = el.getBoundingClientRect();
		return r.width > 0 && r.height > 0;
	};
	const inside = (el, selector) => !!(el.closest && el.closest(selector));
	const CODE = "pre, code, kbd, samp";
	const FLOATING = '[role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"], dialog';
	// 有自己文字的叶子元素：只量真正显示文字的那一层，父元素的 font-size 不代表读到的字。
	const ownText = (el) => {
		for (const child of el.childNodes) if (child.nodeType === 3 && (child.textContent || "").trim()) return true;
		return false;
	};
	const textEls = all.filter((el) => ownText(el) && visible(el));

	safe(() => {
		for (const el of all) {
			const style = getComputedStyle(el);
			const bg = style.backgroundImage || "";
			if (!/gradient\\(/.test(bg)) continue;
			const clip = style.webkitBackgroundClip || style.backgroundClip || "";
			if (clip === "text") { push("tell-gradient-text", el, bg.slice(0, 60)); continue; }
			const r = el.getBoundingClientRect();
			if (r.width * r.height < 1600) continue;
			// 照片上压字用的中性遮罩是唯一默认允许的渐变。
			if (el.parentElement && el.parentElement.querySelector("img, video")) continue;
			push("tell-gradient", el, bg.slice(0, 60));
		}
	});

	safe(() => {
		for (const el of all) {
			const style = getComputedStyle(el);
			if (style.position === "fixed" || style.position === "absolute" || style.position === "sticky") continue;
			if (inside(el, FLOATING)) continue;
			const shadow = style.boxShadow || "";
			if (!shadow || shadow === "none") continue;
			// 逐层拆：focus ring 之类 blur 为 0 的不算投影。取最大 blur 与最大 alpha。
			let blur = 0;
			let alpha = 0;
			for (const layer of shadow.split(/,(?![^(]*\\))/)) {
				if (/inset/.test(layer)) continue;
				const lengths = (layer.replace(/rgba?\\([^)]*\\)/g, "").match(/-?\\d*\\.?\\d+px/g) || []).map(parseFloat);
				const layerBlur = lengths[2] || 0;
				const a = /rgba\\([^)]*,\\s*([\\d.]+)\\)/.exec(layer);
				if (layerBlur > blur) blur = layerBlur;
				const layerAlpha = a ? parseFloat(a[1]) : 1;
				if (layerBlur > 0 && layerAlpha > alpha) alpha = layerAlpha;
			}
			if (blur <= 0) continue;
			push("tell-shadow", el, shadow.slice(0, 60), alpha);
		}
	});

	safe(() => {
		for (const el of all) {
			const style = getComputedStyle(el);
			const filter = style.backdropFilter || style.webkitBackdropFilter || "";
			if (/blur\\(/.test(filter)) push("tell-glass", el, filter);
		}
	});

	safe(() => {
		for (const el of textEls) {
			if (inside(el, CODE)) continue;
			const style = getComputedStyle(el);
			const size = parseFloat(style.fontSize) || 0;
			const tracking = parseFloat(style.letterSpacing) || 0;
			const text = (el.textContent || "").trim();
			const caps = style.textTransform === "uppercase" || (/[A-Z]{3}/.test(text) && text === text.toUpperCase());
			if (caps && size > 0 && size <= 14 && tracking >= size * 0.05) push("tell-micro-label", el, size + "px, tracking " + tracking.toFixed(1) + "px", size);
		}
	});

	safe(() => {
		for (const el of textEls) {
			const size = parseFloat(getComputedStyle(el).fontSize) || 0;
			if (size > 0 && size < 13) push("tell-small-text", el, size + "px", size);
		}
	});

	safe(() => {
		const families = new Map();
		for (const el of textEls) {
			const family = (getComputedStyle(el).fontFamily || "").split(",")[0].trim().replace(/^["']|["']$/g, "");
			if (!family) continue;
			const mono = /mono|courier|menlo|consolas|monospace/i.test(family);
			if (mono && !inside(el, CODE) && !inside(el, "[data-ui]")) push("tell-mono", el, family);
			if (mono) continue;
			families.set(family, (families.get(family) || 0) + 1);
		}
		if (families.size > 2) push("tell-font-count", root, Array.from(families.keys()).join(", "), families.size);
	});

	safe(() => {
		for (const el of root.querySelectorAll("h1, h2, h3")) {
			const size = parseFloat(getComputedStyle(el).fontSize) || 0;
			if (size < 32 || !visible(el)) continue;
			const tops = [];
			const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
			let node = walker.nextNode();
			while (node) {
				if ((node.textContent || "").trim()) {
					const range = document.createRange();
					range.selectNodeContents(node);
					for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0) tops.push(rect.top);
				}
				node = walker.nextNode();
			}
			tops.sort((a, b) => a - b);
			let lines = 0;
			let last = null;
			for (const top of tops) {
				if (last === null || top - last > size * 0.5) { lines += 1; last = top; }
			}
			if (lines > 2) push("tell-headline-lines", el, lines + " lines at " + size + "px", lines);
		}
	});

	// 图标方块：一个图标独占一个有底色的小方块。单个可能是 logo，三个以上就是一排
	// 「图标顶在卡片上」或「KPI 配彩色圆」。
	safe(() => {
		const tiles = [];
		for (const icon of root.querySelectorAll('[class*="icon-["]')) {
			const box = icon.parentElement;
			if (!box || box.children.length !== 1 || (box.textContent || "").trim()) continue;
			const r = box.getBoundingClientRect();
			if (r.width > 64 || r.height > 64 || Math.abs(r.width - r.height) > 4 || r.width < 20) continue;
			const bg = getComputedStyle(box).backgroundColor;
			if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") continue;
			tiles.push(box);
		}
		if (tiles.length >= 3) push("tell-icon-tile", tiles[0], tiles.length + " icons in tinted squares", tiles.length);
	});

	// 假图片位：一块渐变里放一个图标充当海报、封面或缩略图（实测 Emby 稿的海报全是
	// 这样）。只认渐变：纯色方块配图标是按钮和图标方块，另有规则。嵌套时报最里层。
	safe(() => {
		const fakes = [];
		for (const el of all) {
			const r = el.getBoundingClientRect();
			if (r.width < 64 || r.height < 64) continue;
			if (r.width > window.innerWidth * 0.95 && r.height > window.innerHeight * 0.5) continue;
			if (!/gradient\\(/.test(getComputedStyle(el).backgroundImage || "")) continue;
			if (el.querySelector("img, video, picture, canvas")) continue;
			if (!el.querySelector('[class*="icon-["], svg')) continue;
			if ((el.textContent || "").trim().length > 40) continue;
			// 1.586:1 带文字的渐变面是一张卡（银行卡、礼品卡），是物件不是图片位。
			if (Math.abs(r.width / r.height - 1.586) < 0.1 && (el.textContent || "").trim().length > 0) continue;
			fakes.push(el);
		}
		const innermost = fakes.filter((a) => !fakes.some((b) => b !== a && a.contains(b)));
		for (const el of innermost) {
			const r = el.getBoundingClientRect();
			push("tell-fake-media", el, Math.round(r.width) + "x" + Math.round(r.height) + " gradient holding an icon", innermost.length);
		}
	});

	// 真实图片数：<img>、<video>，以及用 url() 铺的背景图，面积至少 64x64。整帧一个计数。
	safe(() => {
		let pictures = 0;
		for (const el of all) {
			const r = el.getBoundingClientRect();
			if (r.width < 64 || r.height < 64) continue;
			const tag = el.tagName;
			if ((tag === "IMG" && el.naturalWidth > 0) || tag === "VIDEO") { pictures += 1; continue; }
			if (/url\\(/.test(getComputedStyle(el).backgroundImage || "")) pictures += 1;
		}
		push("tell-few-pictures", root, pictures + " real picture(s)", pictures);
	});

	// 只认默认按表情渲染的字符：© ® ™、箭头这类文字符号不算。
	safe(() => {
		for (const el of textEls) {
			const found = (el.textContent || "").match(/\\p{Emoji_Presentation}/u);
			if (found) push("tell-emoji", el, found[0]);
		}
	});

	return out;
})()`;

interface RawTell {
	rule: string;
	source: string | null;
	detail: string;
	text: string;
	value: number | null;
}

type Mode = DirectionTells["mode"];

interface TellRule {
	/** 这一条在该语境下是否成立（例如 App 允许 11px 以上的小字）。 */
	applies(finding: RawTell, mode: Mode, total: number): boolean;
	message(finding: RawTell, mode: Mode): string;
}

const quote = (finding: RawTell) => (finding.text ? ` — "${finding.text}"` : "");

/**
 * 渐变、阴影这类表现手法默认不许，App 方向写明理由就放行（direction/proposal.ts 的
 * devices）。报出来时告诉 agent 这条路：手法本身不是 AI 味，没理由地用才是。
 */
const deviceHint = (mode: Mode, device: string) =>
	mode === "app"
		? ` If this direction really needs it, propose the direction again with \`${device}\` in \`devices\` and the reason.`
		: "";

/**
 * 每条的报错写清「量到了什么」和「换成什么」。措辞对应 SKILL.md 的规则表和
 * references/taste/app-screens.md 的放宽项。
 */
const TELL_RULES: Record<string, TellRule> = {
	"tell-gradient": {
		applies: () => true,
		message: (f, mode) =>
			`Gradient fill (${f.detail}). A gradient nothing asked for reads as generated: use a flat colour or a tone step between surfaces; a neutral scrim over a photograph is always fine. House rules in the skill.${deviceHint(mode, "gradient")}`,
	},
	"tell-gradient-text": {
		applies: () => true,
		message: (f, mode) =>
			`Gradient-filled text${quote(f)}. Set text in one solid colour; the words carry the emphasis.${deviceHint(mode, "gradient")}`,
	},
	"tell-shadow": {
		// App 屏幕允许静止的卡片带很淡的阴影（模糊小、不透明度 8% 以下）。
		applies: (f, mode) => mode === "page" || (f.value ?? 1) > 0.08,
		message: (f, mode) =>
			`Shadow on an element at rest (${f.detail})${quote(f)}. Separate surfaces with a tone step or space; shadows belong to what floats — a menu, a popover, a dialog.${mode === "app" ? ` On app screens a resting card may carry at most a faint blur under 8% black.${deviceHint(mode, "shadow")}` : ""}`,
	},
	"tell-glass": {
		applies: () => true,
		message: (f, mode) =>
			`Backdrop blur (${f.detail}) — glass nothing asked for reads as generated. Use an opaque surface one tone step from the ground.${deviceHint(mode, "glass")}`,
	},
	"tell-micro-label": {
		// App 屏幕允许整屏一个（比如切换器上的上下文标签）。
		applies: (_f, mode, total) => mode === "page" || total > 1,
		message: (f, mode) =>
			`Tiny tracked uppercase label (${f.detail})${quote(f)}. Use sentence case at a readable size${mode === "page" ? ", or put the information in the heading itself — no eyebrows" : ", 12-14px grey above the value"}.${deviceHint(mode, "tracked-caps")}`,
	},
	"tell-small-text": {
		applies: (f, mode) => (f.value ?? 0) < (mode === "page" ? 13 : 11),
		message: (f, mode) =>
			`Text at ${f.detail}${quote(f)}. ${mode === "page" ? "Nothing meant to be read goes below 13px on a page; running text is 16px or more." : "Nothing on an app screen goes below 11px; meta and axis text sit at 11-12px."}`,
	},
	"tell-mono": {
		// App 风格可以把等宽字交给 ID 或全部数字，那是风格的决定。
		applies: (_f, mode) => mode === "page",
		message: (f) =>
			`Monospace outside code (${f.detail})${quote(f)}. Use the text face, with tabular-nums where figures align; monospace belongs in <pre>/<code> only.`,
	},
	"tell-font-count": {
		applies: () => true,
		message: (f, mode) =>
			`${f.value} typefaces in use (${f.detail}). Two at most — the direction's display and text faces; often one is enough.${deviceHint(mode, "third-face")}`,
	},
	"tell-headline-lines": {
		applies: (_f, mode) => mode === "page",
		message: (f) =>
			`Headline renders on ${f.detail}${quote(f)}. Headlines hold to two lines: cut words first, then widen the measure, change the size last.`,
	},
	"tell-icon-tile": {
		applies: () => true,
		message: (f) =>
			`${f.detail}. Icon-topped cards and icons in tinted squares are generated-UI tells: put a plain 16px icon inline with its label, or drop it and let the words and numbers lead.`,
	},
	"tell-fake-media": {
		applies: () => true,
		message: (f) =>
			`Picture slot faked with ${f.detail}${quote(f)}. A poster, cover, thumbnail or backdrop is a real picture: vetd_assets search, then get it at this slot's size and use it with object-cover. Real film posters and brand art are not downloaded — make the item fictional with a real photograph under its title.`,
	},
	"tell-few-pictures": {
		// 只管落地页：App 屏幕可以完全没有图（设置页、报表），有没有该由内容决定。
		applies: (f, mode) => mode === "page" && (f.value ?? 0) < 4,
		message: (f) =>
			`The page carries ${f.detail}. A landing page needs at least four, usually six to twelve, of one family: find them with vetd_assets (queries from the subject's place, materials and objects) and place them large where the blueprints put pictures.`,
	},
	"tell-emoji": {
		applies: () => true,
		message: (f) => `Emoji "${f.detail}" in the design${quote(f)}. Use words, or an Iconify glyph where a symbol helps.`,
	},
};

/** 被方向表放行的规则（例如带阴影的 App 风格），以及保留品牌配色字体时不归方向管的那几条。 */
export const TELL_RULE_IDS = Object.keys(TELL_RULES);

function isRawTell(value: unknown): value is RawTell {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.rule === "string" &&
		candidate.rule.startsWith("tell-") &&
		typeof candidate.detail === "string" &&
		typeof candidate.text === "string" &&
		(candidate.source === null || typeof candidate.source === "string") &&
		(candidate.value === null || typeof candidate.value === "number" || candidate.value === undefined)
	);
}

function splitSource(source: string | null, fallbackFile: string): { file: string; line: number | null } {
	if (source === null) return { file: fallbackFile, line: null };
	const at = source.lastIndexOf(":");
	if (at < 0) return { file: source, line: null };
	const line = Number.parseInt(source.slice(at + 1), 10);
	return Number.isFinite(line) ? { file: source.slice(0, at), line } : { file: source, line: null };
}

/**
 * 探针结果 → issue。
 *
 * 与 layoutIssues 不同，这里保留定位到 components/ 和 `_layout.tsx` 的发现：一张卡片的
 * 阴影写在 StatCard 组件里，改组件就是对的改法；只丢掉指向别的画框的（同一棵树里不会
 * 出现，防的是定位异常）。`tells` 为 null 表示这份设计没发过方向，整类规则不报。
 */
export function tellIssues(probe: unknown, frameId: string, tells: DirectionTells | null): SourceIssue[] {
	if (!tells || !Array.isArray(probe)) return [];
	const framePath = `frames/${frameId}.tsx`;
	const findings = probe.filter(isRawTell).map((entry) => ({ ...entry, value: entry.value ?? null }));
	const totals = new Map<string, number>();
	for (const finding of findings) totals.set(finding.rule, (totals.get(finding.rule) ?? 0) + 1);
	const issues: SourceIssue[] = [];
	for (const finding of findings) {
		const rule = TELL_RULES[finding.rule];
		if (!rule || tells.allow.includes(finding.rule)) continue;
		if (!rule.applies(finding, tells.mode, totals.get(finding.rule) ?? 0)) continue;
		const { file, line } = splitSource(finding.source, framePath);
		const shared = file.startsWith("components/") || file === "frames/_layout.tsx";
		if (file !== framePath && !shared) continue;
		issues.push({ file, line, rule: finding.rule, message: rule.message(finding, tells.mode) });
	}
	return issues;
}
