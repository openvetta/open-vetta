import { createHash, randomUUID } from "node:crypto";
import { ActionError, type JsonValue } from "./types.js";

const DEFAULT_ACTION_APPROVAL_TTL_MS = 2 * 60 * 1000;

interface ActionApprovalGrant {
	id: string;
	actionId: string;
	inputFingerprint?: string;
	sessionId: string;
	requestId: string;
	createdAt: number;
	expiresAt: number;
}

export interface CreateActionApprovalGrantOptions {
	actionId: string;
	input?: JsonValue;
	sessionId: string;
	requestId: string;
	ttlMs?: number;
}

export interface ConsumeActionApprovalGrantOptions {
	actionId: string;
	input: JsonValue;
}

function canonicalJson(value: JsonValue): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
	return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`).join(",")}}`;
}

function fingerprintInput(input: JsonValue): string {
	return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

export class ActionApprovalGrantStore {
	private readonly grants = new Map<string, ActionApprovalGrant>();

	createGrant(options: CreateActionApprovalGrantOptions): string {
		this.clearExpired();
		const inputFingerprint = options.input !== undefined ? fingerprintInput(options.input) : undefined;
		this.deleteGrantsByScope(options.actionId, inputFingerprint);
		const id = randomUUID();
		const now = Date.now();
		const ttlMs = options.ttlMs ?? DEFAULT_ACTION_APPROVAL_TTL_MS;
		this.grants.set(id, {
			id,
			actionId: options.actionId,
			...(inputFingerprint !== undefined ? { inputFingerprint } : {}),
			sessionId: options.sessionId,
			requestId: options.requestId,
			createdAt: now,
			expiresAt: now + ttlMs,
		});
		return id;
	}

	consumeGrant(options: ConsumeActionApprovalGrantOptions): void {
		this.clearExpired();
		const inputFingerprint = fingerprintInput(options.input);
		const deleted = this.deleteGrantsByScope(options.actionId, inputFingerprint);
		const deletedActionOnly = this.deleteGrantsByScope(options.actionId, undefined);
		if (deleted + deletedActionOnly > 0) {
			return;
		}
		throw new ActionError(
			"ACTION_APPROVAL_REQUIRED",
			"This Vetta action requires a recent user approval from the Vetta App UI.",
			{ actionId: options.actionId },
		);
	}

	revokeBySession(sessionId: string): number {
		let revoked = 0;
		for (const grant of this.grants.values()) {
			if (grant.sessionId !== sessionId) continue;
			this.grants.delete(grant.id);
			revoked += 1;
		}
		return revoked;
	}

	clearExpired(now = Date.now()): number {
		let cleared = 0;
		for (const grant of this.grants.values()) {
			if (grant.expiresAt > now) continue;
			this.grants.delete(grant.id);
			cleared += 1;
		}
		return cleared;
	}

	clear(): void {
		this.grants.clear();
	}

	private deleteGrantsByScope(actionId: string, inputFingerprint: string | undefined): number {
		let deleted = 0;
		for (const grant of this.grants.values()) {
			if (grant.actionId !== actionId || grant.inputFingerprint !== inputFingerprint) continue;
			this.grants.delete(grant.id);
			deleted += 1;
		}
		return deleted;
	}
}

const actionApprovalGrantStore = new ActionApprovalGrantStore();

export function getActionApprovalGrantStore(): ActionApprovalGrantStore {
	return actionApprovalGrantStore;
}
