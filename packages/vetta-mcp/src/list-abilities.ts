/**
 * list_my_abilities：作者查看自己提交过的条目与审核进度。
 *
 * 它是 upload_ability 的另一半——提交后 agent 需要一条路径回答
 * 「过了没有 / 为什么被驳回」，否则被驳回的提交就成了黑洞。
 */

import { apiUrl, type VettaCredentials } from "./credentials.js";

export interface MyAbilitySummary {
	slug: string;
	type: string;
	name: string;
	version: string;
	review_status: string;
	/** 驳回理由；通过时为空 */
	review_note?: string;
	is_enabled: boolean;
	/** 压着待审新版本时给出其版本号 */
	pending_version?: string;
}

export interface ListMyAbilitiesResult {
	ok: boolean;
	message: string;
	abilities?: MyAbilitySummary[];
}

interface MineResponse {
	code?: number;
	message?: string;
	data?: Array<{
		slug?: string;
		type?: string;
		name?: string;
		version?: string;
		review_status?: string;
		review_note?: string;
		is_enabled?: boolean;
		pending?: { version?: string } | null;
	}>;
}

export async function listMyAbilities(
	credentials: VettaCredentials,
	deps: { fetch?: typeof globalThis.fetch } = {},
): Promise<ListMyAbilitiesResult> {
	const fetchImpl = deps.fetch ?? globalThis.fetch;

	let response: Response;
	try {
		response = await fetchImpl(apiUrl(credentials.baseUrl, "/abilities/mine"), {
			headers: { Authorization: `Bearer ${credentials.token}` },
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { ok: false, message: `无法连接 Vetta 服务（${credentials.baseUrl}）：${reason}` };
	}

	const text = await response.text();
	let payload: MineResponse = {};
	try {
		payload = text ? (JSON.parse(text) as MineResponse) : {};
	} catch {
		return { ok: false, message: `服务端返回了非预期内容（HTTP ${response.status}）：${text.slice(0, 300)}` };
	}

	if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
		return { ok: false, message: `查询失败：${payload.message?.trim() || `HTTP ${response.status}`}` };
	}

	const abilities: MyAbilitySummary[] = (payload.data ?? []).map((item) => ({
		slug: item.slug ?? "",
		type: item.type ?? "",
		name: item.name ?? "",
		version: item.version ?? "",
		review_status: item.review_status ?? "",
		review_note: item.review_note || undefined,
		is_enabled: item.is_enabled ?? false,
		pending_version: item.pending?.version || undefined,
	}));

	return {
		ok: true,
		message: abilities.length === 0 ? "你还没有提交过任何能力。" : `共 ${abilities.length} 个已提交的能力。`,
		abilities,
	};
}
