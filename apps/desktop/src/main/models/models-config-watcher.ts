import { type FSWatcher, watch } from "node:fs";
import { basename, dirname } from "node:path";
import type { ModelsConfig } from "./model-settings-service.js";

/** 外部程序写文件往往是「写临时文件再改名」，一次保存会连发好几个事件，合并成一次处理。 */
const DEBOUNCE_MS = 300;

/**
 * 两份配置里哪些服务商不一样（含新增和删除）。按内容比较、不看键的顺序：
 * 外部程序原地改写时键序可能和 Vetta 写出的不同，这不算改动。
 */
export function changedProviderIds(before: ModelsConfig | null, after: ModelsConfig): string[] {
	const previous = before?.providers ?? {};
	const ids = new Set([...Object.keys(previous), ...Object.keys(after.providers)]);
	return [...ids].filter((id) => stableStringify(previous[id]) !== stableStringify(after.providers[id]));
}

function stableStringify(value: unknown): string {
	return (
		JSON.stringify(value, (_key, item: unknown) =>
			item && typeof item === "object" && !Array.isArray(item)
				? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
				: item,
		) ?? "undefined"
	);
}

/**
 * 监听 models.json 被应用外的程序改动（如 Magpie 在 Agents 页接入或断开 Vetta）。
 *
 * Vetta 自己写盘后要调用 `noteWritten`，否则自己的保存也会被当成外部改动再通知一遍。
 * 监听的是所在目录而不是文件本身：改名式写入会换掉文件，盯着旧文件就再也收不到事件。
 */
export class ModelsConfigWatcher {
	private snapshot: ModelsConfig | null;
	private watcher: FSWatcher | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly path: string,
		/** 读不出合法 JSON 时返回 null（外部程序写到一半），这次就先不比较。 */
		private readonly read: () => ModelsConfig | null,
		private readonly onExternalChange: (providerIds: string[]) => void,
	) {
		this.snapshot = read();
	}

	noteWritten(config: ModelsConfig): void {
		this.snapshot = config;
	}

	start(): void {
		if (this.watcher) return;
		const file = basename(this.path);
		try {
			this.watcher = watch(dirname(this.path), (_event, name) => {
				if (name && name.toString() !== file) return;
				this.schedule();
			});
		} catch {
			// 目录还不存在时没有可监听的对象；Vetta 第一次写配置会建出它，下次启动再监听。
			this.watcher = null;
		}
	}

	stop(): void {
		this.watcher?.close();
		this.watcher = null;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}

	/** 读一次文件，和上次见到的比较；测试与防抖到期都走这里。 */
	check(): void {
		const next = this.read();
		if (!next) return;
		const ids = changedProviderIds(this.snapshot, next);
		this.snapshot = next;
		if (ids.length > 0) this.onExternalChange(ids);
	}

	private schedule(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = null;
			this.check();
		}, DEBOUNCE_MS);
	}
}
