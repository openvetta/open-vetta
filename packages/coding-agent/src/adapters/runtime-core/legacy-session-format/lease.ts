import {
	acquireSessionLock,
	SessionLockError,
	type SessionLockHandle,
	type SessionLockInfo,
} from "../../../core/session-lock.js";

export type LegacySessionFormatLeaseResult =
	| { readonly kind: "acquired"; readonly lease: SessionLockHandle }
	| { readonly kind: "locked"; readonly lockPath: string; readonly holder: SessionLockInfo };

/** Acquire the existing Legacy JSONL advisory lock without creating an AgentSession. */
export function acquireLegacySessionFormatLease(sessionPath: string): LegacySessionFormatLeaseResult {
	try {
		return { kind: "acquired", lease: acquireSessionLock(sessionPath) };
	} catch (error) {
		if (error instanceof SessionLockError) {
			return { kind: "locked", lockPath: error.lockPath, holder: error.holder };
		}
		throw error;
	}
}
