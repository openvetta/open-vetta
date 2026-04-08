import { resolveImGatewayBinary } from "./binary-resolver.js";
import { defaultImConfig, defaultImConfigPath, type ImConfig, loadImConfig, saveImConfig } from "./config-store.js";
import { defaultCredentialsPath, type ImCredentials, loadCredentials, saveCredentials } from "./credential-store.js";
import type { FeishuConfig, LogEvent, ProjectEntry, SessionStateEntry } from "./host-protocol.js";
import { LogBuffer } from "./log-buffer.js";
import { archiveLegacyFiles, detectLegacyImGateway, type LegacyDetection } from "./migration.js";
import { loadDesktopProjects, watchDesktopProjects } from "./project-source.js";
import { SidecarManager } from "./sidecar-manager.js";
import { applyStatePatch, defaultImStatePath, type ImStateFile, loadImState, saveImState } from "./state-store.js";
import { type ImBridgeStatus, StatusStore } from "./status-store.js";

/**
 * Top-level orchestrator for the IM bridge subsystem inside desktop-app.
 *
 * Responsibilities:
 *  - Load persisted config / credentials / state on startup.
 *  - Combine them into a SidecarConfig and feed the SidecarManager.
 *  - Persist state_patch events to disk via the state-store.
 *  - Push log/status events into LogBuffer / StatusStore.
 *  - Provide a small public API used by IPC handlers (start/stop/restart/
 *    setConfig/applyProjects/getStatus/getRecentLogs).
 *
 * Single instance per process. Created in main.ts at app.whenReady() and
 * disposed via shutdownForQuit() in app.before-quit.
 */
export interface ImHostPublicConfig {
	enabled: boolean;
	feishu: {
		appId: string;
		appSecret: string;
		verificationToken: string;
		encryptKey: string;
		baseUrl?: string;
	};
	transportMode: "long-connection";
	// Retained for backwards compat with renderer; always false now that
	// we no longer encrypt via safeStorage.
	encryptionAvailable: boolean;
}

export interface SetConfigPayload {
	enabled: boolean;
	feishu: {
		appId: string;
		appSecret?: string;
		verificationToken?: string;
		encryptKey?: string;
		baseUrl?: string;
	};
}

export interface SetConfigResult {
	ok: boolean;
	mode?: "plaintext";
	error?: string;
}

export class ImHost {
	readonly statusStore = new StatusStore();
	readonly logBuffer = new LogBuffer(500);

	private config: ImConfig = defaultImConfig();
	private credentials: ImCredentials = {};
	private state: ImStateFile = { version: 1, sessions: [] };
	private projects: ProjectEntry[] = [];

	private manager: SidecarManager;
	private binaryPath?: string;
	private projectWatchUnsub?: () => void;

	constructor() {
		this.manager = new SidecarManager({
			hooks: {
				onReady: (event) => {
					this.statusStore.patch({ transport: "online", lastError: undefined });
					this.logBuffer.push({
						type: "log",
						level: "info",
						msg: `sidecar ready ${event.transport} v${event.version}`,
						time: new Date().toISOString(),
					});
				},
				onStatus: (event) => {
					this.statusStore.patch({
						transport: event.transport,
						lastError: event.lastError,
						lastErrorAt: event.lastError ? event.time : undefined,
					});
				},
				onLog: (event) => {
					this.logBuffer.push(event);
				},
				onMetric: (event) => {
					if (event.name === "active_sessions") {
						this.statusStore.patch({ activeSessions: Math.round(event.value) });
					}
				},
				onStatePatch: (event) => {
					this.state = applyStatePatch(this.state, {
						userId: event.userId,
						projectId: event.projectId,
						sessionPath: event.sessionPath,
						updatedAt: event.updatedAt,
					});
					try {
						saveImState(this.state);
					} catch (err) {
						this.appendLog("warn", `state save failed: ${(err as Error).message}`);
					}
				},
				onSpawned: (pid) => {
					this.statusStore.patch({
						sidecarPid: pid,
						sidecarStartedAt: new Date().toISOString(),
						consecutiveStartFailures: 0,
					});
				},
				onExit: () => {
					this.statusStore.patch({ sidecarPid: undefined });
				},
				onFatal: (reason) => {
					this.statusStore.patch({
						transport: "error",
						lastError: reason,
						lastErrorAt: new Date().toISOString(),
					});
					this.appendLog("error", reason);
				},
			},
		});
	}

	/** One-time bootstrap on app.whenReady. Loads disk state and (if
	 * enabled and credentials present) starts the sidecar. */
	async bootstrap(): Promise<void> {
		try {
			this.config = loadImConfig();
		} catch {
			this.config = defaultImConfig();
		}
		try {
			this.credentials = loadCredentials();
		} catch {
			this.credentials = {};
		}
		try {
			this.state = loadImState();
		} catch {
			this.state = { version: 1, sessions: [] };
		}

		// Hydrate the project list from desktop-app's config and watch
		// the file for changes. This is what makes /projects in feishu
		// reflect what the user has pinned in the desktop UI.
		try {
			this.projects = loadDesktopProjects();
		} catch {
			this.projects = [];
		}
		this.projectWatchUnsub = watchDesktopProjects((projects) => {
			this.projects = projects;
			this.manager.updateProjects(projects);
			this.appendLog("info", `desktop project list updated (${projects.length} projects)`);
		});

		if (this.config.enabled && this.hasRequiredCredentials()) {
			await this.startSidecar();
		}
	}

	/** Plug in or replace the project list. Used by desktop-app's project
	 * source whenever the user adds/removes a project. */
	setProjects(projects: ProjectEntry[]): void {
		this.projects = projects;
		this.manager.updateProjects(projects);
	}

	getPublicConfig(): ImHostPublicConfig {
		return {
			enabled: this.config.enabled,
			feishu: {
				appId: this.config.feishu.appId,
				appSecret: this.credentials.feishu?.appSecret ?? "",
				verificationToken: this.credentials.feishu?.verificationToken ?? "",
				encryptKey: this.credentials.feishu?.encryptKey ?? "",
				baseUrl: this.config.feishu.baseUrl,
			},
			transportMode: this.config.transportMode,
			encryptionAvailable: false,
		};
	}

	async setConfig(payload: SetConfigPayload): Promise<SetConfigResult> {
		// Update non-secret config.
		const nextConfig: ImConfig = {
			enabled: payload.enabled,
			feishu: {
				appId: payload.feishu.appId,
				baseUrl: payload.feishu.baseUrl,
			},
			transportMode: "long-connection",
		};

		// Update credentials. Form sends the actual value (no placeholder
		// magic anymore); we always overwrite with what the renderer sent.
		const nextCreds: ImCredentials = { ...this.credentials };
		nextCreds.feishu = {
			appSecret: payload.feishu.appSecret ?? "",
			verificationToken: payload.feishu.verificationToken,
			encryptKey: payload.feishu.encryptKey,
		};

		this.config = nextConfig;
		this.credentials = nextCreds;

		try {
			saveImConfig(this.config);
		} catch (err) {
			return { ok: false, error: `save config failed: ${(err as Error).message}` };
		}
		let mode: "plaintext" = "plaintext";
		try {
			mode = saveCredentials(this.credentials).mode;
		} catch (err) {
			return { ok: false, error: `save credentials failed: ${(err as Error).message}` };
		}

		// Apply runtime change.
		if (this.config.enabled && this.hasRequiredCredentials()) {
			if (this.manager.getCurrentChild()) {
				await this.manager.applyConfig(this.buildSidecarConfig());
			} else {
				await this.startSidecar();
			}
		} else {
			await this.manager.stop();
			this.statusStore.patch({ transport: "offline", lastError: undefined });
		}

		return { ok: true, mode };
	}

	async restart(): Promise<void> {
		if (this.config.enabled && this.hasRequiredCredentials()) {
			await this.manager.restart();
		}
	}

	async shutdownForQuit(): Promise<void> {
		this.projectWatchUnsub?.();
		this.projectWatchUnsub = undefined;
		await this.manager.shutdownForQuit();
	}

	getStatus(): ImBridgeStatus {
		return this.statusStore.get();
	}

	getRecentLogs(): LogEvent[] {
		return this.logBuffer.snapshot();
	}

	subscribeStatus(handler: (snapshot: ImBridgeStatus) => void): () => void {
		return this.statusStore.subscribe(handler);
	}

	subscribeLog(handler: (event: LogEvent) => void): () => void {
		return this.logBuffer.subscribe(handler);
	}

	getPaths(): { config: string; credentials: string; state: string } {
		return {
			config: defaultImConfigPath(),
			credentials: defaultCredentialsPath(),
			state: defaultImStatePath(),
		};
	}

	/**
	 * Detect legacy im-gateway data on disk. Returns a description that
	 * the renderer can use to render an import wizard. Idempotent (no
	 * mutation), safe to call multiple times.
	 */
	detectLegacy(): LegacyDetection {
		// Don't surface a wizard if the user already has new-format
		// credentials — this is a "fresh install upgrade" scenario.
		if (this.hasRequiredCredentials()) {
			return { hasLegacyData: false };
		}
		return detectLegacyImGateway();
	}

	/**
	 * Apply a legacy detection result: copy the parsed feishu credentials
	 * into the new credential store and rename the old files to .bak.
	 */
	async importLegacy(detection: LegacyDetection): Promise<{ ok: boolean; error?: string }> {
		if (!detection.parsed?.feishu?.appId || !detection.parsed.feishu.appSecret) {
			return { ok: false, error: "旧配置中未找到 App ID / App Secret" };
		}
		const result = await this.setConfig({
			enabled: false,
			feishu: {
				appId: detection.parsed.feishu.appId,
				appSecret: detection.parsed.feishu.appSecret,
				baseUrl: detection.parsed.feishu.baseUrl,
			},
		});
		if (!result.ok) return { ok: false, error: result.error };
		archiveLegacyFiles(detection);
		return { ok: true };
	}

	// =========================================================================
	// internals
	// =========================================================================

	private hasRequiredCredentials(): boolean {
		return Boolean(this.config.feishu.appId && this.credentials.feishu?.appSecret);
	}

	private buildFeishuConfig(): FeishuConfig {
		return {
			appId: this.config.feishu.appId,
			appSecret: this.credentials.feishu?.appSecret ?? "",
			verificationToken: this.credentials.feishu?.verificationToken,
			encryptKey: this.credentials.feishu?.encryptKey,
			baseUrl: this.config.feishu.baseUrl,
		};
	}

	private buildSidecarConfig() {
		if (!this.binaryPath) {
			this.binaryPath = resolveImGatewayBinary().path;
			this.statusStore.patch({ binaryPath: this.binaryPath });
		}
		return {
			binaryPath: this.binaryPath,
			feishu: this.buildFeishuConfig(),
			projects: this.projects,
			state: this.stateAsEntries(),
		};
	}

	private stateAsEntries(): SessionStateEntry[] {
		return this.state.sessions.map((s) => ({ ...s }));
	}

	private async startSidecar(): Promise<void> {
		try {
			const cfg = this.buildSidecarConfig();
			this.statusStore.patch({ transport: "connecting", lastError: undefined });
			await this.manager.start(cfg);
		} catch (err) {
			const msg = (err as Error).message;
			this.statusStore.patch({
				transport: "error",
				lastError: msg,
				lastErrorAt: new Date().toISOString(),
			});
			this.appendLog("error", `start sidecar failed: ${msg}`);
		}
	}

	private appendLog(level: LogEvent["level"], msg: string): void {
		this.logBuffer.push({
			type: "log",
			level,
			msg,
			time: new Date().toISOString(),
		});
	}
}

let instance: ImHost | undefined;

export function getImHost(): ImHost {
	if (!instance) instance = new ImHost();
	return instance;
}

export function disposeImHost(): void {
	instance = undefined;
}
