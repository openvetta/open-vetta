/**
 * 把[[预设服务商]]的默认请求头补进已保存的 headers。
 *
 * 用户已设置的同名头（不区分大小写）一律保留，只补缺的；没有可补的就原样返回同一个对象，
 * 调用方据此判断要不要落盘。启用预设、启动时补老配置、拉模型列表共用这一条规则。
 */
export function withPresetDefaultHeaders(
	headers: Record<string, string> | undefined,
	defaults: Readonly<Record<string, string>> | undefined,
): Record<string, string> | undefined {
	if (!defaults) return headers;
	const present = new Set(Object.keys(headers ?? {}).map((key) => key.toLowerCase()));
	const missing = Object.entries(defaults).filter(([key]) => !present.has(key.toLowerCase()));
	if (missing.length === 0) return headers;
	return { ...Object.fromEntries(missing), ...headers };
}
