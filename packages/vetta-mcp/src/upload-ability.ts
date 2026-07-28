/**
 * upload_ability 的执行体：本地校验 → 组 multipart → POST /abilities/submit。
 *
 * 服务端一个入口吃五种 type（`internal/handler/ability.go` 的 Submit），
 * 这里只负责把 agent 给的结构化入参翻译成那个入口认的表单形状。
 */

import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { apiUrl, type VettaCredentials } from "./credentials.js";
import { ARTIFACT_TYPES, type UploadAbilityInput } from "./types.js";
import { validateUploadInput } from "./validate.js";

/** 上传结果，回给 agent 的结构化摘要。 */
export interface UploadAbilityResult {
	ok: boolean;
	/** 人类可读的结论，agent 会转述给用户 */
	message: string;
	slug?: string;
	type?: string;
	version?: string;
	/** pending = 待审核；approved = 已可见（管理员提交） */
	review_status?: string;
	/** 有待审新版本压着时为 true（已上架条目的重传） */
	has_pending?: boolean;
}

/** 依赖注入点，便于测试时替换网络与文件系统。 */
export interface UploadAbilityDeps {
	fetch?: typeof globalThis.fetch;
	readFile?: (path: string) => Buffer;
	fileExists?: (path: string) => boolean;
}

/** 服务端 Submit 接口返回的能力形状（只取用得上的字段）。 */
interface SubmitResponse {
	code?: number;
	message?: string;
	data?: {
		slug?: string;
		type?: string;
		version?: string;
		review_status?: string;
		pending?: unknown;
	};
}

export async function uploadAbility(
	input: UploadAbilityInput,
	credentials: VettaCredentials,
	deps: UploadAbilityDeps = {},
): Promise<UploadAbilityResult> {
	const fetchImpl = deps.fetch ?? globalThis.fetch;
	const readFile = deps.readFile ?? ((p: string) => readFileSync(p));
	const fileExists = deps.fileExists ?? existsSync;

	const errors = validateUploadInput(input, { packageExists: fileExists });
	if (errors.length > 0) {
		return {
			ok: false,
			// 一次列全所有问题，agent 一轮就能补齐重试
			message: `提交被拒绝，请修正以下 ${errors.length} 处后重试：\n${errors.map((e) => `- ${e}`).join("\n")}`,
		};
	}

	const form = new FormData();
	form.set("type", input.type);
	form.set("detail", JSON.stringify(input.detail));
	if (input.slug?.trim()) form.set("slug", input.slug.trim());
	if (input.version?.trim()) form.set("version", input.version.trim());
	if (input.category?.trim()) form.set("category", input.category.trim());
	if (input.detail.tags?.length) form.set("tags", JSON.stringify(input.detail.tags));

	if (input.type === "mcp") {
		form.set("config", JSON.stringify(input.mcp_config ?? {}));
	} else if (input.type === "bundle") {
		form.set("config", JSON.stringify({ members: input.members ?? [] }));
	}

	if (ARTIFACT_TYPES.includes(input.type)) {
		const path = input.package_path as string;
		const bytes = readFile(path);
		// Blob 需要 ArrayBuffer 视图；Buffer 本身是 Uint8Array 的子类，可直接放进数组
		form.set("file", new Blob([new Uint8Array(bytes)]), basename(path));
	}

	let response: Response;
	try {
		response = await fetchImpl(apiUrl(credentials.baseUrl, "/abilities/submit"), {
			method: "POST",
			headers: { Authorization: `Bearer ${credentials.token}` },
			body: form,
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { ok: false, message: `无法连接 Vetta 服务（${credentials.baseUrl}）：${reason}` };
	}

	let payload: SubmitResponse = {};
	const text = await response.text();
	try {
		payload = text ? (JSON.parse(text) as SubmitResponse) : {};
	} catch {
		// 网关错误页之类的非 JSON 响应，原样截断回显比吞掉更有助于定位
		return { ok: false, message: `服务端返回了非预期内容（HTTP ${response.status}）：${text.slice(0, 300)}` };
	}

	if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
		const detail = payload.message?.trim() || `HTTP ${response.status}`;
		return { ok: false, message: `提交失败：${detail}` };
	}

	const data = payload.data ?? {};
	const hasPending = Boolean(data.pending);
	return {
		ok: true,
		message: buildSuccessMessage(data.review_status, hasPending),
		slug: data.slug,
		type: data.type,
		version: data.version,
		review_status: data.review_status,
		has_pending: hasPending,
	};
}

/**
 * 成功文案要说清「现在能不能被别人看到」——这是提交者唯一真正关心的事。
 * 三种结局：待审、已上架、以及线上版仍在服役但新版本待审。
 */
function buildSuccessMessage(reviewStatus: string | undefined, hasPending: boolean): string {
	if (hasPending) {
		return "提交成功。这是已上架条目的新版本，正在等待管理员审核；审核通过前市场上仍展示当前线上版本，用户不受影响。";
	}
	if (reviewStatus === "approved") {
		return "提交成功，已上架，市场中立即可见。";
	}
	return "提交成功，正在等待管理员审核。审核通过后才会出现在能力市场中，可用 list_my_abilities 查看进度与驳回理由。";
}
