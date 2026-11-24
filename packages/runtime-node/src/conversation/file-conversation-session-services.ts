import { closeSync, type Dirent, openSync, readFileSync, readSync, type Stats, statSync } from "node:fs";
import { type FileHandle, open, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
	HistoryEntry,
	ProjectInfo,
	RuntimeSessionCatalog,
	RuntimeSessionFileHistoryReader,
	SessionHistoryInfo,
} from "@vetta/runtime-core";
import { type ConversationDocument, projectConversationDocumentHistory } from "@vetta/runtime-core/conversation";
import {
	type ConversationOwnershipManager,
	isConversationFileHeader,
	type ReadConversationFileHeader,
} from "@vetta/runtime-storage/conversation";
import {
	documentFromFile,
	encodeConversationSessionId,
	extendDocumentWithRecords,
	parseAppendedConversationRecords,
	parseConversationFile,
} from "./conversation-file-codec.js";
import { acquireConversationFileLock } from "./conversation-file-lock.js";
import { FileConversationOwnershipManager } from "./conversation-ownership-lease.js";
import { FileConversationRepository } from "./file-conversation-repository.js";
import { nodeErrorCode } from "./node-error-code.js";

const CONVERSATION_FILE_SUFFIX = ".conversation.jsonl";
const CONVERSATION_HEADER_READ_BYTES = 64 * 1024;
const LAST_MESSAGE_PREVIEW_LENGTH = 120;
/** 会话摘要缓存的条数上限；每条只是一份小摘要，上限只防止极端目录把内存撑大。 */
const HISTORY_INFO_CACHE_LIMIT = 20_000;

interface CachedHistoryInfo {
	readonly mtimeMs: number;
	readonly size: number;
	readonly info: SessionHistoryInfo;
}

/**
 * 会话摘要（标题、首条消息、活跃时间）按文件缓存，模块级共享。
 *
 * 列目录原本要把目录下每个会话文件完整读入并解析，会话一多就是数秒，而侧栏加载项目、
 * 命令面板的每次搜索都要列目录。会话文件只追加写，内容变了大小必变，所以用
 * （修改时间, 大小）判定是否还能复用：没变的文件只做一次 stat。Catalog 实例按调用新建
 * （见 runtime-desktop 的 catalogForCurrentRoots），缓存因此放在模块级而不是实例上。
 * 以 Map 的插入顺序做 LRU。
 */
const historyInfoCache = new Map<string, CachedHistoryInfo>();

async function readCachedSessionHistoryInfo(sessionPath: string, fallbackCwd: string): Promise<SessionHistoryInfo> {
	const stats = await stat(sessionPath);
	// fallbackCwd 会进入结果（文件里没有 cwd 时兜底），所以也是键的一部分。
	const key = `${resolve(sessionPath)}\0${fallbackCwd}`;
	const cached = historyInfoCache.get(key);
	if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
		historyInfoCache.delete(key);
		historyInfoCache.set(key, cached);
		return { ...cached.info };
	}
	const info = await readSessionHistoryInfo(sessionPath, fallbackCwd, stats.mtimeMs);
	historyInfoCache.delete(key);
	historyInfoCache.set(key, { mtimeMs: stats.mtimeMs, size: stats.size, info });
	while (historyInfoCache.size > HISTORY_INFO_CACHE_LIMIT) {
		const oldest = historyInfoCache.keys().next().value;
		if (oldest === undefined) break;
		historyInfoCache.delete(oldest);
	}
	return { ...info };
}

export interface RuntimeConversationSessionRoot {
	readonly cwd: string;
	readonly sessionDir: string;
}

export interface FileConversationRuntimeSessionCatalogOptions {
	readonly roots?: readonly RuntimeConversationSessionRoot[];
	readonly ownershipManager?: ConversationOwnershipManager;
	readonly artifactCleaner?: ConversationSessionArtifactCleaner;
}

export interface ConversationSessionArtifactCleaner {
	deleteSessionArtifacts(sessionId: string): Promise<void>;
}

/** Native conversation 文件的离线目录与生命周期适配器。 */
export class FileConversationRuntimeSessionCatalog implements RuntimeSessionCatalog {
	private readonly roots: readonly RuntimeConversationSessionRoot[];
	private readonly ownershipManager: ConversationOwnershipManager;
	private readonly artifactCleaner: ConversationSessionArtifactCleaner | undefined;

	constructor(options: FileConversationRuntimeSessionCatalogOptions = {}) {
		this.roots = options.roots ?? [];
		this.ownershipManager = options.ownershipManager ?? new FileConversationOwnershipManager();
		this.artifactCleaner = options.artifactCleaner;
	}

	async ownsSession(sessionPath: string): Promise<boolean> {
		try {
			const header = await readConversationHeader(sessionPath);
			return header !== undefined && isCanonicalConversationPath(sessionPath, header.sessionId);
		} catch {
			return false;
		}
	}

	async listProjects(): Promise<ProjectInfo[]> {
		const sessionsByCwd = new Map<string, Set<string>>();
		for (const root of this.roots) {
			const sessions = await this.listRoot(root.cwd, root.sessionDir);
			let paths = sessionsByCwd.get(root.cwd);
			if (!paths) {
				paths = new Set<string>();
				sessionsByCwd.set(root.cwd, paths);
			}
			for (const session of sessions) paths.add(resolve(session.path));
		}
		return Array.from(sessionsByCwd, ([cwd, paths]) => ({ cwd, sessionCount: paths.size }))
			.filter(({ sessionCount }) => sessionCount > 0)
			.sort((left, right) => left.cwd.localeCompare(right.cwd));
	}

	async listSessions(cwd: string, sessionDir?: string): Promise<SessionHistoryInfo[]> {
		const roots = sessionDir
			? [{ cwd, sessionDir }]
			: this.roots.filter((root) => resolve(root.cwd) === resolve(cwd));
		const lists = await Promise.all(roots.map((root) => this.listRoot(root.cwd, root.sessionDir)));
		const sessions = new Map<string, SessionHistoryInfo>();
		for (const list of lists) {
			for (const session of list) sessions.set(resolve(session.path), session);
		}
		return Array.from(sessions.values()).sort((left, right) => right.modifiedAt - left.modifiedAt);
	}

	async renameSession(sessionPath: string, name: string): Promise<void> {
		const path = resolve(sessionPath);
		await requireConversationHeader(path);
		const lease = await this.ownershipManager.acquire(path);
		const repository = new FileConversationRepository({ rootDir: dirname(path) });
		try {
			const header = await requireConversationHeader(path);
			if (repository.resolveConversationPath(header.sessionId) !== path) {
				throw new Error(`Conversation path does not match its session id: ${path}`);
			}
			await repository.execute(header.sessionId, null, { type: "session.name.set", name });
		} finally {
			await repository.close();
			await lease.release();
		}
	}

	async deleteSessionArtifacts(sessionPath: string): Promise<void> {
		const path = resolve(sessionPath);
		await requireConversationHeader(path);
		const lease = await this.ownershipManager.acquire(path);
		let releaseFileLock: (() => Promise<void>) | undefined;
		try {
			const header = await requireConversationHeader(path);
			releaseFileLock = await acquireConversationFileLock(`${path}.lock`, header.sessionId);
			await this.artifactCleaner?.deleteSessionArtifacts(header.sessionId);
			await rm(join(dirname(path), `${encodeConversationSessionId(header.sessionId)}.snapshot.json`), {
				force: true,
			});
			await rm(path, { force: true });
		} finally {
			await releaseFileLock?.();
			await lease.release();
		}
	}

	private async listRoot(cwd: string, sessionDir: string): Promise<SessionHistoryInfo[]> {
		let entries: Dirent<string>[];
		try {
			entries = await readdir(sessionDir, { withFileTypes: true });
		} catch (error) {
			if (nodeErrorCode(error) === "ENOENT") return [];
			throw error;
		}
		const sessions = await Promise.all(
			entries
				.filter((entry) => entry.isFile() && entry.name.endsWith(CONVERSATION_FILE_SUFFIX))
				.map(async (entry) => {
					try {
						return await readCachedSessionHistoryInfo(join(sessionDir, entry.name), cwd);
					} catch {
						return undefined;
					}
				}),
		);
		return sessions.filter((session): session is SessionHistoryInfo => session !== undefined);
	}
}

interface FileHistoryCacheEntry {
	readonly ino: number;
	readonly size: number;
	readonly mtimeMs: number;
	readonly header: ReadConversationFileHeader;
	readonly document: ConversationDocument;
	readonly nextEventSequence: number;
	readonly history: HistoryEntry[];
}

export interface FileConversationRuntimeSessionFileHistoryReaderOptions {
	/** 缓存几份会话的解析结果；一次性批量读取（如搜索）传 0。 */
	readonly cacheEntries?: number;
}

const DEFAULT_FILE_HISTORY_CACHE_ENTRIES = 4;

/**
 * Native conversation 文件到 Runtime 历史合同的同步只读投影。
 *
 * 只读查看器在被观察的会话每次写入后都会重读；长会话整份解析要上百毫秒，且压在 Electron 主进程上。
 * 会话文件只追加写，所以按路径缓存上次的文档投影：文件没变直接返回同一份历史（引用相等，调用方可据此跳过推送），
 * 只变长就只解析新增的整行；其他任何变化回退整份解析。
 */
export class FileConversationRuntimeSessionFileHistoryReader implements RuntimeSessionFileHistoryReader {
	private readonly cache = new Map<string, FileHistoryCacheEntry>();
	private readonly cacheEntries: number;

	constructor(options: FileConversationRuntimeSessionFileHistoryReaderOptions = {}) {
		this.cacheEntries = options.cacheEntries ?? DEFAULT_FILE_HISTORY_CACHE_ENTRIES;
	}

	canRead(sessionPath: string): boolean {
		try {
			const header = readConversationHeaderSync(sessionPath);
			return header !== undefined && isCanonicalConversationPath(sessionPath, header.sessionId);
		} catch {
			return false;
		}
	}

	read(sessionPath: string): { history: HistoryEntry[] } {
		const key = resolve(sessionPath);
		const cached = this.cache.get(key);
		if (cached) {
			const stats = statSync(key);
			if (stats.ino === cached.ino && stats.size === cached.size && stats.mtimeMs === cached.mtimeMs) {
				this.remember(key, cached);
				return { history: cached.history };
			}
			if (stats.ino === cached.ino && stats.size > cached.size) {
				const extended = extendFileHistory(key, cached, stats);
				if (extended) {
					this.remember(key, extended);
					return { history: extended.history };
				}
			}
			this.cache.delete(key);
		}
		return { history: this.readWhole(key).history };
	}

	private readWhole(sessionPath: string): FileHistoryCacheEntry {
		const before = statSync(sessionPath);
		const text = readFileSync(sessionPath, "utf8");
		const header = parseConversationHeader(text);
		if (!header || !isCanonicalConversationPath(sessionPath, header.sessionId)) {
			throw new Error(`Unsupported native conversation file: ${sessionPath}`);
		}
		const file = parseConversationFile(text, header.sessionId);
		const document = documentFromFile(header.sessionId, file);
		const entry: FileHistoryCacheEntry = {
			ino: before.ino,
			size: before.size,
			mtimeMs: before.mtimeMs,
			header,
			document,
			nextEventSequence: (file.eventRecords.at(-1)?.sequence ?? 0) + 1,
			history: projectConversationDocumentHistory(document),
		};
		// 读的过程中文件被改写时，内容与身份对不上，不缓存。
		if (Buffer.byteLength(text, "utf8") === before.size) this.remember(sessionPath, entry);
		return entry;
	}

	private remember(sessionPath: string, entry: FileHistoryCacheEntry): void {
		this.cache.delete(sessionPath);
		if (this.cacheEntries <= 0) return;
		this.cache.set(sessionPath, entry);
		while (this.cache.size > this.cacheEntries) {
			this.cache.delete(this.cache.keys().next().value as string);
		}
	}
}

/** 只解析缓存之后新增的整行；读到半行时保留缓存等下次写入，无法增量时返回 undefined。 */
function extendFileHistory(
	sessionPath: string,
	cached: FileHistoryCacheEntry,
	stats: Stats,
): FileHistoryCacheEntry | undefined {
	const appended = Buffer.alloc(stats.size - cached.size);
	const descriptor = openSync(sessionPath, "r");
	let bytesRead: number;
	try {
		bytesRead = readSync(descriptor, appended, 0, appended.length, cached.size);
	} finally {
		closeSync(descriptor);
	}
	const lastNewline = appended.lastIndexOf(0x0a, bytesRead - 1);
	if (lastNewline < 0) return cached;
	const complete = appended.subarray(0, lastNewline + 1);
	try {
		const parsed = parseAppendedConversationRecords(
			complete.toString("utf8"),
			cached.header.sessionId,
			cached.header,
			cached.nextEventSequence,
		);
		if (!parsed) return undefined;
		const document = extendDocumentWithRecords(cached.header.sessionId, cached.document, parsed.records);
		return {
			...cached,
			size: cached.size + complete.length,
			// 只并入了一部分新增字节时，让下次的身份比较必然不等，从新的偏移继续读。
			mtimeMs: complete.length === appended.length ? stats.mtimeMs : Number.NaN,
			document,
			nextEventSequence: parsed.nextEventSequence,
			history: projectConversationDocumentHistory(document),
		};
	} catch {
		return undefined;
	}
}

async function readSessionHistoryInfo(
	sessionPath: string,
	fallbackCwd: string,
	fileModifiedAt: number,
): Promise<SessionHistoryInfo> {
	const text = await readFile(sessionPath, "utf8");
	const header = parseConversationHeader(text);
	if (!header || !isCanonicalConversationPath(sessionPath, header.sessionId)) {
		throw new Error(`Unsupported native conversation file: ${sessionPath}`);
	}
	const document = documentFromFile(header.sessionId, parseConversationFile(text, header.sessionId));
	const history = projectConversationDocumentHistory(document);
	const conversationMessages = history.flatMap((entry) => {
		if (entry.type !== "message" || (entry.message.role !== "user" && entry.message.role !== "assistant")) {
			return [];
		}
		return [entry.message];
	});
	const messageTexts = conversationMessages.flatMap((message) => {
		const text = extractMessageText(message.content);
		return text ? [{ role: message.role, text }] : [];
	});
	const firstMessage = messageTexts.find(({ role }) => role === "user")?.text ?? "(no messages)";
	const lastMessagePreview = messageTexts.at(-1)?.text.slice(0, LAST_MESSAGE_PREVIEW_LENGTH);
	// File mtime is a storage implementation detail: importing/resuming an existing
	// conversation may rewrite or recover the JSONL without any new user activity.
	// Use the already validated history projection so previews, branches and activity
	// time share one source of truth instead of inspecting opaque document entries here.
	const lastMessageActivityAt = conversationMessages.reduce<number | undefined>((latest, message) => {
		if (!Number.isFinite(message.timestamp) || message.timestamp <= 0) return latest;
		return Math.max(latest ?? 0, message.timestamp);
	}, undefined);
	const modifiedAt = lastMessageActivityAt ?? fileModifiedAt;
	return {
		id: header.sessionId,
		path: resolve(sessionPath),
		agentId: document.identity.agentId,
		cwd: document.identity.cwd ?? fallbackCwd,
		name: document.name,
		firstMessage,
		modifiedAt,
		lastMessagePreview,
		parentSessionPath: document.identity.parentSessionPath,
		parentEntryId: document.identity.parentEntryId,
	};
}

function extractMessageText(content: unknown): string | undefined {
	if (typeof content === "string") return normalizeMessageText(content);
	if (!Array.isArray(content)) return undefined;
	const text = content
		.flatMap((part) =>
			typeof part === "object" && part !== null && "text" in part && typeof part.text === "string"
				? [part.text]
				: [],
		)
		.join("\n");
	return normalizeMessageText(text);
}

function normalizeMessageText(text: string): string | undefined {
	const normalized = text.replace(/\s+/g, " ").trim();
	return normalized || undefined;
}

async function requireConversationHeader(sessionPath: string): Promise<ReadConversationFileHeader> {
	const header = await readConversationHeader(sessionPath);
	if (!header || !isCanonicalConversationPath(sessionPath, header.sessionId)) {
		throw new Error(`Unsupported native conversation file: ${sessionPath}`);
	}
	return header;
}

async function readConversationHeader(sessionPath: string): Promise<ReadConversationFileHeader | undefined> {
	let handle: FileHandle | undefined;
	try {
		handle = await open(sessionPath, "r");
		const buffer = Buffer.alloc(CONVERSATION_HEADER_READ_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		return parseConversationHeader(firstCompleteLine(buffer, bytesRead));
	} finally {
		await handle?.close();
	}
}

function readConversationHeaderSync(sessionPath: string): ReadConversationFileHeader | undefined {
	const descriptor = openSync(sessionPath, "r");
	try {
		const buffer = Buffer.alloc(CONVERSATION_HEADER_READ_BYTES);
		return parseConversationHeader(firstCompleteLine(buffer, readSync(descriptor, buffer, 0, buffer.length, 0)));
	} finally {
		closeSync(descriptor);
	}
}

function parseConversationHeader(text: string | undefined): ReadConversationFileHeader | undefined {
	const firstLine = text?.split(/\r?\n/, 1)[0];
	if (!firstLine) return undefined;
	try {
		const value: unknown = JSON.parse(firstLine);
		return isConversationFileHeader(value) ? value : undefined;
	} catch {
		return undefined;
	}
}

function firstCompleteLine(buffer: Buffer, bytesRead: number): string | undefined {
	const text = buffer.toString("utf8", 0, bytesRead);
	const newline = text.indexOf("\n");
	if (newline === -1 && bytesRead === buffer.length) return undefined;
	return (newline === -1 ? text : text.slice(0, newline)).replace(/\r$/, "") || undefined;
}

function isCanonicalConversationPath(sessionPath: string, sessionId: string): boolean {
	return (
		resolve(sessionPath) ===
		resolve(dirname(sessionPath), `${encodeConversationSessionId(sessionId)}${CONVERSATION_FILE_SUFFIX}`)
	);
}
