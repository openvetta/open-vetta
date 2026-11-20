/**
 * 双语发布说明的格式定义与校验：`.github/release-notes/v<version>.md`。
 *
 * 这份文件同时是 GitHub Release 正文和安装包里的「本版本功能」，读者是用户而不是
 * 维护者。所以格式被固定成「## English」+「## 中文」两段、每段最多几条、每条一句
 * 用户能看到的变化——发版前的机器门禁读的就是这里的规则，不靠人自觉。
 *
 * 开发流水不写在这里：commit 与 PR 描述是维护者的记录，取用方式见 README。
 */

export const RELEASE_NOTE_LANGUAGES = ["en", "zh"];

/** 允许的小节，中英各一套；「升级注意」只在有破坏性变更或迁移成本时才写。 */
export const SECTION_LABELS = {
	en: { added: "New", improved: "Improvements", fixed: "Fixes", upgrade: "Upgrade notes" },
	zh: { added: "新增", improved: "改进", fixed: "修复", upgrade: "升级注意" },
};

/** 上限定成能保住「一眼读完」的量级：超了就合并成主题，而不是加长列表。 */
export const LIMITS = {
	itemsPerLanguage: 6,
	// 中文一个字承载的信息量约为英文三个字符，因此上限按语言分开。
	itemLength: { en: 240, zh: 90 },
};

const LANGUAGE_BY_HEADING = new Map([
	["english", "en"],
	["中文", "zh"],
]);

const SECTION_BY_HEADING = {
	en: new Map([
		["new", "added"],
		["improvements", "improved"],
		["fixes", "fixed"],
		["upgrade notes", "upgrade"],
	]),
	zh: new Map([
		["新增", "added"],
		["改进", "improved"],
		["修复", "fixed"],
		["升级注意", "upgrade"],
	]),
};

const FOOTER_PATTERN = /^\*\*Full Changelog\*\*:\s*(\S+)\s*$/;

// 「占位」单独出现常是一句正常描述（如「不是仓库的项目既不占位」），只有括号包起来的标记
// 「（占位）」、后接「文字/符」的「占位文字」，才算待补内容。
const PLACEHOLDER = /\b(TODO|TBD|FIXME)\b|待补|待填|[（(【\[]\s*占位|占位\s*[）)】\]]|占位[文字符]/;

/** 用户读不懂的内部标识：命中的原文会进报错，方便直接改。 */
const INTERNAL_REFERENCES = [
	[/`[^`\n]*\.(?:ts|tsx|js|jsx|mjs|cjs|json|lock|yml|yaml|sh|go|swift|kt)`/i, "文件名"],
	[/(?:^|[\s`(（])(?:apps|packages|scripts|src)\/[\w.@/-]+/, "仓库路径"],
	[/(?<![\w&/])#\d+/, "issue / PR 编号"],
];

/** 内部工程术语：出现在用户正文里说明这一条还停在开发视角。 */
const INTERNAL_TERMS = ["重构", "单测", "守卫", "类型检查", "回归测试", "refactor", "unit test", "typecheck", "monorepo"];

function emptyLanguage() {
	return {
		total: 0,
		items: [],
		sections: { added: [], improved: [], fixed: [], upgrade: [] },
	};
}

/**
 * 把发布说明拆成「语言 → 小节 → 条目」。
 * 只有同时认得两段标题，才说明这份文件已经是双语格式；旧文件按单语正文处理。
 */
export function parseReleaseNotes(text) {
	const parsed = {
		title: null,
		version: null,
		footerUrl: null,
		hasLanguageHeadings: false,
		languages: { en: emptyLanguage(), zh: emptyLanguage() },
		strayHeadings: [],
		strayBullets: [],
	};
	let language = null;
	let section = null;
	let line = 0;
	for (const raw of String(text ?? "").replace(/\r\n/g, "\n").split("\n")) {
		line += 1;
		const trimmed = raw.trimEnd();
		if (!trimmed.trim()) continue;

		const title = /^# (.+)$/.exec(trimmed);
		if (title) {
			if (!language) {
				parsed.title = title[1].trim();
				parsed.version = /^Vetta (\d+\.\d+\.\d+)$/.exec(parsed.title)?.[1] ?? null;
			}
			continue;
		}

		const footer = FOOTER_PATTERN.exec(trimmed);
		if (footer) {
			parsed.footerUrl = footer[1];
			continue;
		}

		const h2 = /^## (.+)$/.exec(trimmed);
		if (h2) {
			const key = LANGUAGE_BY_HEADING.get(h2[1].trim().toLowerCase());
			if (key) {
				language = key;
				section = null;
				parsed.hasLanguageHeadings = true;
			} else {
				parsed.strayHeadings.push({ level: 2, heading: h2[1].trim(), line });
				section = null;
			}
			continue;
		}

		const h3 = /^### (.+)$/.exec(trimmed);
		if (h3) {
			const key = language ? SECTION_BY_HEADING[language].get(h3[1].trim().toLowerCase()) : undefined;
			if (key) {
				section = key;
			} else {
				parsed.strayHeadings.push({ level: 3, heading: h3[1].trim(), line });
				section = null;
			}
			continue;
		}

		const bullet = /^[-*] (.+)$/.exec(trimmed);
		if (!bullet) continue;
		if (!language || !section) {
			parsed.strayBullets.push({ line, text: bullet[1].trim() });
			continue;
		}
		const item = { section, text: bullet[1].trim(), line };
		parsed.languages[language].items.push(item);
		parsed.languages[language].sections[section].push(item);
		parsed.languages[language].total += 1;
	}
	return parsed;
}

function itemLength(language, text) {
	return language === "zh" ? [...text].length : text.length;
}

/**
 * 发版前的定稿门禁：结构、条数、长度、内部术语、Footer 全在这里判。
 * `version` / `previousTag` 用来核对文末的 Full Changelog 指向对不对。
 *
 * @returns {{ problems: string[], warnings: string[], stats: { en: number, zh: number } }}
 */
export function validateReleaseNotes(text, { version, previousTag } = {}) {
	const parsed = parseReleaseNotes(text);
	const problems = [];
	const warnings = [];

	if (!parsed.hasLanguageHeadings) {
		problems.push("发布说明要分 `## English` 与 `## 中文` 两段（英文在上）：两段同现于 GitHub，应用内按界面语言只显示一段");
	}

	for (const stray of parsed.strayHeadings) {
		problems.push(
			`第 ${stray.line} 行的标题「${"#".repeat(stray.level)} ${stray.heading}」不是允许的小节；用 新增 / 改进 / 修复 / 升级注意（英文 New / Improvements / Fixes / Upgrade notes）`,
		);
	}
	for (const stray of parsed.strayBullets) {
		problems.push(`第 ${stray.line} 行的条目不在任何小节里；放进 新增 / 改进 / 修复 / 升级注意 之下`);
	}

	for (const language of RELEASE_NOTE_LANGUAGES) {
		const block = parsed.languages[language];
		if (block.total > LIMITS.itemsPerLanguage) {
			problems.push(
				`${language === "zh" ? "中文" : "English"} 有 ${block.total} 条，超过 ${LIMITS.itemsPerLanguage} 条上限；把同类合并成主题，细节留在代码与 PR 里`,
			);
		}
		for (const item of block.items) {
			const limit = LIMITS.itemLength[language];
			const length = itemLength(language, item.text);
			if (length > limit) {
				problems.push(`第 ${item.line} 行的条目有 ${length} 字，超过 ${limit} 字上限：一条只讲一件事，把解释挪到 PR 描述`);
			}
			for (const [pattern, why] of INTERNAL_REFERENCES) {
				const match = pattern.exec(item.text);
				if (match) {
					problems.push(`第 ${item.line} 行的条目里出现${why}「${match[0]}」，用户读不懂；改写成人能看到的变化`);
				}
			}
			const term = INTERNAL_TERMS.find((word) =>
				language === "zh" ? item.text.includes(word) : item.text.toLowerCase().includes(word),
			);
			if (term) {
				problems.push(`第 ${item.line} 行提到内部术语「${term}」；换成用户能感知的变化，或说明它带来的影响`);
			}
		}
	}

	const stats = { en: parsed.languages.en.total, zh: parsed.languages.zh.total };
	if (stats.en === 0 && stats.zh === 0) {
		problems.push("发布说明没有任何条目：中英两段都要写；只含内部改动的版本用一句话说明「界面没有可见变化」");
	} else if (parsed.hasLanguageHeadings && (stats.en === 0 || stats.zh === 0)) {
		problems.push(`中英两段都要有条目：English ${stats.en} 条 / 中文 ${stats.zh} 条，缺的那段是漏译`);
	} else if (parsed.hasLanguageHeadings && stats.en !== stats.zh) {
		problems.push(`中英条目数不一致：English ${stats.en} 条 / 中文 ${stats.zh} 条，两段要一一对应`);
	}

	if (!parsed.footerUrl) {
		problems.push(
			"文末缺一行 `**Full Changelog**: https://github.com/openvetta/open-vetta/compare/v<上一版>...v<版本>`：这是维护者查看全部改动的入口",
		);
	} else {
		if (version && !parsed.footerUrl.endsWith(`...v${version}`)) {
			problems.push(`Full Changelog 的终点应是 v${version}，现在是 ${parsed.footerUrl}`);
		}
		if (previousTag && !parsed.footerUrl.includes(`/${previousTag}...`)) {
			problems.push(`Full Changelog 的起点应是上一版 ${previousTag}，现在是 ${parsed.footerUrl}`);
		}
	}

	if (PLACEHOLDER.test(text)) problems.push("发布说明里还有占位文字（TODO / TBD / 待补…）");

	return { problems, warnings, stats };
}

/** 预检摘要用的一句话，例：`中文 4 条（新增 1 / 改进 3）/ English 4 条`。 */
export function summarizeReleaseNotes(text) {
	const parsed = parseReleaseNotes(text);
	const zh = parsed.languages.zh;
	const sections = Object.entries(zh.sections)
		.filter(([, items]) => items.length > 0)
		.map(([key, items]) => `${SECTION_LABELS.zh[key]} ${items.length}`);
	const zhText = `中文 ${zh.total} 条${sections.length > 0 ? `（${sections.join(" / ")}）` : ""}`;
	return `${zhText}/ English ${parsed.languages.en.total} 条`;
}

const COMPARE_BASE = "https://github.com/openvetta/open-vetta/compare";
const COMMITS_BASE = "https://github.com/openvetta/open-vetta/commits";

/** 开新版本时的空骨架：结构给全，条目留空，靠发版前的门禁逼着补。 */
export function releaseNoteTemplate({ version, previousVersion = null }) {
	const footer = previousVersion
		? `**Full Changelog**: ${COMPARE_BASE}/v${previousVersion}...v${version}`
		: `**Full Changelog**: ${COMMITS_BASE}/v${version}`;
	return [
		`# Vetta ${version}`,
		"<!-- release-status: unreleased -->",
		"",
		"## English",
		"",
		"### New",
		"",
		"### Improvements",
		"",
		"### Fixes",
		"",
		"## 中文",
		"",
		"### 新增",
		"",
		"### 改进",
		"",
		"### 修复",
		"",
		footer,
		"",
	].join("\n");
}
