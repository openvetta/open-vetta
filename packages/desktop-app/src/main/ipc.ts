import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DefaultResourceLoader, getAgentDir } from "@vetta/coding-agent";
import { app, dialog, ipcMain, shell, type WebContents } from "electron";
import type { PromptRequest, SessionConfig, SessionEvent, SettingsPatch } from "../../../runtime-core/src/index.js";
import { RuntimeHost } from "../../../runtime-core/src/index.js";
import { allowProjectRoot } from "./ipc-fs.js";
import { checkForUpdate } from "./updater.js";

const DEFAULT_SERVER_URL = "http://127.0.0.1:8080/api/v1";

// Lightweight settings.json helpers (avoids importing SettingsManager internals)
function getSettingsPath(): string {
	return join(getAgentDir(), "settings.json");
}

function readSettings(): Record<string, unknown> {
	const path = getSettingsPath();
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return {};
	}
}

function writeSettings(settings: Record<string, unknown>): void {
	const path = getSettingsPath();
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(path, JSON.stringify(settings, null, 2), "utf-8");
}

// Remote providers cache
interface RemoteProvidersResult {
	providers: Record<string, unknown>;
	error?: string;
}

async function fetchRemoteProviders(): Promise<RemoteProvidersResult> {
	const settings = readSettings();
	let serverUrl = settings.serverUrl as string | undefined;
	if (!serverUrl) {
		serverUrl = DEFAULT_SERVER_URL;
		settings.serverUrl = serverUrl;
		writeSettings(settings);
	}
	const serverToken = settings.serverToken as string | undefined;
	if (!serverToken) {
		return { providers: {}, error: "未登录" };
	}

	try {
		const url = `${serverUrl.replace(/\/$/, "")}/providers/models.json`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${serverToken}`,
			},
		});
		clearTimeout(timeout);

		if (response.status === 401) {
			return { providers: {}, error: "unauthorized" };
		}
		if (!response.ok) {
			return { providers: {}, error: `HTTP ${response.status}` };
		}

		const body = (await response.json()) as { code: number; data?: { providers?: Record<string, unknown> } };
		if (body.code !== 0 || !body.data?.providers) {
			return { providers: {} };
		}
		return { providers: body.data.providers };
	} catch {
		return { providers: {}, error: "服务器不可达" };
	}
}

const CHANNELS = {
	CREATE: "vetta:session:create",
	LIST_PROJECTS: "vetta:session:list-projects",
	LIST_SESSIONS: "vetta:session:list-sessions",
	PROMPT: "vetta:session:prompt",
	CONTINUE: "vetta:session:continue",
	ABORT: "vetta:session:abort",
	SUBSCRIBE: "vetta:session:subscribe",
	UNSUBSCRIBE: "vetta:session:unsubscribe",
	UPDATE_SETTINGS: "vetta:session:update-settings",
	GET_STATE: "vetta:session:get-state",
	GET_MESSAGES: "vetta:session:get-messages",
	DELETE: "vetta:session:delete",
	RENAME: "vetta:session:rename",
	EVENT: "vetta:session:event",
} as const;

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Invalid ${fieldName}`);
	}
}

function assertPromptRequest(value: unknown): asserts value is PromptRequest {
	if (typeof value !== "object" || value === null) {
		throw new Error("Invalid prompt request");
	}
	const request = value as Record<string, unknown>;
	if (typeof request.text !== "string" || request.text.length === 0) {
		throw new Error("Invalid prompt request text");
	}
	if (
		request.streamingBehavior !== undefined &&
		request.streamingBehavior !== "steer" &&
		request.streamingBehavior !== "followUp"
	) {
		throw new Error("Invalid prompt request streamingBehavior");
	}
	if (request.images !== undefined) {
		if (!Array.isArray(request.images)) {
			throw new Error("Invalid prompt request images");
		}
		for (const img of request.images as Array<Record<string, unknown>>) {
			if (img.type !== "image" || typeof img.data !== "string" || typeof img.mimeType !== "string") {
				throw new Error("Invalid prompt request image entry");
			}
		}
	}
}

export function registerRuntimeIpc(webContents: WebContents): () => void {
	const runtime = new RuntimeHost();
	const subscriptionMap = new Map<string, () => void>();

	ipcMain.handle("vetta:settings:get-server-url", () => {
		const settings = readSettings();
		let url = settings.serverUrl as string | undefined;
		if (!url) {
			url = DEFAULT_SERVER_URL;
			settings.serverUrl = url;
			writeSettings(settings);
		}
		return url;
	});

	ipcMain.handle("vetta:settings:get-server-token", () => {
		const settings = readSettings();
		return (settings.serverToken as string | undefined) ?? undefined;
	});

	ipcMain.handle("vetta:settings:set-server-token", (_event, token: unknown) => {
		const settings = readSettings();
		if (typeof token === "string") {
			settings.serverToken = token;
		} else {
			delete settings.serverToken;
		}
		writeSettings(settings);
	});

	ipcMain.handle("vetta:models:fetch-remote", async () => {
		return fetchRemoteProviders();
	});

	ipcMain.handle("vetta:updater:check", async () => {
		return checkForUpdate();
	});

	ipcMain.handle("vetta:updater:get-current-version", () => {
		return app.getVersion();
	});

	ipcMain.handle("vetta:updater:download", async (_event, url: unknown) => {
		if (typeof url !== "string") throw new Error("Invalid URL");
		await shell.openExternal(url);
	});

	ipcMain.handle("vetta:skills:list", async () => {
		const loader = new DefaultResourceLoader({});
		await loader.reload();
		const { skills } = loader.getSkills();
		return skills.map((s) => ({ name: s.name, description: s.description, source: s.source, type: s.type }));
	});

	// ─── Market skills ───

	const skillsBaseDir = join(homedir(), ".vetta", "skills");
	const manifestPath = join(homedir(), ".vetta", "skills-manifest.json");

	interface InstalledMarketSkill {
		name: string;
		version: string;
		installedAt: string;
		source: "market";
	}

	function readManifest(): Record<string, InstalledMarketSkill> {
		if (!existsSync(manifestPath)) return {};
		try {
			return JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, InstalledMarketSkill>;
		} catch {
			return {};
		}
	}

	function writeManifest(manifest: Record<string, InstalledMarketSkill>): void {
		const dir = dirname(manifestPath);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
	}

	function parseVersionFromSkillDir(skillDir: string): string {
		const skillMdPath = join(skillDir, "SKILL.md");
		if (!existsSync(skillMdPath)) return "0.0.0";
		try {
			const content = readFileSync(skillMdPath, "utf-8");
			const versionMatch = content.match(/version:\s*["']?([^\s"']+)["']?/i);
			return versionMatch?.[1] ?? "0.0.0";
		} catch {
			return "0.0.0";
		}
	}

	ipcMain.handle("vetta:skills:install-from-market", async (_event, name: unknown, archiveBuffer: unknown) => {
		assertNonEmptyString(name, "name");
		if (!(archiveBuffer instanceof ArrayBuffer) && !Buffer.isBuffer(archiveBuffer)) {
			throw new Error("Invalid archive buffer");
		}

		const buffer = Buffer.isBuffer(archiveBuffer) ? archiveBuffer : Buffer.from(archiveBuffer as ArrayBuffer);

		// Ensure skills directory exists
		if (!existsSync(skillsBaseDir)) {
			await mkdir(skillsBaseDir, { recursive: true });
		}

		const skillDir = join(skillsBaseDir, name);
		if (!existsSync(skillDir)) {
			await mkdir(skillDir, { recursive: true });
		}

		// Save to temp file and extract
		const tmpFile = join(skillsBaseDir, `_tmp_${name}_${Date.now()}.tar.gz`);
		try {
			await writeFile(tmpFile, buffer);
			execSync(`tar -xzf "${tmpFile}" -C "${skillDir}"`, { timeout: 30000 });
		} finally {
			// Cleanup temp file
			try {
				await rm(tmpFile, { force: true });
			} catch {
				// ignore cleanup errors
			}
		}

		// Parse version from extracted SKILL.md
		const version = parseVersionFromSkillDir(skillDir);

		// Update manifest
		const manifest = readManifest();
		manifest[name] = {
			name,
			version,
			installedAt: new Date().toISOString(),
			source: "market",
		};
		writeManifest(manifest);
	});

	ipcMain.handle("vetta:skills:uninstall", async (_event, name: unknown) => {
		assertNonEmptyString(name, "name");

		const skillDir = join(skillsBaseDir, name);
		if (existsSync(skillDir)) {
			await rm(skillDir, { recursive: true, force: true });
		}

		// Remove from manifest
		const manifest = readManifest();
		delete manifest[name];
		writeManifest(manifest);
	});

	ipcMain.handle("vetta:skills:get-market-manifest", async () => {
		return readManifest();
	});

	const IMAGE_MIME: Record<string, string> = {
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".gif": "image/gif",
		".webp": "image/webp",
		".svg": "image/svg+xml",
		".bmp": "image/bmp",
	};

	ipcMain.handle("vetta:dialog:select-images", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile", "multiSelections"],
			title: "Select Images",
			filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] }],
		});
		if (result.canceled || result.filePaths.length === 0) return [];
		const images = await Promise.all(
			result.filePaths.map(async (filePath) => {
				const buffer = await readFile(filePath);
				const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
				return {
					data: buffer.toString("base64"),
					mimeType: IMAGE_MIME[ext] || "image/png",
					name: basename(filePath),
				};
			}),
		);
		return images;
	});

	ipcMain.handle("vetta:dialog:select-folder", async () => {
		const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "Select Project Folder" });
		if (result.canceled || result.filePaths.length === 0) return null;
		const selectedPath = result.filePaths[0];
		allowProjectRoot(selectedPath);
		return selectedPath;
	});

	ipcMain.handle(CHANNELS.CREATE, async (_event, config?: SessionConfig) => {
		if (config?.cwd) allowProjectRoot(config.cwd);
		return runtime.createSession(config);
	});

	ipcMain.handle(CHANNELS.LIST_PROJECTS, async () => {
		const projects = await runtime.listProjects();
		for (const p of projects) allowProjectRoot(p.cwd);
		return projects;
	});

	ipcMain.handle(CHANNELS.LIST_SESSIONS, async (_event, cwd: unknown) => {
		assertNonEmptyString(cwd, "cwd");
		allowProjectRoot(cwd);
		return runtime.listSessions(cwd);
	});

	ipcMain.handle(CHANNELS.PROMPT, async (_event, sessionId: unknown, request: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		assertPromptRequest(request);
		const req = request as PromptRequest;
		if (req.images && req.images.length > 0) {
			console.log(
				`[IPC PROMPT] images: ${req.images.length}, first type=${req.images[0].type}, mimeType=${req.images[0].mimeType}, data.length=${req.images[0].data.length}`,
			);
		} else {
			console.log(`[IPC PROMPT] no images in request`);
		}
		await runtime.prompt(sessionId, request);
	});

	ipcMain.handle(CHANNELS.CONTINUE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		await runtime.continue(sessionId);
	});

	ipcMain.handle(CHANNELS.ABORT, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		await runtime.abort(sessionId);
	});

	ipcMain.handle(CHANNELS.UPDATE_SETTINGS, async (_event, sessionId: unknown, partialSettings: SettingsPatch) => {
		assertNonEmptyString(sessionId, "sessionId");
		await runtime.updateSettings(sessionId, partialSettings);
	});

	ipcMain.handle(CHANNELS.GET_STATE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.getState(sessionId);
	});

	ipcMain.handle(CHANNELS.GET_MESSAGES, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		return runtime.getMessages(sessionId);
	});

	ipcMain.handle(CHANNELS.DELETE, async (_event, sessionPath: unknown) => {
		assertNonEmptyString(sessionPath, "sessionPath");
		await runtime.deleteSession(sessionPath);
	});

	ipcMain.handle(CHANNELS.RENAME, async (_event, sessionPath: unknown, name: unknown) => {
		assertNonEmptyString(sessionPath, "sessionPath");
		assertNonEmptyString(name, "name");
		await runtime.renameSession(sessionPath, name);
	});

	ipcMain.handle(CHANNELS.SUBSCRIBE, async (_event, sessionId: unknown) => {
		assertNonEmptyString(sessionId, "sessionId");
		const subscriptionId = `${sessionId}:${randomUUID()}`;
		const unsubscribe = runtime.subscribe(sessionId, (runtimeEvent: SessionEvent) => {
			webContents.send(CHANNELS.EVENT, subscriptionId, runtimeEvent);
		});
		subscriptionMap.set(subscriptionId, unsubscribe);
		return { subscriptionId };
	});

	ipcMain.handle(CHANNELS.UNSUBSCRIBE, async (_event, subscriptionId: unknown) => {
		assertNonEmptyString(subscriptionId, "subscriptionId");
		const unsubscribe = subscriptionMap.get(subscriptionId);
		if (unsubscribe) {
			unsubscribe();
			subscriptionMap.delete(subscriptionId);
		}
	});

	return () => {
		for (const unsubscribe of subscriptionMap.values()) {
			unsubscribe();
		}
		subscriptionMap.clear();
		ipcMain.removeHandler("vetta:settings:get-server-url");
		ipcMain.removeHandler("vetta:settings:get-server-token");
		ipcMain.removeHandler("vetta:settings:set-server-token");
		ipcMain.removeHandler("vetta:models:fetch-remote");
		ipcMain.removeHandler("vetta:updater:check");
		ipcMain.removeHandler("vetta:updater:get-current-version");
		ipcMain.removeHandler("vetta:updater:download");
		ipcMain.removeHandler("vetta:skills:list");
		ipcMain.removeHandler("vetta:skills:install-from-market");
		ipcMain.removeHandler("vetta:skills:uninstall");
		ipcMain.removeHandler("vetta:skills:get-market-manifest");
		ipcMain.removeHandler("vetta:dialog:select-images");
		ipcMain.removeHandler("vetta:dialog:select-folder");
	};
}
