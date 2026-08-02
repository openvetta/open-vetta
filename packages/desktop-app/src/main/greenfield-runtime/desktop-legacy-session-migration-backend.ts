import { dirname, resolve } from "node:path";
import {
	type CodingAgentLegacySessionMigrationIncompatible,
	migrateCodingAgentLegacySession,
} from "@vetta/coding-agent/runtime-host";
import type {
	RuntimeHostSessionAssembly,
	RuntimeHostSessionBackend,
	RuntimeSessionCreateRequest,
} from "@vetta/runtime-core";

export class DesktopLegacySessionCompatibilityError extends Error {
	constructor(readonly incompatibility: CodingAgentLegacySessionMigrationIncompatible) {
		super(`${incompatibility.errorCode}: Legacy session cannot be resumed safely`);
		this.name = "DesktopLegacySessionCompatibilityError";
	}
}

/** Migrates supported Legacy sessions before delegating execution to the Greenfield backend. */
export class DesktopLegacySessionMigrationBackend implements RuntimeHostSessionBackend {
	constructor(private readonly greenfieldBackend: RuntimeHostSessionBackend) {}

	async createAssembly(request: RuntimeSessionCreateRequest): Promise<RuntimeHostSessionAssembly> {
		const sourcePath = request.sessionPath?.trim();
		if (!sourcePath) throw new Error("Legacy session migration requires a source path");
		const targetRootDir = resolve(request.sessionDir ?? dirname(sourcePath));
		const migration = await migrateCodingAgentLegacySession(sourcePath, targetRootDir);
		if (migration.kind === "session-incompatible") {
			throw new DesktopLegacySessionCompatibilityError(migration);
		}
		return this.greenfieldBackend.createAssembly({
			...request,
			sessionPath: migration.targetPath,
			sessionDir: targetRootDir,
		});
	}
}
