import type { CodingAgentAuthRuntime } from "@vetta/coding-agent/host-services";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GROK_PRESET_PROVIDER_ID } from "../../shared/grok-oauth.js";
import type { ModelsConfig } from "./model-settings-service.js";
import { DesktopProviderOAuthService, ensureGrokOAuthAlias, parseGrokDeviceAuth } from "./provider-oauth-service.js";

ensureGrokOAuthAlias();

afterEach(() => {
	vi.restoreAllMocks();
});

type StoredCredential = NonNullable<ReturnType<CodingAgentAuthRuntime["get"]>>;

function createAuth(): CodingAgentAuthRuntime {
	const store = new Map<string, StoredCredential>();
	const auth = {
		setRuntimeApiKey() {},
		removeRuntimeApiKey() {},
		setFallbackResolver() {},
		reload() {},
		get(provider: string) {
			return store.get(provider);
		},
		set(provider: string, credential: StoredCredential) {
			store.set(provider, credential);
		},
		remove(provider: string) {
			store.delete(provider);
		},
		list() {
			return [...store.keys()];
		},
		has(provider: string) {
			return store.has(provider);
		},
		hasAuth(provider: string) {
			return store.has(provider);
		},
		getAll() {
			return Object.fromEntries(store);
		},
		drainErrors() {
			return [];
		},
		async login(
			_providerId: string,
			callbacks: { onAuth: (info: { url: string; instructions: string }) => void; signal?: AbortSignal },
		) {
			callbacks.onAuth({
				url: "https://accounts.x.ai/oauth2/device",
				instructions: "Enter code: ABCD-1234",
			});
			await new Promise<void>((resolve, reject) => {
				if (callbacks.signal?.aborted) {
					reject(new Error("Login cancelled"));
					return;
				}
				const onAbort = () => reject(new Error("Login cancelled"));
				callbacks.signal?.addEventListener("abort", onAbort, { once: true });
				queueMicrotask(() => {
					if (callbacks.signal?.aborted) return;
					callbacks.signal?.removeEventListener("abort", onAbort);
					resolve();
				});
			});
			store.set(GROK_PRESET_PROVIDER_ID, {
				type: "oauth",
				access: "grok-access",
				refresh: "grok-refresh",
				expires: Date.now() + 60_000,
			});
		},
		logout(provider: string) {
			store.delete(provider);
		},
		async getApiKey(providerId: string) {
			const credential = store.get(providerId);
			return credential && credential.type === "oauth" ? credential.access : undefined;
		},
		getOAuthProviders() {
			return [];
		},
	};
	return auth as CodingAgentAuthRuntime;
}

function createService(config: ModelsConfig = { providers: {} }) {
	const auth = createAuth();
	const opened: string[] = [];
	let stored = config;
	const service = new DesktopProviderOAuthService({
		auth,
		openUrl: async (url) => {
			opened.push(url);
		},
		refreshModels: async () => ({
			models: [{ id: "grok-4", name: "Grok 4", reasoning: true, input: ["text"] }],
		}),
		readConfig: async () => stored,
		writeConfig: async (next) => {
			stored = next;
		},
		refreshRuntime: () => {},
	});
	return { service, auth, opened, getConfig: () => stored };
}

describe("parseGrokDeviceAuth", () => {
	it("extracts the user code from SuperGrok device instructions", () => {
		expect(
			parseGrokDeviceAuth({
				url: "https://accounts.x.ai/oauth2/device",
				instructions: "Enter code: ABCD-1234",
			}),
		).toEqual({
			url: "https://accounts.x.ai/oauth2/device",
			userCode: "ABCD-1234",
		});
	});
});

describe("DesktopProviderOAuthService", () => {
	it("logs in with SuperGrok, opens the verification URL, and enables the Grok preset", async () => {
		const { service, auth, opened, getConfig } = createService();
		const devices: Array<{ url: string; userCode: string }> = [];
		const result = await service.login(GROK_PRESET_PROVIDER_ID, {
			onDeviceCode: (info) => devices.push(info),
		});

		expect(result).toEqual({ ok: true });
		expect(devices).toEqual([{ url: "https://accounts.x.ai/oauth2/device", userCode: "ABCD-1234" }]);
		expect(opened).toEqual(["https://accounts.x.ai/oauth2/device"]);
		expect(auth.get(GROK_PRESET_PROVIDER_ID)?.type).toBe("oauth");
		expect(await auth.getApiKey(GROK_PRESET_PROVIDER_ID)).toBe("grok-access");
		expect(service.status()).toEqual({ grok: true });
		expect(getConfig().providers.grok).toMatchObject({
			source: "template",
			templateId: "grok",
			baseUrl: "https://api.x.ai/v1",
			models: [{ id: "grok-4", name: "Grok 4", reasoning: true, input: ["text"] }],
		});
		expect(getConfig().providers.grok?.apiKey).toBeUndefined();
	});

	it("cancels an in-flight SuperGrok login without writing the Grok preset", async () => {
		const auth = createAuth();
		auth.login = async (_providerId, callbacks) => {
			callbacks.onAuth({
				url: "https://accounts.x.ai/oauth2/device",
				instructions: "Enter code: WAIT-1",
			});
			await new Promise<void>((_resolve, reject) => {
				const onAbort = () => reject(new Error("Login cancelled"));
				if (callbacks.signal?.aborted) {
					onAbort();
					return;
				}
				callbacks.signal?.addEventListener("abort", onAbort, { once: true });
			});
		};
		const opened: string[] = [];
		let stored: ModelsConfig = { providers: {} };
		const service = new DesktopProviderOAuthService({
			auth,
			openUrl: async (url) => {
				opened.push(url);
			},
			refreshModels: async () => ({ models: [] }),
			readConfig: async () => stored,
			writeConfig: async (next) => {
				stored = next;
			},
			refreshRuntime: () => {},
		});
		const loginPromise = service.login(GROK_PRESET_PROVIDER_ID, { onDeviceCode: () => {} });
		await Promise.resolve();
		service.cancel();
		await expect(loginPromise).resolves.toEqual({ ok: false, cancelled: true });
		expect(stored.providers.grok).toBeUndefined();
		expect(opened).toEqual(["https://accounts.x.ai/oauth2/device"]);
	});

	it("logout removes the SuperGrok credential and the adopted Grok preset", async () => {
		const { service, auth, getConfig } = createService({
			providers: {
				grok: {
					source: "template",
					templateId: "grok",
					baseUrl: "https://api.x.ai/v1",
					models: [{ id: "grok-4" }],
				},
			},
			defaultModel: "grok/grok-4",
		});
		auth.set(GROK_PRESET_PROVIDER_ID, {
			type: "oauth",
			access: "grok-access",
			refresh: "grok-refresh",
			expires: Date.now() + 60_000,
		});
		await service.logout(GROK_PRESET_PROVIDER_ID);
		expect(auth.get(GROK_PRESET_PROVIDER_ID)).toBeUndefined();
		expect(getConfig().providers.grok).toBeUndefined();
		expect(getConfig().defaultModel).toBeUndefined();
		expect(service.status()).toEqual({ grok: false });
	});
});
