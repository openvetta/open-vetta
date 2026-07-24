import type { PluginNetworkRequest, PluginNetworkResponse } from "@vetta-org/plugin-sdk";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

function parseUrl(value: string): URL {
	const url = new URL(value);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`Unsupported network protocol: ${url.protocol}`);
	}
	return url;
}

function buildBody(request: PluginNetworkRequest): {
	body?: BodyInit;
	headers: Headers;
} {
	const headers = new Headers(request.headers);
	if (!request.body) return { headers };
	if (request.body.type === "json") {
		if (!headers.has("content-type")) headers.set("content-type", "application/json");
		return { body: JSON.stringify(request.body.value), headers };
	}
	const form = new FormData();
	for (const [name, value] of Object.entries(request.body.fields ?? {})) {
		form.set(name, value);
	}
	for (const file of request.body.files ?? []) {
		const bytes = Buffer.from(file.data, "base64");
		form.append(file.fieldName, new Blob([new Uint8Array(bytes)], { type: file.mimeType }), file.fileName);
	}
	return { body: form, headers };
}

function responseHeaders(headers: Headers): Record<string, string> {
	return Object.fromEntries(headers.entries());
}

export async function requestForPlugin<T = unknown>(request: PluginNetworkRequest): Promise<PluginNetworkResponse<T>> {
	const url = parseUrl(request.url);
	const timeoutMs = Math.min(Math.max(request.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1), MAX_TIMEOUT_MS);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const { body, headers } = buildBody(request);
		const response = await fetch(url, {
			method: request.method ?? (body ? "POST" : "GET"),
			headers,
			body,
			signal: controller.signal,
		});
		const bytes = Buffer.from(await response.arrayBuffer());
		if (bytes.byteLength > MAX_RESPONSE_BYTES) {
			throw new Error(`Plugin network response exceeds ${MAX_RESPONSE_BYTES} bytes`);
		}
		const responseType = request.responseType ?? "json";
		let responseBody: unknown;
		if (responseType === "base64") {
			responseBody = bytes.toString("base64");
		} else if (responseType === "text") {
			responseBody = bytes.toString("utf8");
		} else {
			const text = bytes.toString("utf8");
			responseBody = text.length > 0 ? JSON.parse(text) : null;
		}
		return {
			status: response.status,
			headers: responseHeaders(response.headers),
			body: responseBody as T,
		};
	} finally {
		clearTimeout(timeout);
	}
}
