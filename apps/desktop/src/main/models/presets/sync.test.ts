import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	atomicWriteJSON: vi.fn(),
	fetch: vi.fn(),
	readFile: vi.fn(),
	send: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@vetta/action-rpc", () => ({ getVettaHomePath: () => "C:/test-vetta" }));
vi.mock("@vetta/toolkit/atomic-write", () => ({ atomicWriteJSON: mocks.atomicWriteJSON }));
vi.mock("electron", () => ({
	BrowserWindow: {
		getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: mocks.send } }],
	},
	net: { fetch: mocks.fetch },
}));
vi.mock("../../logger.js", () => ({
	getAppLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("../model-settings-host.js", () => ({
	getDesktopModelSettingsService: () => ({
		getConfig: async () => ({ providers: {} }),
		replaceConfig: vi.fn(),
	}),
}));
vi.mock("./models-dev-snapshot.generated.js", () => ({
	MODELS_DEV_SNAPSHOT: {
		version: 8,
		fetchedAt: "2020-01-01T00:00:00.000Z",
		providers: {},
		lookup: {},
	},
}));

async function flushBackgroundRefresh(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
	await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("preset catalog background refresh", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.readFile.mockRejectedValue(Object.assign(new Error("missing cache"), { code: "ENOENT" }));
	});

	it("在线刷新失败并继续使用随包快照时不广播伪更新", async () => {
		mocks.fetch.mockRejectedValue(new Error("network unavailable"));
		const { listPresetProviders } = await import("./sync.js");

		const initial = await listPresetProviders();
		await flushBackgroundRefresh();
		const duringCooldown = await listPresetProviders();
		await flushBackgroundRefresh();

		expect(initial.catalogSource).toBe("snapshot");
		expect(duringCooldown).toMatchObject({ catalogSource: "snapshot", catalogError: { code: "network" } });
		expect(mocks.fetch).toHaveBeenCalledTimes(1);
		expect(mocks.send).not.toHaveBeenCalled();
	});

	it("在线目录成功替换随包快照时只广播一次更新", async () => {
		mocks.fetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				anthropic: {
					models: {
						"claude-test": { name: "Claude Test", modalities: { output: ["text"] } },
					},
				},
			}),
		});
		const { listPresetProviders } = await import("./sync.js");

		const initial = await listPresetProviders();
		await flushBackgroundRefresh();
		const refreshed = await listPresetProviders();
		await flushBackgroundRefresh();

		expect(initial.catalogSource).toBe("snapshot");
		expect(refreshed.catalogSource).toBe("live");
		expect(mocks.fetch).toHaveBeenCalledTimes(1);
		expect(mocks.send).toHaveBeenCalledOnce();
		expect(mocks.send).toHaveBeenCalledWith("vetta:models:presets-updated");
	});
});

describe("backfillPresetDefaultHeaders", () => {
	it("给启用前没有识别头的 Magpie 老配置补上 User-Agent,停用的也补", async () => {
		const { backfillPresetDefaultHeaders } = await import("./sync.js");
		const config = {
			providers: {
				magpie: { source: "template" as const, templateId: "magpie", apiKey: "magpie", disabled: true },
				openai: { source: "template" as const, templateId: "openai", apiKey: "sk-test" },
				custom: { baseUrl: "http://127.0.0.1:3425/v1", apiKey: "magpie" },
			},
		};
		const next = backfillPresetDefaultHeaders(config);
		expect(next?.providers.magpie).toMatchObject({ disabled: true, headers: { "User-Agent": "Vetta" } });
		// 其它预设和用户自建的服务商不动。
		expect(next?.providers.openai).toBe(config.providers.openai);
		expect(next?.providers.custom).toBe(config.providers.custom);
	});

	it("用户自己设过 User-Agent 或已经补过时不再改写", async () => {
		const { backfillPresetDefaultHeaders } = await import("./sync.js");
		expect(
			backfillPresetDefaultHeaders({
				providers: { magpie: { source: "template", templateId: "magpie", headers: { "user-agent": "Custom" } } },
			}),
		).toBeNull();
		expect(
			backfillPresetDefaultHeaders({
				providers: { magpie: { source: "template", templateId: "magpie", headers: { "User-Agent": "Vetta" } } },
			}),
		).toBeNull();
	});
});
