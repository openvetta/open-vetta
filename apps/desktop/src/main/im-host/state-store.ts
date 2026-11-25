import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { atomicWriteJSON } from "@vetta/toolkit/atomic-write";
import { type ImTransportSelector, isImTransportSelector } from "./channels.js";
import type { DeliveryChatEvent, SessionStateEntry } from "./host-protocol.js";

/**
 * Persistent IM routing table. Mirror of the in-memory MemoryStore inside
 * the sidecar. The sidecar streams state_patch events on every change; we
 * apply them here and atomically rewrite the file. On sidecar (re)start we
 * read this file and replay the snapshot via the init frame.
 *
 * Path: ~/.vetta/desktop-app/im-state.json
 *
 * Schema v3: keyed by (userId, chatId). v3 supersedes v2 in everything but
 * version number — ADR-0005 split im-gateway's cwd from the desktop "对话"
 * cwd, which makes every v2 entry's `sessionPath` (pointing into the old
 * shared cwd) a dead reference. Pre-v3 files are dropped on load so each
 * chat starts a brand-new session in the new IM cwd on its next message.
 */
export interface ImStateFile {
	version: 3;
	sessions: SessionStateEntry[];
	/**
	 * Chat that receives automation results, per channel. Optional so files
	 * written before it existed still load as v3. Keyed by channel because a
	 * chat id only means something on the platform that issued it.
	 */
	deliveryChats?: Partial<Record<ImTransportSelector, AutomationDeliveryChat>>;
}

export interface AutomationDeliveryChat {
	chatId: string;
	userId: string;
	/** Chosen with /notify rather than picked from the first private chat. */
	explicit: boolean;
	/** ISO time the target was set. */
	setAt: string;
}

const STATE_VERSION = 3;
const DEFAULT_PATH = join(getVettaHomePath(), "desktop-app", "im-state.json");

export function defaultImStatePath(): string {
	return DEFAULT_PATH;
}

export function loadImState(filePath = DEFAULT_PATH): ImStateFile {
	if (!existsSync(filePath)) {
		return { version: STATE_VERSION, sessions: [] };
	}
	try {
		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw) as { version?: number; sessions?: unknown; deliveryChats?: unknown };
		if (parsed.version !== STATE_VERSION) {
			// v1 用 projectId（ADR-0004），v2 用旧的共享 cwd 路径（ADR-0005）。两者都
			// 不能向 v3 迁移——sessionPath 已经是死引用，直接重置让每个 chat 重起。
			return { version: STATE_VERSION, sessions: [] };
		}
		return {
			version: STATE_VERSION,
			sessions: Array.isArray(parsed.sessions) ? (parsed.sessions as SessionStateEntry[]) : [],
			deliveryChats: parseDeliveryChats(parsed.deliveryChats),
		};
	} catch {
		return { version: STATE_VERSION, sessions: [] };
	}
}

export function saveImState(state: ImStateFile, filePath = DEFAULT_PATH): void {
	atomicWriteJSON(filePath, state);
}

/**
 * Apply a single state_patch and return the new state. Empty sessionPath
 * means "delete this entry"; otherwise upsert.
 */
export function applyStatePatch(state: ImStateFile, patch: SessionStateEntry): ImStateFile {
	const sessions = state.sessions.filter((s) => !(s.userId === patch.userId && s.chatId === patch.chatId));
	if (patch.sessionPath) {
		sessions.push(patch);
	}
	return { ...state, version: STATE_VERSION, sessions };
}

/**
 * Apply a delivery_chat proposal for `transport`. An explicit proposal
 * (/notify) always replaces the target; an implicit one (a private chat)
 * only fills an empty slot, so later messages from someone else never move
 * it. Returns the same object when nothing changed.
 */
export function applyDeliveryChat(
	state: ImStateFile,
	transport: ImTransportSelector,
	proposal: Pick<DeliveryChatEvent, "chatId" | "userId" | "explicit">,
	now: Date = new Date(),
): ImStateFile {
	if (!proposal.chatId) return state;
	const current = state.deliveryChats?.[transport];
	if (current && !proposal.explicit) return state;
	if (current && current.chatId === proposal.chatId && current.explicit === proposal.explicit) return state;
	const next: AutomationDeliveryChat = {
		chatId: proposal.chatId,
		userId: proposal.userId,
		explicit: proposal.explicit,
		setAt: now.toISOString(),
	};
	return { ...state, deliveryChats: { ...state.deliveryChats, [transport]: next } };
}

/** Forget `transport`'s delivery target; the next private chat fills it again. */
export function clearDeliveryChat(state: ImStateFile, transport: ImTransportSelector): ImStateFile {
	if (!state.deliveryChats?.[transport]) return state;
	const { [transport]: _cleared, ...rest } = state.deliveryChats;
	return { ...state, deliveryChats: rest };
}

function parseDeliveryChats(value: unknown): ImStateFile["deliveryChats"] {
	if (!value || typeof value !== "object") return undefined;
	const out: Partial<Record<ImTransportSelector, AutomationDeliveryChat>> = {};
	for (const [transport, entry] of Object.entries(value as Record<string, unknown>)) {
		if (!isImTransportSelector(transport) || !entry || typeof entry !== "object") continue;
		const chat = entry as Partial<AutomationDeliveryChat>;
		if (typeof chat.chatId !== "string" || chat.chatId === "") continue;
		out[transport] = {
			chatId: chat.chatId,
			userId: typeof chat.userId === "string" ? chat.userId : "",
			explicit: chat.explicit === true,
			setAt: typeof chat.setAt === "string" ? chat.setAt : "",
		};
	}
	return Object.keys(out).length > 0 ? out : undefined;
}
