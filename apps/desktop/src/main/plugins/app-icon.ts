import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";

/**
 * 取 macOS 应用的图标（PNG data URL），给插件在菜单 / 列表里展示「这个应用」用。
 *
 * 只认标准应用目录里的 `.app`，应用名不能带路径分隔符，所以插件没法借它读任意文件的图标。
 * 应用不存在返回 `null`（插件据此灰掉对应项）。
 */

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._+-]{0,63}$/u;

function appDirectories(): string[] {
	return [
		"/Applications",
		"/System/Applications",
		"/System/Applications/Utilities",
		"/System/Library/CoreServices",
		join(homedir(), "Applications"),
	];
}

/** 在标准应用目录里找 `<name>.app`；名字不合法或找不到返回 `null`。 */
export function resolveAppBundlePath(
	appName: string,
	exists: (path: string) => boolean = existsSync,
	directories: readonly string[] = appDirectories(),
): string | null {
	if (!NAME_PATTERN.test(appName)) return null;
	for (const directory of directories) {
		const candidate = join(directory, `${appName}.app`);
		if (exists(candidate)) return candidate;
	}
	return null;
}

const cache = new Map<string, string>();

export async function getAppIconDataUrl(appName: string): Promise<string | null> {
	const cached = cache.get(appName);
	if (cached) return cached;
	const bundlePath = resolveAppBundlePath(appName);
	if (!bundlePath) return null;
	try {
		const image = await app.getFileIcon(bundlePath, { size: "large" });
		if (image.isEmpty()) return null;
		const dataUrl = image.toDataURL();
		cache.set(appName, dataUrl);
		return dataUrl;
	} catch {
		return null;
	}
}
