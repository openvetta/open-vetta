import { createHmac } from "node:crypto";
import type { WebhookEndpointPublic, WebhookEndpointSecret, WebhookMessage, WebhookSendResult } from "../types.js";
import type { WebhookProvider } from "./registry.js";

const DINGTALK_HOST = "oapi.dingtalk.com";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * DingTalk HMAC-SHA256 sign per
 * https://open.dingtalk.com/document/robots/customize-robot-security-settings
 *
 * Note: key = secret, data = `timestamp + "\n" + secret`. Result is base64,
 * then URL-encoded and appended to the URL — NOT into the request body. This
 * is the inverse pairing of Feishu's signing layout.
 */
function dingtalkSign(timestampMs: number, secret: string): string {
	const stringToSign = `${timestampMs}\n${secret}`;
	const hmac = createHmac("sha256", secret).update(stringToSign).digest("base64");
	return encodeURIComponent(hmac);
}

function levelTag(level: WebhookMessage["level"]): string {
	switch (level) {
		case "success":
			return "✅ ";
		case "warn":
			return "⚠️ ";
		case "error":
			return "❌ ";
		default:
			return "";
	}
}

function validateDingtalkUrl(url: string): string | null {
	const trimmed = url.trim();
	if (!trimmed) return "Webhook URL 不能为空";
	if (!/^https:\/\//i.test(trimmed)) return "Webhook URL 必须以 https:// 开头";
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return "Webhook URL 格式不正确";
	}
	if (parsed.hostname !== DINGTALK_HOST) {
		return `钉钉 Webhook URL 域名必须是 ${DINGTALK_HOST}`;
	}
	if (!parsed.pathname.startsWith("/robot/send")) {
		return "钉钉 Webhook URL 路径必须以 /robot/send 开头";
	}
	if (!parsed.searchParams.get("access_token")) {
		return "URL 缺少 access_token 参数";
	}
	return null;
}

/**
 * Build the markdown payload. Falls back to text when no title is given (the
 * markdown msgtype requires a title field per DingTalk's schema).
 *
 * If the user configured a keyword we prepend it to the rendered title so it
 * satisfies DingTalk's keyword security check; that check inspects the
 * outgoing text, not the structure, so prefixing is sufficient.
 */
function buildPayload(pub: WebhookEndpointPublic, message: WebhookMessage): Record<string, unknown> {
	const opts = pub.dingtalk ?? {};
	const keyword = opts.keyword?.trim();
	const tag = levelTag(message.level);
	const rawTitle = (message.title ?? "").trim();
	const baseTitle = rawTitle || "消息推送";
	const displayTitle = keyword ? `[${keyword}] ${tag}${baseTitle}` : `${tag}${baseTitle}`;

	const at: Record<string, unknown> = {
		isAtAll: Boolean(opts.mentionAll),
	};
	if (opts.atMobiles && opts.atMobiles.length > 0) {
		at.atMobiles = opts.atMobiles;
	}

	// markdown body — DingTalk supports limited markdown subset (headings,
	// bold/italic, lists, links, images, blockquote, inline code).
	const lines: string[] = [];
	if (rawTitle) {
		lines.push(`#### ${tag}${rawTitle}`);
	} else if (tag) {
		lines.push(`#### ${tag}消息推送`);
	}
	if (lines.length > 0) lines.push("");
	lines.push(message.text);

	// Mention list at the bottom is the conventional way to ping people in
	// markdown messages; DingTalk strips them from the text but still uses
	// them for the actual @ behavior when paired with `at.atMobiles`.
	if (opts.atMobiles && opts.atMobiles.length > 0) {
		lines.push("");
		lines.push(opts.atMobiles.map((m) => `@${m}`).join(" "));
	}

	return {
		msgtype: "markdown",
		markdown: {
			title: displayTitle,
			text: lines.join("\n"),
		},
		at,
	};
}

async function sendDingtalk(
	pub: WebhookEndpointPublic,
	sec: WebhookEndpointSecret,
	message: WebhookMessage,
): Promise<WebhookSendResult> {
	const urlError = validateDingtalkUrl(sec.webhookUrl);
	if (urlError) return { ok: false, error: urlError };

	let url = sec.webhookUrl;
	if (sec.signSecret) {
		const ts = Date.now();
		const sign = dingtalkSign(ts, sec.signSecret);
		const sep = url.includes("?") ? "&" : "?";
		url = `${url}${sep}timestamp=${ts}&sign=${sign}`;
	}

	const payload = buildPayload(pub, message);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			method: "POST",
			signal: controller.signal,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			return { ok: false, error: `HTTP ${response.status} ${response.statusText}` };
		}
		const body = (await response.json().catch(() => null)) as { errcode?: number; errmsg?: string } | null;
		if (!body) return { ok: false, error: "响应解析失败" };
		if (body.errcode === 0) return { ok: true };
		return { ok: false, error: body.errmsg ?? `钉钉返回 errcode=${body.errcode}` };
	} catch (err) {
		if ((err as Error).name === "AbortError") return { ok: false, error: "请求超时（30s）" };
		return { ok: false, error: (err as Error).message };
	} finally {
		clearTimeout(timer);
	}
}

export const dingtalkProvider: WebhookProvider = {
	kind: "dingtalk",
	displayName: "钉钉",
	iconClass: "icon-[mdi--message-processing]",
	validateUrl: validateDingtalkUrl,
	send: sendDingtalk,
};
