import { describe, expect, it, vi } from "vitest";
import type { VettaCredentials } from "../src/credentials.js";
import type { UploadAbilityInput } from "../src/types.js";
import { uploadAbility } from "../src/upload-ability.js";

const credentials: VettaCredentials = { baseUrl: "https://api.example.com", token: "tok" };

function pluginInput(overrides: Partial<UploadAbilityInput> = {}): UploadAbilityInput {
	return {
		type: "plugin",
		package_path: "/tmp/demo.zip",
		detail: { name: "演示", description: "简介", author: "作者", content: "# 正文" },
		...overrides,
	};
}

/** 造一个返回给定 payload 的 fetch 替身，并记录收到的请求 */
function stubFetch(payload: unknown, init: { status?: number; text?: string } = {}) {
	const calls: { url: string; init: RequestInit }[] = [];
	const impl = vi.fn(async (url: string | URL | Request, requestInit?: RequestInit) => {
		calls.push({ url: String(url), init: requestInit ?? {} });
		const body = init.text ?? JSON.stringify(payload);
		return new Response(body, {
			status: init.status ?? 200,
			headers: { "content-type": "application/json" },
		});
	});
	return { impl: impl as unknown as typeof globalThis.fetch, calls };
}

const deps = (fetchImpl: typeof globalThis.fetch) => ({
	fetch: fetchImpl,
	readFile: () => Buffer.from("zip-bytes"),
	fileExists: () => true,
});

describe("uploadAbility", () => {
	it("校验失败时不发请求，并一次性列全问题", async () => {
		const { impl, calls } = stubFetch({});
		const result = await uploadAbility({ type: "plugin", detail: {} } as UploadAbilityInput, credentials, deps(impl));

		expect(result.ok).toBe(false);
		expect(calls).toHaveLength(0);
		expect(result.message).toContain("detail.name 必填");
		expect(result.message).toContain("package_path");
	});

	it("提交成功后回报待审状态", async () => {
		const { impl, calls } = stubFetch({
			code: 0,
			data: { slug: "demo", type: "plugin", version: "1.0.0", review_status: "pending" },
		});
		const result = await uploadAbility(pluginInput(), credentials, deps(impl));

		expect(result.ok).toBe(true);
		expect(result.slug).toBe("demo");
		expect(result.review_status).toBe("pending");
		expect(result.message).toContain("等待管理员审核");
		expect(calls[0].url).toBe("https://api.example.com/api/v1/abilities/submit");
		expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
	});

	it("baseUrl 已带 /api/v1 时不重复拼前缀", async () => {
		// desktop 主进程写下的凭据就是这种形状（VETTA_SERVER_URL 自带前缀）。
		// 重复拼接会打到 /api/v1/api/v1/... 直接 404。
		const { impl, calls } = stubFetch({ code: 0, data: {} });
		await uploadAbility(pluginInput(), { baseUrl: "http://localhost:8080/api/v1", token: "tok" }, deps(impl));

		expect(calls[0].url).toBe("http://localhost:8080/api/v1/abilities/submit");
	});

	it("管理员提交直接上架时文案不同", async () => {
		const { impl } = stubFetch({ code: 0, data: { slug: "demo", review_status: "approved" } });
		const result = await uploadAbility(pluginInput(), credentials, deps(impl));
		expect(result.message).toContain("已上架");
	});

	it("已上架条目的重传要说明线上版不受影响", async () => {
		const { impl } = stubFetch({
			code: 0,
			data: { slug: "demo", review_status: "approved", pending: { version: "1.0.1" } },
		});
		const result = await uploadAbility(pluginInput(), credentials, deps(impl));

		expect(result.has_pending).toBe(true);
		expect(result.message).toContain("仍展示当前线上版本");
	});

	it("表单按服务端约定组装", async () => {
		const { impl, calls } = stubFetch({ code: 0, data: {} });
		await uploadAbility(
			pluginInput({ detail: { ...pluginInput().detail, tags: ["设计", "AI"] } }),
			credentials,
			deps(impl),
		);

		const form = calls[0].init.body as FormData;
		expect(form.get("type")).toBe("plugin");
		expect(JSON.parse(form.get("detail") as string).name).toBe("演示");
		expect(JSON.parse(form.get("tags") as string)).toEqual(["设计", "AI"]);
		expect(form.get("file")).toBeInstanceOf(Blob);
	});

	it("mcp 走 config 字段且不带文件", async () => {
		const { impl, calls } = stubFetch({ code: 0, data: {} });
		await uploadAbility(
			{
				type: "mcp",
				slug: "context7",
				detail: pluginInput().detail,
				mcp_config: { transport: "http", url: "https://x" },
			},
			credentials,
			deps(impl),
		);

		const form = calls[0].init.body as FormData;
		expect(JSON.parse(form.get("config") as string)).toEqual({ transport: "http", url: "https://x" });
		expect(form.get("file")).toBeNull();
		expect(form.get("slug")).toBe("context7");
	});

	it("bundle 的成员包进 config.members", async () => {
		const { impl, calls } = stubFetch({ code: 0, data: {} });
		await uploadAbility(
			{
				type: "bundle",
				slug: "starter",
				detail: pluginInput().detail,
				members: [{ type: "skill", slug: "a" }],
			},
			credentials,
			deps(impl),
		);

		const form = calls[0].init.body as FormData;
		expect(JSON.parse(form.get("config") as string)).toEqual({ members: [{ type: "skill", slug: "a" }] });
	});

	it("服务端业务错误原样回报", async () => {
		const { impl } = stubFetch({ code: 400, message: "该能力属于其他作者，无法提交更新" }, { status: 400 });
		const result = await uploadAbility(pluginInput(), credentials, deps(impl));

		expect(result.ok).toBe(false);
		expect(result.message).toContain("该能力属于其他作者");
	});

	it("非 JSON 响应截断回显而不是吞掉", async () => {
		const { impl } = stubFetch({}, { status: 502, text: "<html>Bad Gateway</html>" });
		const result = await uploadAbility(pluginInput(), credentials, deps(impl));

		expect(result.ok).toBe(false);
		expect(result.message).toContain("Bad Gateway");
	});

	it("网络不可达时给出可操作提示", async () => {
		const impl = (async () => {
			throw new Error("ECONNREFUSED");
		}) as unknown as typeof globalThis.fetch;
		const result = await uploadAbility(pluginInput(), credentials, deps(impl));

		expect(result.ok).toBe(false);
		expect(result.message).toContain("无法连接 Vetta 服务");
		expect(result.message).toContain("https://api.example.com");
	});
});
