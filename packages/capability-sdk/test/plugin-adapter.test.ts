import { describe, expect, it } from "vitest";
import type {
	AuthorizedCapabilityClient,
	CapabilityAccessHandle,
	CapabilityAccessSessionFactory,
	CapabilityAccessSessionOptions,
	CapabilityInvokeOptions,
} from "../src/access.js";
import { PLUGIN_CAPABILITY_PERMISSIONS, PluginCapabilityAdapter } from "../src/adapters/plugin.js";
import { CAPABILITY_ERROR_CODES, type CapabilityId, type CapabilityToken } from "../src/contracts.js";
import { FOUNDATION_FILESYSTEM_CAPABILITIES } from "../src/foundation.js";

class RecordingAccessFactory implements CapabilityAccessSessionFactory {
	readonly sessions: CapabilityAccessSessionOptions[] = [];

	createSession(options: CapabilityAccessSessionOptions): CapabilityAccessHandle {
		this.sessions.push(options);
		let revoked = false;
		const grants = new Set(options.grants.map((grant) => grant.capabilityId));
		const client: AuthorizedCapabilityClient = {
			invoke: async <Input, Output>(
				capability: CapabilityToken<Input, Output>,
				_input: Input,
				_options?: CapabilityInvokeOptions,
			): Promise<Output> => {
				if (revoked) throw new Error("revoked");
				if (!grants.has(capability.id)) throw new Error(`missing grant: ${capability.id}`);
				return capability.parseOutput(outputFor(capability.id));
			},
		};
		return {
			client,
			subject: options.subject,
			isRevoked: () => revoked,
			revoke: () => {
				revoked = true;
			},
		};
	}
}

function outputFor(capabilityId: CapabilityId): unknown {
	if (capabilityId === FOUNDATION_FILESYSTEM_CAPABILITIES.READ_DIRECTORY.id) return [];
	if (capabilityId === FOUNDATION_FILESYSTEM_CAPABILITIES.READ_FILE.id) {
		return { content: "data", encoding: "utf8" };
	}
	if (capabilityId === FOUNDATION_FILESYSTEM_CAPABILITIES.STAT.id) return null;
	if (capabilityId === FOUNDATION_FILESYSTEM_CAPABILITIES.LIST_FILES_RECURSIVE.id) return [];
	return undefined;
}

describe("PluginCapabilityAdapter", () => {
	it("maps plugin permissions to exact filesystem capability grants", async () => {
		const access = new RecordingAccessFactory();
		const adapter = new PluginCapabilityAdapter(access, {
			resolvePermissions: () => [PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ],
		});

		const sessionId = adapter.openSession("reader");
		const grantedIds = access.sessions[0]?.grants.map((grant) => grant.capabilityId);

		expect(grantedIds).toEqual([
			FOUNDATION_FILESYSTEM_CAPABILITIES.READ_DIRECTORY.id,
			FOUNDATION_FILESYSTEM_CAPABILITIES.READ_FILE.id,
			FOUNDATION_FILESYSTEM_CAPABILITIES.STAT.id,
			FOUNDATION_FILESYSTEM_CAPABILITIES.LIST_FILES_RECURSIVE.id,
		]);
		await expect(adapter.readFile(sessionId, "C:/project/file.txt")).resolves.toEqual({
			content: "data",
			encoding: "utf8",
		});
		expect(() => adapter.writeFile(sessionId, "C:/project/file.txt", "data")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
	});

	it("checks current permissions on every invocation", () => {
		const access = new RecordingAccessFactory();
		let permissions: readonly string[] = [PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ];
		const adapter = new PluginCapabilityAdapter(access, {
			resolvePermissions: () => permissions,
		});
		const sessionId = adapter.openSession("revocable");

		permissions = [];

		expect(() => adapter.readFile(sessionId, "C:/project/file.txt")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.ACCESS_DENIED }),
		);
	});

	it("revokes the previous session when the same plugin is opened again", () => {
		const access = new RecordingAccessFactory();
		const adapter = new PluginCapabilityAdapter(access, {
			resolvePermissions: () => [PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_READ],
		});
		const firstSessionId = adapter.openSession("reloadable");
		const secondSessionId = adapter.openSession("reloadable");

		expect(() => adapter.readFile(firstSessionId, "C:/project/file.txt")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.SESSION_REVOKED }),
		);
		expect(() => adapter.readFile(secondSessionId, "C:/project/file.txt")).not.toThrow();

		adapter.closeSession(secondSessionId);
		expect(() => adapter.readFile(secondSessionId, "C:/project/file.txt")).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.SESSION_REVOKED }),
		);
	});

	it("allows empty file content", async () => {
		const access = new RecordingAccessFactory();
		const adapter = new PluginCapabilityAdapter(access, {
			resolvePermissions: () => [PLUGIN_CAPABILITY_PERMISSIONS.FILESYSTEM_WRITE],
		});
		const sessionId = adapter.openSession("writer");

		await expect(adapter.writeFile(sessionId, "C:/project/empty.txt", "")).resolves.toBeUndefined();
	});
});
