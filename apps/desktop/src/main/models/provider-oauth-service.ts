import { getOAuthProvider, registerOAuthProvider, xaiOAuthProvider } from "@vetta/ai";
import type { CodingAgentAuthRuntime } from "@vetta/coding-agent/host-services";
import { GROK_PRESET_PROVIDER_ID } from "../../shared/grok-oauth.js";
import type { ModelsConfig } from "./model-settings-service.js";
import { getPresetProvider } from "./presets/catalog.js";
import type { PresetModelsResult } from "./presets/fetch.js";

export interface ProviderOAuthDeviceInfo {
	readonly url: string;
	readonly userCode: string;
}

export interface ProviderOAuthLoginResult {
	readonly ok: boolean;
	readonly cancelled?: boolean;
	readonly error?: string;
}

export interface ProviderOAuthStatus {
	readonly grok: boolean;
}

export interface DesktopProviderOAuthServiceOptions {
	readonly auth: CodingAgentAuthRuntime;
	readonly openUrl: (url: string) => Promise<void>;
	readonly refreshModels: (providerId: string, apiKey?: string) => Promise<PresetModelsResult>;
	readonly readConfig: () => Promise<ModelsConfig>;
	readonly writeConfig: (config: ModelsConfig) => Promise<void>;
	readonly refreshRuntime: () => void;
}

const LOGIN_CANCELLED = "Login cancelled";

export function ensureGrokOAuthAlias(): void {
	if (getOAuthProvider(GROK_PRESET_PROVIDER_ID)) return;
	registerOAuthProvider({
		id: GROK_PRESET_PROVIDER_ID,
		name: xaiOAuthProvider.name,
		login: xaiOAuthProvider.login,
		refreshToken: (credentials) => xaiOAuthProvider.refreshToken(credentials),
		getApiKey: (credentials) => xaiOAuthProvider.getApiKey(credentials),
	});
}

export function parseGrokDeviceAuth(info: { url: string; instructions?: string }): ProviderOAuthDeviceInfo {
	const matched = info.instructions?.match(/Enter code:\s*(\S+)/i);
	return {
		url: info.url,
		userCode: matched?.[1] ?? "",
	};
}

export class DesktopProviderOAuthService {
	private loginAbort: AbortController | undefined;

	constructor(private readonly options: DesktopProviderOAuthServiceOptions) {
		ensureGrokOAuthAlias();
	}

	status(): ProviderOAuthStatus {
		return { grok: this.options.auth.get(GROK_PRESET_PROVIDER_ID)?.type === "oauth" };
	}

	cancel(): void {
		this.loginAbort?.abort();
	}

	async logout(providerId: string): Promise<void> {
		if (providerId !== GROK_PRESET_PROVIDER_ID) {
			throw new Error(`Unsupported OAuth provider: ${providerId}`);
		}
		this.options.auth.logout(GROK_PRESET_PROVIDER_ID);
		const config = await this.options.readConfig();
		if (!config.providers[GROK_PRESET_PROVIDER_ID]) {
			this.options.refreshRuntime();
			return;
		}
		const providers = { ...config.providers };
		delete providers[GROK_PRESET_PROVIDER_ID];
		const defaultModel = config.defaultModel?.startsWith(`${GROK_PRESET_PROVIDER_ID}/`)
			? undefined
			: config.defaultModel;
		await this.options.writeConfig({ ...config, defaultModel, providers });
		this.options.refreshRuntime();
	}

	async login(
		providerId: string,
		callbacks: { onDeviceCode: (info: ProviderOAuthDeviceInfo) => void },
	): Promise<ProviderOAuthLoginResult> {
		if (providerId !== GROK_PRESET_PROVIDER_ID) {
			return { ok: false, error: `Unsupported OAuth provider: ${providerId}` };
		}
		if (this.loginAbort) {
			return { ok: false, error: "A Grok login is already in progress" };
		}
		const abort = new AbortController();
		this.loginAbort = abort;
		try {
			await this.options.auth.login(GROK_PRESET_PROVIDER_ID, {
				onAuth: (info) => {
					const device = parseGrokDeviceAuth(info);
					void this.options.openUrl(device.url);
					callbacks.onDeviceCode(device);
				},
				onPrompt: async () => {
					throw new Error("Grok login does not prompt for extra input");
				},
				signal: abort.signal,
			});
			if (abort.signal.aborted) {
				return { ok: false, cancelled: true };
			}
			await this.adoptGrokPreset();
			this.options.refreshRuntime();
			return { ok: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (abort.signal.aborted || message === LOGIN_CANCELLED) {
				return { ok: false, cancelled: true };
			}
			return { ok: false, error: message };
		} finally {
			if (this.loginAbort === abort) this.loginAbort = undefined;
		}
	}

	private async adoptGrokPreset(): Promise<void> {
		const preset = getPresetProvider(GROK_PRESET_PROVIDER_ID);
		if (!preset) throw new Error("Grok preset is missing");
		const token = await this.options.auth.getApiKey(GROK_PRESET_PROVIDER_ID);
		const fetched = token ? await this.options.refreshModels(GROK_PRESET_PROVIDER_ID, token) : undefined;
		const config = await this.options.readConfig();
		const existing = config.providers[GROK_PRESET_PROVIDER_ID];
		const models = fetched?.models.length ? fetched.models : (existing?.models ?? []);
		await this.options.writeConfig({
			...config,
			providers: {
				...config.providers,
				[GROK_PRESET_PROVIDER_ID]: {
					...existing,
					source: "template",
					templateId: GROK_PRESET_PROVIDER_ID,
					displayName: preset.displayName,
					icon: preset.icon,
					api: preset.api,
					baseUrl: preset.baseUrl,
					models,
					...(fetched?.models.length ? { modelsSyncedAt: new Date().toISOString() } : {}),
				},
			},
		});
	}
}
