import { randomUUID } from "node:crypto";
import { type CapabilityAccessHandle, type CapabilityAccessSessionFactory, createCapabilityGrant } from "../access.js";
import { CAPABILITY_ERROR_CODES, CapabilityError } from "../contracts.js";
import { DOMAIN_PROJECT_CAPABILITIES, type ProjectEntry, type ProjectListResult } from "../domain.js";
import {
	type FilesystemEntry,
	type FilesystemFileRef,
	type FilesystemReadFileResult,
	type FilesystemStatResult,
	FOUNDATION_FILESYSTEM_CAPABILITIES,
} from "../foundation.js";

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const PLUGIN_CAPABILITY_PERMISSIONS = {
	FILESYSTEM_READ: "fs.read",
	FILESYSTEM_WRITE: "fs.write",
} as const;

export interface PluginCapabilityAdapterOptions {
	readonly isOfficialPlugin: (pluginId: string) => boolean;
	readonly resolvePermissions: (pluginId: string) => readonly string[];
}

interface PluginCapabilitySession {
	readonly access: CapabilityAccessHandle;
	readonly pluginId: string;
}

interface PluginCapabilityRequirement {
	readonly official?: boolean;
	readonly permission?: string;
}

export class PluginCapabilityAdapter {
	private readonly sessionIdByPlugin = new Map<string, string>();
	private readonly sessions = new Map<string, PluginCapabilitySession>();

	constructor(
		private readonly access: CapabilityAccessSessionFactory,
		private readonly options: PluginCapabilityAdapterOptions,
	) {}

	openSession(pluginId: string): string {
		if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error(`Invalid plugin id: ${pluginId}`);
		const permissions = new Set(this.options.resolvePermissions(pluginId));
		const official = this.options.isOfficialPlugin(pluginId);
		const previousSessionId = this.sessionIdByPlugin.get(pluginId);
		if (previousSessionId) this.closeSession(previousSessionId);

		const sessionId = randomUUID();
		const grants = [
			...(permissions.has(PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ)
				? [
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.READ_DIRECTORY),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.READ_FILE),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.STAT),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.LIST_FILES_RECURSIVE),
					]
				: []),
			...(permissions.has(PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE)
				? [
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.WRITE_FILE),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.RENAME),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.DELETE),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.MOVE),
						createCapabilityGrant(FOUNDATION_FILESYSTEM_CAPABILITIES.CREATE_DIRECTORY),
					]
				: []),
			...(official
				? [
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.LIST),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.CREATE),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.OPEN),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.RENAME),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.ARCHIVE),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.UNARCHIVE),
						createCapabilityGrant(DOMAIN_PROJECT_CAPABILITIES.REMOVE),
					]
				: []),
		];
		const access = this.access.createSession({
			subject: {
				id: `system-adapter:plugin:${pluginId}`,
				sessionId,
			},
			grants,
		});
		this.sessions.set(sessionId, { access, pluginId });
		this.sessionIdByPlugin.set(pluginId, sessionId);
		return sessionId;
	}

	closeSession(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		session.access.revoke();
		this.sessions.delete(sessionId);
		if (this.sessionIdByPlugin.get(session.pluginId) === sessionId) {
			this.sessionIdByPlugin.delete(session.pluginId);
		}
	}

	dispose(): void {
		for (const sessionId of [...this.sessions.keys()]) this.closeSession(sessionId);
	}

	readDirectory(sessionId: string, path: string): Promise<FilesystemEntry[]> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.READ_DIRECTORY,
			{ path },
		);
	}

	readFile(sessionId: string, path: string): Promise<FilesystemReadFileResult> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.READ_FILE,
			{ path },
		);
	}

	writeFile(sessionId: string, path: string, content: string, encoding?: "utf8" | "base64"): Promise<undefined> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.WRITE_FILE,
			{ path, content, encoding },
		);
	}

	stat(sessionId: string, path: string): Promise<FilesystemStatResult | null> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.STAT,
			{ path },
		);
	}

	rename(sessionId: string, oldPath: string, newPath: string): Promise<undefined> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.RENAME,
			{ oldPath, newPath },
		);
	}

	delete(sessionId: string, path: string): Promise<undefined> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.DELETE,
			{ path },
		);
	}

	move(sessionId: string, sourcePath: string, destinationDirectory: string): Promise<undefined> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.MOVE,
			{ sourcePath, destinationDirectory },
		);
	}

	createDirectory(sessionId: string, path: string): Promise<undefined> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.CREATE_DIRECTORY,
			{ path },
		);
	}

	listFilesRecursive(sessionId: string, path: string): Promise<FilesystemFileRef[]> {
		return this.client(sessionId, { permission: PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ }).invoke(
			FOUNDATION_FILESYSTEM_CAPABILITIES.LIST_FILES_RECURSIVE,
			{ path },
		);
	}

	listProjects(sessionId: string): Promise<ProjectListResult> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.LIST, {});
	}

	createProject(sessionId: string, name: string, path?: string): Promise<ProjectEntry> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.CREATE, { name, path });
	}

	openProject(sessionId: string, path: string, name?: string): Promise<ProjectEntry> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.OPEN, { path, name });
	}

	renameProject(sessionId: string, path: string, name: string): Promise<ProjectEntry> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.RENAME, { path, name });
	}

	archiveProject(sessionId: string, path: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.ARCHIVE, { path });
	}

	unarchiveProject(sessionId: string, path: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.UNARCHIVE, { path });
	}

	removeProject(sessionId: string, path: string): Promise<undefined> {
		return this.client(sessionId, { official: true }).invoke(DOMAIN_PROJECT_CAPABILITIES.REMOVE, { path });
	}

	private client(sessionId: string, requirement: PluginCapabilityRequirement): CapabilityAccessHandle["client"] {
		const session = this.sessions.get(sessionId);
		if (!session || session.access.isRevoked()) {
			throw new CapabilityError(CAPABILITY_ERROR_CODES.SESSION_REVOKED, "Plugin capability session is not active");
		}
		if (requirement.official && !this.options.isOfficialPlugin(session.pluginId)) {
			throw new CapabilityError(CAPABILITY_ERROR_CODES.ACCESS_DENIED, "Plugin official capability access denied");
		}
		if (
			requirement.permission !== undefined &&
			!this.options.resolvePermissions(session.pluginId).includes(requirement.permission)
		) {
			throw new CapabilityError(
				CAPABILITY_ERROR_CODES.ACCESS_DENIED,
				`Plugin capability permission denied: ${requirement.permission}`,
			);
		}
		return session.access.client;
	}
}
