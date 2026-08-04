import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { hostname } from "node:os";

export interface LegacySessionFormatLeaseHolder {
	readonly pid: number;
	readonly hostname: string;
	readonly openedAt: string;
}

export interface LegacySessionFormatLease {
	readonly lockPath: string;
	release(): void;
}

export type LegacySessionFormatLeaseResult =
	| { readonly kind: "acquired"; readonly lease: LegacySessionFormatLease }
	| {
			readonly kind: "locked";
			readonly lockPath: string;
			readonly holder: LegacySessionFormatLeaseHolder;
	  };

/** Acquire the Legacy JSONL advisory lock without creating an AgentSession. */
export function acquireLegacySessionFormatLease(sessionPath: string): LegacySessionFormatLeaseResult {
	const lockPath = `${sessionPath}.lock`;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			writeLease(lockPath);
			let released = false;
			return {
				kind: "acquired",
				lease: {
					lockPath,
					release() {
						if (released) return;
						released = true;
						try {
							unlinkSync(lockPath);
						} catch {
							// Best effort: another process may already have removed the lease.
						}
					},
				},
			};
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			const holder = readLeaseHolder(lockPath);
			if (holder && isProcessAlive(holder)) return { kind: "locked", lockPath, holder };
			try {
				unlinkSync(lockPath);
			} catch {
				// A concurrent cleanup is harmless; the next exclusive create decides ownership.
			}
		}
	}
	throw new Error(`Failed to acquire Legacy session lease at ${lockPath} after retry`);
}

function writeLease(lockPath: string): void {
	const descriptor = openSync(lockPath, "wx");
	try {
		const holder: LegacySessionFormatLeaseHolder = {
			pid: process.pid,
			hostname: hostname(),
			openedAt: new Date().toISOString(),
		};
		writeSync(descriptor, JSON.stringify(holder));
	} finally {
		closeSync(descriptor);
	}
}

function readLeaseHolder(lockPath: string): LegacySessionFormatLeaseHolder | undefined {
	try {
		const value: unknown = JSON.parse(readFileSync(lockPath, "utf8"));
		if (typeof value !== "object" || value === null) return undefined;
		const pid = Reflect.get(value, "pid");
		const lockHostname = Reflect.get(value, "hostname");
		const openedAt = Reflect.get(value, "openedAt");
		if (typeof pid !== "number" || typeof lockHostname !== "string" || typeof openedAt !== "string") {
			return undefined;
		}
		return { pid, hostname: lockHostname, openedAt };
	} catch {
		return undefined;
	}
}

function isProcessAlive(holder: LegacySessionFormatLeaseHolder): boolean {
	if (holder.hostname !== hostname()) return true;
	try {
		process.kill(holder.pid, 0);
		return true;
	} catch {
		return false;
	}
}
