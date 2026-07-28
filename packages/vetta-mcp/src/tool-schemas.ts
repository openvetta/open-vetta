/**
 * 工具的 JSON Schema 与说明文案。
 *
 * 说明文案刻意写得细：这是 agent 唯一的规范来源，写清必填项与各形态差异，
 * 能把「试一次、被拒、再试」的来回压成一次成功调用。
 */

const showcaseSchema = {
	type: "object",
	required: ["template", "user_prompt", "assistant_reply"],
	properties: {
		template: {
			type: "string",
			enum: ["chat-over-canvas", "chat-thread"],
			description: "呈现模板。chat-over-canvas 适合有画布产出的能力（设计/代码/文档），chat-thread 是纯对话演示。",
		},
		user_prompt: { type: "string", description: "演示用的用户提问" },
		assistant_reply: { type: "string", description: "演示用的助手回复" },
		canvas: {
			type: "string",
			enum: ["design", "code", "docs", "generic"],
			description: "画布母题，仅 chat-over-canvas 可用",
		},
		brand_icon_url: { type: "string", description: "助手头像图 URL，须 http(s):// 开头" },
		brand_name: { type: "string", description: "助手署名" },
	},
	additionalProperties: false,
} as const;

const metaSchema = {
	type: "object",
	required: ["value"],
	properties: {
		key: {
			type: "string",
			enum: ["homepage", "repository", "docs", "license"],
			description: "预置键，客户端按用户语言自动出 label。非预置项请改用 label。",
		},
		label: { type: "string", description: "自定义条目的展示名，仅在没有 key 时使用" },
		value: { type: "string", description: "展示值；http(s):// 开头会渲染成可点击链接" },
	},
	additionalProperties: false,
} as const;

const localeOverrideSchema = {
	type: "object",
	properties: {
		name: { type: "string" },
		description: { type: "string" },
		content: { type: "string" },
		showcases: { type: "array", items: showcaseSchema },
		meta: { type: "array", items: metaSchema },
	},
	additionalProperties: false,
} as const;

const detailSchema = {
	type: "object",
	required: ["name", "description", "author", "content"],
	description: "能力的全部展示信息。顶层是默认语言，i18n 覆盖其它语言，两者字段一一对应。",
	properties: {
		name: { type: "string", description: "【必填】展示名，市场卡片与详情页的标题" },
		description: { type: "string", description: "【必填】一句话简介，市场卡片用" },
		author: { type: "string", description: "【必填】作者署名" },
		content: { type: "string", description: "【必填】详情页正文（markdown）。用户装之前靠它判断这是什么。" },
		license: { type: "string", description: "开源协议标识，如 MIT" },
		icon: {
			type: "string",
			description: "图标三态：留空用默认图标；solar:xxx-bold 用 Iconify Solar 实心图标；或 http(s):// 外链。",
		},
		tags: { type: "array", items: { type: "string" }, description: "自由标签，与受管的 category 正交" },
		showcases: { type: "array", items: showcaseSchema, description: "详情页头图，结构化，不走正文" },
		meta: {
			type: "array",
			items: metaSchema,
			description: "详情页元信息（官网/仓库/文档/协议…）。有序数组，顺序即展示顺序。",
		},
		i18n: {
			type: "object",
			additionalProperties: localeOverrideSchema,
			description:
				"按语言的译文覆盖，键为 locale（如 en / zh）。命中即整体替换该字段，未提供的字段回落顶层默认语言。",
		},
	},
	additionalProperties: false,
} as const;

export const UPLOAD_ABILITY_SCHEMA = {
	type: "object",
	required: ["type", "detail"],
	properties: {
		type: {
			type: "string",
			enum: ["skill", "scene", "mcp", "plugin", "bundle"],
			description:
				"能力形态。skill/scene/plugin 有安装包（必须给 package_path）；mcp 只是一段配置；bundle 是若干已上架能力的组合。",
		},
		slug: {
			type: "string",
			description:
				"机器标识，与 type 联合唯一，仅允许字母数字 . _ -。**mcp / bundle 必填**；skill/scene/plugin 由包内 manifest 决定（plugin.json 的 id / SKILL.md 的 name），传了也会被忽略。",
		},
		package_path: {
			type: "string",
			description:
				"【skill/scene/plugin 必填】本地安装包的绝对路径。plugin 必须是 .zip（内含 plugin.json）；skill/scene 接受 .zip 或 .tar.gz（内含 SKILL.md）。",
		},
		detail: detailSchema,
		mcp_config: {
			type: "object",
			description: "【mcp 必填】原样写进用户 mcp.json 的配置块，如 { command, args } 或 { transport, url }。",
			additionalProperties: true,
		},
		members: {
			type: "array",
			description: "【bundle 必填】成员清单，恒为一层，不能嵌套 bundle。成员须是已上架条目。",
			items: {
				type: "object",
				required: ["type", "slug"],
				properties: {
					type: { type: "string", enum: ["skill", "scene", "mcp", "plugin"] },
					slug: { type: "string" },
					inline: { type: "object", additionalProperties: true, description: "私有内联配置，仅 mcp 成员允许" },
				},
				additionalProperties: false,
			},
		},
		category: { type: "string", description: "用途分类名（设计/开发/写作…）。匹配不到受管分类时落为未分类。" },
		version: {
			type: "string",
			description:
				"版本号，仅允许字母数字 . _ -。plugin 恒以 plugin.json 为准，此处传了无效；其余形态留空则新条目为 1.0.0、重传自动 patch+1。",
		},
	},
	additionalProperties: false,
} as const;

export const UPLOAD_ABILITY_DESCRIPTION = `把一个能力（skill / scene / mcp / plugin / bundle）提交到 Vetta 能力市场。

提交前请确认：
1. detail 的 name / description / author / content 四项必填，缺一不可。content 是详情页正文（markdown），要让用户在安装前看懂这个能力做什么。
2. skill / scene / plugin 必须提供 package_path 指向本地安装包；mcp 必须提供 mcp_config；bundle 必须提供 members。
3. mcp 与 bundle 还需要显式给 slug；带安装包的形态由包内 manifest 决定 slug，不用给。
4. 需要多语言时用 detail.i18n，键是 locale。插件包内如果有 locales/*.json，服务端会自动展开为多语言，无需重复填写。

非管理员提交的内容会进入待审队列，管理员审核通过后才在市场中可见。若该条目此前已上架，新版本会挂在待审槽里，审核期间市场继续展示当前线上版本，已安装的用户不受影响。

校验失败时会一次性列出全部问题，请按清单一并修正后重试。`;

export const LIST_MY_ABILITIES_DESCRIPTION = `列出当前登录用户提交过的全部能力，含审核状态与驳回理由。

用它回答「我提交的那个过审了吗」「为什么被打回」。review_status 取值：pending（待审）、approved（已上架）、rejected（被驳回，理由见 review_note）。pending_version 非空表示该条目有一个新版本正压在待审槽里，线上仍是旧版本。`;

export const LIST_MY_ABILITIES_SCHEMA = {
	type: "object",
	properties: {},
	additionalProperties: false,
} as const;
