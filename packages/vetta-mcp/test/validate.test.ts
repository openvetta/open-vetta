import { describe, expect, it } from "vitest";
import type { UploadAbilityInput } from "../src/types.js";
import { validateUploadInput } from "../src/validate.js";

/** 一份各形态都能过校验的基底 detail */
function detail() {
	return {
		name: "演示插件",
		description: "一句话简介",
		author: "某作者",
		content: "# 详情正文\n\n这个插件做什么。",
	};
}

function pluginInput(overrides: Partial<UploadAbilityInput> = {}): UploadAbilityInput {
	return {
		type: "plugin",
		package_path: "/tmp/demo.zip",
		detail: detail(),
		...overrides,
	};
}

const existsAlways = () => true;

describe("validateUploadInput", () => {
	it("完整的 plugin 提交通过", () => {
		expect(validateUploadInput(pluginInput(), { packageExists: existsAlways })).toEqual([]);
	});

	it("type 非法时只报 type，不产出误导性的连带错误", () => {
		const errors = validateUploadInput({ type: "widget" } as unknown as UploadAbilityInput);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain("type 必填");
	});

	describe("detail 必填项", () => {
		const required = ["name", "description", "author", "content"] as const;
		for (const field of required) {
			it(`缺 ${field} 被拒`, () => {
				const d = detail() as Record<string, string>;
				d[field] = "   ";
				const errors = validateUploadInput(pluginInput({ detail: d }), { packageExists: existsAlways });
				expect(errors.some((e) => e.startsWith(`detail.${field}`))).toBe(true);
			});
		}

		it("缺 detail 整体时给一条明确提示", () => {
			const errors = validateUploadInput({ type: "plugin", package_path: "/tmp/a.zip" } as UploadAbilityInput, {
				packageExists: existsAlways,
			});
			expect(errors.some((e) => e.startsWith("detail 必填"))).toBe(true);
		});

		it("一次列全所有问题而不是只报第一个", () => {
			const errors = validateUploadInput({ type: "plugin", detail: {} } as UploadAbilityInput);
			// name/description/author/content 四项 + package_path 一项
			expect(errors.length).toBeGreaterThanOrEqual(5);
		});
	});

	describe("图标三态", () => {
		it.each(["", "solar:star-bold", "https://example.com/a.png", "http://example.com/a.png"])("接受 %s", (icon) => {
			const errors = validateUploadInput(pluginInput({ detail: { ...detail(), icon } }), {
				packageExists: existsAlways,
			});
			expect(errors).toEqual([]);
		});

		it.each(["ftp://example.com/a.png", "./icon.png", "mdi:home"])("拒绝 %s", (icon) => {
			const errors = validateUploadInput(pluginInput({ detail: { ...detail(), icon } }), {
				packageExists: existsAlways,
			});
			expect(errors.some((e) => e.startsWith("detail.icon"))).toBe(true);
		});
	});

	describe("安装包", () => {
		it("skill/scene/plugin 缺 package_path 被拒", () => {
			const errors = validateUploadInput({ type: "skill", detail: detail() } as UploadAbilityInput);
			expect(errors.some((e) => e.includes("package_path"))).toBe(true);
		});

		it("plugin 只接受 .zip", () => {
			const errors = validateUploadInput(pluginInput({ package_path: "/tmp/demo.tar.gz" }), {
				packageExists: existsAlways,
			});
			expect(errors.some((e) => e.includes("必须是 .zip"))).toBe(true);
		});

		it("skill 接受 .tar.gz", () => {
			const input = { type: "skill", package_path: "/tmp/demo.tar.gz", detail: detail() } as UploadAbilityInput;
			expect(validateUploadInput(input, { packageExists: existsAlways })).toEqual([]);
		});

		it("文件不存在时报出具体路径", () => {
			const errors = validateUploadInput(pluginInput(), { packageExists: () => false });
			expect(errors.some((e) => e.includes("/tmp/demo.zip"))).toBe(true);
		});

		it("带包的形态不要求 slug（由 manifest 决定）", () => {
			expect(validateUploadInput(pluginInput(), { packageExists: existsAlways })).toEqual([]);
		});
	});

	describe("mcp", () => {
		it("必须有 slug 与 mcp_config", () => {
			const errors = validateUploadInput({ type: "mcp", detail: detail() } as UploadAbilityInput);
			expect(errors.some((e) => e.includes("slug"))).toBe(true);
			expect(errors.some((e) => e.includes("mcp_config"))).toBe(true);
		});

		it("齐全时通过", () => {
			const input = {
				type: "mcp",
				slug: "context7",
				detail: detail(),
				mcp_config: { transport: "http", url: "https://example.com/mcp" },
			} as UploadAbilityInput;
			expect(validateUploadInput(input)).toEqual([]);
		});

		it("slug 含非法字符被拒（会拼进对象存储 key）", () => {
			const input = {
				type: "mcp",
				slug: "../etc/passwd",
				detail: detail(),
				mcp_config: { url: "x" },
			} as UploadAbilityInput;
			expect(validateUploadInput(input).some((e) => e.includes("slug 含非法字符"))).toBe(true);
		});
	});

	describe("bundle", () => {
		const base = { type: "bundle", slug: "starter", detail: detail() } as UploadAbilityInput;

		it("缺成员被拒", () => {
			expect(validateUploadInput(base).some((e) => e.includes("members"))).toBe(true);
		});

		it("不能嵌套 bundle", () => {
			const input = {
				...base,
				members: [{ type: "bundle", slug: "other" }],
			} as unknown as UploadAbilityInput;
			expect(validateUploadInput(input).some((e) => e.includes("不能嵌套"))).toBe(true);
		});

		it("成员重复被拒", () => {
			const input = {
				...base,
				members: [
					{ type: "skill", slug: "a" },
					{ type: "skill", slug: "a" },
				],
			} as UploadAbilityInput;
			expect(validateUploadInput(input).some((e) => e.includes("成员重复"))).toBe(true);
		});

		it("仅 mcp 成员允许 inline", () => {
			const bad = {
				...base,
				members: [{ type: "skill", slug: "a", inline: { x: 1 } }],
			} as UploadAbilityInput;
			expect(validateUploadInput(bad).some((e) => e.includes("仅 mcp 成员允许"))).toBe(true);

			const good = {
				...base,
				members: [{ type: "mcp", slug: "a", inline: { url: "x" } }],
			} as UploadAbilityInput;
			expect(validateUploadInput(good)).toEqual([]);
		});
	});

	describe("showcase 与 meta 形状", () => {
		it("模板必须在白名单内", () => {
			const d = { ...detail(), showcases: [{ template: "carousel", user_prompt: "a", assistant_reply: "b" }] };
			const errors = validateUploadInput(pluginInput({ detail: d as never }), { packageExists: existsAlways });
			expect(errors.some((e) => e.includes("template 非法"))).toBe(true);
		});

		it("canvas 仅 chat-over-canvas 可用", () => {
			const d = {
				...detail(),
				showcases: [{ template: "chat-thread", user_prompt: "a", assistant_reply: "b", canvas: "code" }],
			};
			const errors = validateUploadInput(pluginInput({ detail: d as never }), { packageExists: existsAlways });
			expect(errors.some((e) => e.includes("canvas 仅"))).toBe(true);
		});

		it("meta 预置键必须在白名单内", () => {
			const d = { ...detail(), meta: [{ key: "twitter", value: "x" }] };
			const errors = validateUploadInput(pluginInput({ detail: d as never }), { packageExists: existsAlways });
			expect(errors.some((e) => e.includes("key 非法"))).toBe(true);
		});

		it("meta 自定义条目必须有 label", () => {
			const d = { ...detail(), meta: [{ value: "x" }] };
			const errors = validateUploadInput(pluginInput({ detail: d as never }), { packageExists: existsAlways });
			expect(errors.some((e) => e.includes("label"))).toBe(true);
		});

		it("i18n 覆盖块同样校验形状", () => {
			const d = {
				...detail(),
				i18n: { en: { showcases: [{ template: "bogus", user_prompt: "a", assistant_reply: "b" }] } },
			};
			const errors = validateUploadInput(pluginInput({ detail: d as never }), { packageExists: existsAlways });
			expect(errors.some((e) => e.includes("detail.i18n.en.showcases[0].template"))).toBe(true);
		});

		it("合法的 i18n 通过", () => {
			const d = {
				...detail(),
				i18n: { en: { name: "Demo", description: "intro", content: "# Body" } },
			};
			expect(validateUploadInput(pluginInput({ detail: d }), { packageExists: existsAlways })).toEqual([]);
		});
	});
});
