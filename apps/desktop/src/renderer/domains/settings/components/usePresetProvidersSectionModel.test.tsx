// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GROK_PRESET_PROVIDER_ID } from "../../../../shared/grok-oauth.js";
import { usePresetProvidersSectionModel } from "./usePresetProvidersSectionModel";

const t = vi.hoisted(() => (key: string) => key);

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t, i18n: { language: "zh" } }),
}));

vi.mock("@shared/store/toast-atoms", () => ({ showToast: vi.fn() }));

interface ModelsApiMock {
	listPresets: ReturnType<typeof vi.fn>;
	onPresetsUpdated: ReturnType<typeof vi.fn>;
	oauthStatus: ReturnType<typeof vi.fn>;
	loginOAuth: ReturnType<typeof vi.fn>;
	logoutOAuth: ReturnType<typeof vi.fn>;
	cancelOAuth: ReturnType<typeof vi.fn>;
	onOAuthDevice: ReturnType<typeof vi.fn>;
	copyApiKey: ReturnType<typeof vi.fn>;
	refreshPresetCatalog: ReturnType<typeof vi.fn>;
	refreshPresetModels: ReturnType<typeof vi.fn>;
}

function grokPreset() {
	return {
		id: GROK_PRESET_PROVIDER_ID,
		displayName: "Grok",
		api: "openai-completions",
		baseUrl: "https://api.x.ai/v1",
		icon: "grok",
		catalogModels: [],
	};
}

function mockModels(overrides: Partial<ModelsApiMock> = {}): ModelsApiMock {
	const models: ModelsApiMock = {
		listPresets: vi.fn(async () => ({ providers: [grokPreset()], catalogSource: "live" })),
		onPresetsUpdated: vi.fn(() => () => undefined),
		oauthStatus: vi.fn(async () => ({ grok: false })),
		loginOAuth: vi.fn(async () => ({ ok: true })),
		logoutOAuth: vi.fn(async () => undefined),
		cancelOAuth: vi.fn(async () => undefined),
		onOAuthDevice: vi.fn(() => () => undefined),
		copyApiKey: vi.fn(async () => false),
		refreshPresetCatalog: vi.fn(async () => ({ ok: true, elapsedMs: 1, modelCount: 0 })),
		refreshPresetModels: vi.fn(async () => ({ models: [] })),
		...overrides,
	};
	window.vetta = { models, auth: { openExternal: vi.fn(async () => undefined) } } as unknown as typeof window.vetta;
	return models;
}

function grokConfig() {
	return {
		providers: {
			grok: {
				source: "template" as const,
				templateId: "grok",
				api: "openai-completions",
				baseUrl: "https://api.x.ai/v1",
				models: [],
			},
		},
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("usePresetProvidersSectionModel SuperGrok login", () => {
	it("shows the device code then marks Grok signed in after SuperGrok authorizes", async () => {
		let resolveLogin: ((result: { ok: boolean }) => void) | undefined;
		let reportDevice: ((info: { url: string; userCode: string }) => void) | undefined;
		mockModels({
			loginOAuth: vi.fn(
				() =>
					new Promise<{ ok: boolean }>((resolve) => {
						resolveLogin = resolve;
					}),
			),
			onOAuthDevice: vi.fn((handler: (info: { url: string; userCode: string }) => void) => {
				reportDevice = handler;
				return () => undefined;
			}),
		});
		const { result } = renderHook(() =>
			usePresetProvidersSectionModel({ config: { providers: {} }, saveConfig: vi.fn(async () => undefined) }),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.grokLoggedIn).toBe(false);

		act(() => {
			void result.current.onGrokLogin();
		});
		await waitFor(() => expect(result.current.grokDialog.open).toBe(true));
		act(() => {
			reportDevice?.({ url: "https://accounts.x.ai/oauth2/device", userCode: "WXYZ-9876" });
		});
		expect(result.current.grokDialog.userCode).toBe("WXYZ-9876");

		await act(async () => {
			resolveLogin?.({ ok: true });
		});
		await waitFor(() => expect(result.current.grokLoggedIn).toBe(true));
		expect(result.current.grokDialog.open).toBe(false);
	});

	it("cancels an in-flight SuperGrok login from the dialog", async () => {
		const models = mockModels({
			loginOAuth: vi.fn(() => new Promise(() => undefined)),
		});
		const { result } = renderHook(() =>
			usePresetProvidersSectionModel({ config: { providers: {} }, saveConfig: vi.fn(async () => undefined) }),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		act(() => {
			void result.current.onGrokLogin();
		});
		await waitFor(() => expect(result.current.grokDialog.open).toBe(true));
		act(() => {
			result.current.onGrokDialogCancel();
		});
		expect(result.current.grokDialog.open).toBe(false);
		expect(models.cancelOAuth).toHaveBeenCalled();
	});

	it("signs out SuperGrok from the preset row", async () => {
		const models = mockModels({
			oauthStatus: vi.fn(async () => ({ grok: true })),
		});
		const { result } = renderHook(() =>
			usePresetProvidersSectionModel({ config: grokConfig(), saveConfig: vi.fn(async () => undefined) }),
		);
		await waitFor(() => expect(result.current.grokLoggedIn).toBe(true));
		await act(async () => {
			await result.current.onGrokLogout();
		});
		expect(result.current.grokLoggedIn).toBe(false);
		expect(models.logoutOAuth).toHaveBeenCalledWith(GROK_PRESET_PROVIDER_ID);
	});

	it("logs out SuperGrok when the Grok preset is removed", async () => {
		const models = mockModels({
			oauthStatus: vi.fn(async () => ({ grok: true })),
		});
		const saveConfig = vi.fn(async () => undefined);
		const { result } = renderHook(() => usePresetProvidersSectionModel({ config: grokConfig(), saveConfig }));
		await waitFor(() => expect(result.current.grokLoggedIn).toBe(true));
		const grokRow = result.current.rows.find((row) => row.id === GROK_PRESET_PROVIDER_ID);
		expect(grokRow).toBeDefined();
		if (!grokRow) throw new Error("expected Grok preset row");
		await act(async () => {
			await result.current.onRemove(grokRow);
		});
		expect(models.logoutOAuth).toHaveBeenCalledWith(GROK_PRESET_PROVIDER_ID);
		expect(saveConfig).toHaveBeenCalled();
	});
});
