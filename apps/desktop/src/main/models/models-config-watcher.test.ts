import { describe, expect, it, vi } from "vitest";
import type { ModelsConfig } from "./model-settings-service.js";
import { changedProviderIds, ModelsConfigWatcher } from "./models-config-watcher.js";

describe("changedProviderIds", () => {
	it("列出新增、删除和内容变了的服务商，键序不同不算改动", () => {
		const before: ModelsConfig = {
			providers: {
				openai: { baseUrl: "https://api.openai.com/v1", api: "openai-responses" },
				kimi: { baseUrl: "https://api.moonshot.ai/v1" },
			},
		};
		const after: ModelsConfig = {
			providers: {
				openai: { api: "openai-responses", baseUrl: "https://api.openai.com/v1" },
				magpie: { baseUrl: "http://127.0.0.1:3425/v1", displayName: "Magpie" },
			},
		};
		expect(changedProviderIds(before, after).sort()).toEqual(["kimi", "magpie"]);
	});
});

describe("ModelsConfigWatcher", () => {
	function setup(initial: ModelsConfig) {
		let file: ModelsConfig | null = initial;
		const onExternalChange = vi.fn();
		const watcher = new ModelsConfigWatcher("/tmp/models.json", () => file, onExternalChange);
		return {
			watcher,
			onExternalChange,
			write: (next: ModelsConfig | null) => {
				file = next;
			},
		};
	}

	it("Magpie 从外部写入服务商时通知刷新这一家", () => {
		const { watcher, onExternalChange, write } = setup({ providers: {} });
		write({ providers: { magpie: { displayName: "Magpie", baseUrl: "http://127.0.0.1:3425/v1" } } });
		watcher.check();
		expect(onExternalChange).toHaveBeenCalledWith(["magpie"]);
	});

	it("Vetta 自己写的不当成外部改动", () => {
		const { watcher, onExternalChange, write } = setup({ providers: {} });
		const own: ModelsConfig = { providers: { kimi: { baseUrl: "https://api.moonshot.ai/v1" } } };
		write(own);
		watcher.noteWritten(own);
		watcher.check();
		expect(onExternalChange).not.toHaveBeenCalled();
	});

	it("读到写了一半的文件时先跳过，等写完再比较", () => {
		const { watcher, onExternalChange, write } = setup({ providers: { kimi: {} } });
		write(null);
		watcher.check();
		expect(onExternalChange).not.toHaveBeenCalled();
		write({ providers: { kimi: {}, magpie: { displayName: "Magpie" } } });
		watcher.check();
		expect(onExternalChange).toHaveBeenCalledWith(["magpie"]);
	});
});
