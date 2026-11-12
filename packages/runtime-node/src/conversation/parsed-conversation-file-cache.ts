import type { Stats } from "node:fs";
import { appendFile, readFile, stat } from "node:fs/promises";
import type { ConversationDocument } from "@vetta/runtime-core/conversation";
import {
	type ConversationDocumentOperationRecord,
	type ConversationEventRecord,
	isConversationDocumentOperationRecord,
	type NormalizedReadConversationEventRecord,
	readConversationEventRecord,
} from "@vetta/runtime-storage/conversation";
import {
	documentFromFile,
	extendDocumentWithRecords,
	type ParsedConversationFile,
	parseConversationFile,
	serializeConversationLine,
} from "./conversation-file-codec.js";

export type AppendableConversationRecord =
	| ConversationEventRecord
	| NormalizedReadConversationEventRecord
	| ConversationDocumentOperationRecord;

interface ConversationFileIdentity {
	readonly ino: number;
	readonly size: number;
	readonly mtimeMs: number;
}

/** 一份会话文件的解析结果；文档投影按需计算并随状态缓存。 */
export interface ParsedConversationState {
	readonly file: ParsedConversationFile;
	document(): ConversationDocument;
}

interface CacheEntry extends ParsedConversationState {
	readonly identity: ConversationFileIdentity;
	/** 已经算过的文档投影；尚未算过时为 undefined，不会触发整份重放。 */
	projectedDocument(): ConversationDocument | undefined;
}

const DEFAULT_MAX_ENTRIES = 16;

/**
 * 会话文件的解析缓存。
 *
 * 整份解析要逐条做 Schema 校验并重放文档，长会话一次几十到几百毫秒；而一轮里每追加一条事件都要先读一遍，
 * 这些开销都落在 Electron 主进程上。文件身份（inode、大小、修改时间）不变时直接复用上次的结果；
 * 其他实例或进程写入（同样持有文件锁）会改变大小或修改时间，从而回退到整份重读。
 * 调用方须在持有该会话文件锁时调用 {@link append}，保证追加的字节紧接在缓存内容之后。
 */
export class ParsedConversationFileCache {
	private readonly entries = new Map<string, CacheEntry>();

	constructor(private readonly maxEntries = DEFAULT_MAX_ENTRIES) {}

	async read(path: string, sessionId: string): Promise<ParsedConversationState> {
		const before = fileIdentity(await stat(path));
		const cached = this.entries.get(sessionId);
		if (cached && sameIdentity(cached.identity, before)) {
			this.touch(sessionId, cached);
			return cached;
		}
		this.entries.delete(sessionId);

		const text = await readFile(path, "utf8");
		const file = parseConversationFile(text, sessionId);
		const after = fileIdentity(await stat(path));
		const entry = createEntry(sessionId, after, file);
		// 读的过程中文件被改写时，内容与身份对不上，不缓存，下次重新读。
		if (sameIdentity(before, after) && Buffer.byteLength(text, "utf8") === after.size) {
			this.touch(sessionId, entry);
		}
		return entry;
	}

	/** 追加记录，并把同样的记录并入缓存；已算出的文档投影只重放新记录。 */
	async append(
		path: string,
		sessionId: string,
		previous: ParsedConversationState,
		records: readonly AppendableConversationRecord[],
	): Promise<void> {
		const lines = records.map(serializeConversationLine);
		const text = lines.join("");
		const base = this.entries.get(sessionId);
		this.entries.delete(sessionId);
		await appendFile(path, text, "utf8");
		if (!base || base !== previous) return;

		let identity: ConversationFileIdentity;
		try {
			identity = fileIdentity(await stat(path));
		} catch {
			return;
		}
		if (
			identity.ino !== base.identity.ino ||
			identity.size !== base.identity.size + Buffer.byteLength(text, "utf8")
		) {
			return;
		}
		// 经 JSON 往返再按读盘路径归一化，保证缓存内容与重新读盘得到的结果一致。
		const normalized = lines.map((line) => normalizeAppendedRecord(JSON.parse(line) as unknown));
		const appended = normalized.filter((record) => record !== undefined);
		if (appended.length !== normalized.length) return;
		const file: ParsedConversationFile = {
			...base.file,
			records: [...base.file.records, ...appended],
			eventRecords: [
				...base.file.eventRecords,
				...appended.filter(
					(record): record is NormalizedReadConversationEventRecord => record.recordType === "conversation.event",
				),
			],
		};
		// 记录已经落盘；增量重放失败时只放弃缓存，让下一次读取走整份解析并按原有规则报错。
		let document: ConversationDocument | undefined;
		const projected = base.projectedDocument();
		if (projected) {
			try {
				document = extendDocumentWithRecords(sessionId, projected, appended);
			} catch {
				return;
			}
		}
		this.touch(sessionId, createEntry(sessionId, identity, file, document));
	}

	/** 文件被本缓存之外的路径改写时调用。 */
	forget(sessionId: string): void {
		this.entries.delete(sessionId);
	}

	private touch(sessionId: string, entry: CacheEntry): void {
		this.entries.delete(sessionId);
		this.entries.set(sessionId, entry);
		while (this.entries.size > this.maxEntries) {
			const oldest = this.entries.keys().next().value as string;
			this.entries.delete(oldest);
		}
	}
}

function createEntry(
	sessionId: string,
	identity: ConversationFileIdentity,
	file: ParsedConversationFile,
	document?: ConversationDocument,
): CacheEntry {
	let projected = document;
	return {
		identity,
		file,
		document: () => {
			projected ??= documentFromFile(sessionId, file);
			return projected;
		},
		projectedDocument: () => projected,
	};
}

/** 不符合读盘 Schema 时返回 undefined，调用方放弃缓存，让下一次读取走整份解析并按原有规则报错。 */
function normalizeAppendedRecord(
	value: unknown,
): NormalizedReadConversationEventRecord | ConversationDocumentOperationRecord | undefined {
	if (isConversationDocumentOperationRecord(value)) return value;
	return readConversationEventRecord(value);
}

function fileIdentity(stats: Stats): ConversationFileIdentity {
	return { ino: stats.ino, size: stats.size, mtimeMs: stats.mtimeMs };
}

function sameIdentity(left: ConversationFileIdentity, right: ConversationFileIdentity): boolean {
	return left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs;
}
