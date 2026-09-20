// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useExternalSessionImportSettingsModel } from "./useExternalSessionImportSettingsModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./recordSettingsUsage", () => ({ recordSettingsUsage: vi.fn() }));

interface SessionImportStore {
	sessionImport?: { grokEnabled?: boolean; grokSessionDir?: string; claudeCodeEnabled?: boolean };
	grokSessionsDirectory?: string;
	externalSessionDirectories?: Partial<Record<string, string>>;
}

function installConfigStub(initial: SessionImportStore = {}): {
	current: SessionImportStore;
	setPayloads: SessionImportStore[];
	selectFolder: ReturnType<typeof vi.fn>;
} {
	const store: { current: SessionImportStore; setPayloads: SessionImportStore[] } = {
		current: structuredClone(initial),
		setPayloads: [],
	};
	const selectFolder = vi.fn(async () => null as string | null);
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			config: {
				get: async () => structuredClone(store.current),
				set: async (payload: SessionImportStore) => {
					store.setPayloads.push(payload);
					store.current.sessionImport = {
						...store.current.sessionImport,
						...payload.sessionImport,
					};
					if (payload.grokSessionsDirectory !== undefined) {
						store.current.grokSessionsDirectory = payload.grokSessionsDirectory;
					}
				},
			},
			dialog: { selectFolder },
		},
	});
	return { ...store, selectFolder };
}

describe("useExternalSessionImportSettingsModel", () => {
	it("Grok 开关默认关闭，打开后立即写入配置", async () => {
		const store = installConfigStub();
		const { result } = renderHook(() => useExternalSessionImportSettingsModel());
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.grokEnabled).toBe(false);

		await act(async () => {
			result.current.actions.toggleGrokEnabled(true);
		});

		expect(result.current.grokEnabled).toBe(true);
		expect(store.setPayloads.at(-1)).toEqual({ sessionImport: { grokEnabled: true } });
		expect(store.current.sessionImport?.grokEnabled).toBe(true);
	});

	it("打开 Claude Code 开关后写入 claudeCodeEnabled", async () => {
		const store = installConfigStub();
		const { result } = renderHook(() => useExternalSessionImportSettingsModel());
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			result.current.actions.toggleEnabled("claude-code", true);
		});

		expect(store.setPayloads.at(-1)).toEqual({ sessionImport: { claudeCodeEnabled: true } });
		expect(result.current.tools.find((tool) => tool.id === "claude-code")?.enabled).toBe(true);
	});

	it("同一轮连开两个开关时两个都保持打开", async () => {
		installConfigStub();
		const { result } = renderHook(() => useExternalSessionImportSettingsModel());
		await waitFor(() => expect(result.current.loading).toBe(false));

		await act(async () => {
			result.current.actions.toggleEnabled("grok", true);
			result.current.actions.toggleEnabled("claude-code", true);
		});

		expect(result.current.tools.find((tool) => tool.id === "grok")?.enabled).toBe(true);
		expect(result.current.tools.find((tool) => tool.id === "claude-code")?.enabled).toBe(true);
	});


	it("探测到目录时只读展示该路径，不提供手工指定入口", async () => {
		installConfigStub({ grokSessionsDirectory: "/Users/ada/.grok/sessions" });
		const { result } = renderHook(() => useExternalSessionImportSettingsModel());
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.grokDisplayPath).toBe("/Users/ada/.grok/sessions");
		expect(result.current.canSpecifyGrokPath).toBe(false);
	});

	it("探测完成前不提供手工指定入口", async () => {
		let resolveConfig: (value: SessionImportStore) => void = () => undefined;
		const pending = new Promise<SessionImportStore>((resolve) => {
			resolveConfig = resolve;
		});
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				config: { get: async () => pending, set: async () => undefined },
				dialog: { selectFolder: vi.fn(async () => null) },
			},
		});

		const { result } = renderHook(() => useExternalSessionImportSettingsModel());
		expect(result.current.loading).toBe(true);
		expect(result.current.canSpecifyGrokPath).toBe(false);

		await act(async () => {
			resolveConfig({});
			await pending;
		});
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.canSpecifyGrokPath).toBe(true);
	});

	it("探测失败时可以指定路径并持久化", async () => {
		const store = installConfigStub();
		store.selectFolder.mockResolvedValue("/opt/custom-grok/sessions");
		const { result } = renderHook(() => useExternalSessionImportSettingsModel());
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.canSpecifyGrokPath).toBe(true);
		expect(result.current.grokDisplayPath).toBeUndefined();

		await act(async () => {
			await result.current.actions.specifyGrokSessionDir();
		});

		expect(result.current.grokDisplayPath).toBe("/opt/custom-grok/sessions");
		expect(store.setPayloads.at(-1)).toEqual({ sessionImport: { grokSessionDir: "/opt/custom-grok/sessions" } });
		expect(store.current.sessionImport?.grokSessionDir).toBe("/opt/custom-grok/sessions");
	});

	it("重启后仍能读回已打开的开关", async () => {
		installConfigStub({ sessionImport: { grokEnabled: true } });
		const { result } = renderHook(() => useExternalSessionImportSettingsModel());
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.grokEnabled).toBe(true);
	});
});
