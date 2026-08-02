import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelRegistry } from "@vetta/coding-agent/host-services";
import { SessionManager } from "@vetta/coding-agent/legacy/session";
import {
	type RuntimeSession,
	RuntimeSessionBackendAssemblyAdapter,
	type RuntimeSessionCreateOptions,
} from "@vetta/coding-agent/runtime-host";
import { describe, expect, it } from "vitest";
import type { RuntimeSessionBackend, RuntimeSessionCreateRequest } from "../../src/index.js";

class CapturingLegacyBackend implements RuntimeSessionBackend<RuntimeSessionCreateOptions, RuntimeSession> {
	options: RuntimeSessionCreateOptions | undefined;

	async create(options: RuntimeSessionCreateOptions): Promise<RuntimeSession> {
		this.options = options;
		return {} as RuntimeSession;
	}
}

describe("legacy session creation composition", () => {
	it("maps a runtime request to legacy persistence, sandbox tools and shared models", async () => {
		const root = await mkdtemp(join(tmpdir(), "vetta-runtime-create-"));
		const sessionDir = join(root, "sessions");
		const registry = {} as ModelRegistry;
		const backend = new CapturingLegacyBackend();
		const adapter = new RuntimeSessionBackendAssemblyAdapter(backend, registry);
		const request: RuntimeSessionCreateRequest = {
			cwd: root,
			sessionDir,
			executionMode: "sandbox",
			enableSubagents: true,
			sandboxHostPath: process.execPath,
			linuxBubblewrapPath: process.execPath,
			macosSandboxExecPath: process.execPath,
			getSessionId: () => "session-1",
		};

		try {
			await adapter.createAssembly(request);

			expect(backend.options).toMatchObject({
				cwd: root,
				enableSubagents: true,
				modelRegistry: registry,
			});
			expect(backend.options?.sessionManager?.getCwd()).toBe(root);
			expect(backend.options?.sessionManager?.getSessionFile()).toContain(sessionDir);
			expect(backend.options?.customTools).toBeInstanceOf(Array);
			expect(backend.options?.customTools?.length).toBeGreaterThan(0);
		} finally {
			backend.options?.sessionManager?.close();
			await rm(root, { recursive: true, force: true });
		}
	});

	it("opens an existing session path instead of creating a new persistence object", async () => {
		const root = await mkdtemp(join(tmpdir(), "vetta-runtime-open-"));
		const sessionDir = join(root, "sessions");
		const original = SessionManager.create(root, sessionDir);
		const sessionPath = original.getSessionFile();
		original.close();
		if (!sessionPath) throw new Error("Expected a persisted session path");
		const backend = new CapturingLegacyBackend();
		const adapter = new RuntimeSessionBackendAssemblyAdapter(backend);

		try {
			await adapter.createAssembly({
				sessionPath,
				executionMode: "full-access",
				enableSubagents: false,
				getSessionId: () => "session-1",
			});

			expect(backend.options?.sessionManager?.getSessionFile()).toBe(sessionPath);
			expect(backend.options?.sessionManager?.getCwd()).toBe(root);
			expect(backend.options?.customTools).toBeUndefined();
		} finally {
			backend.options?.sessionManager?.close();
			await rm(root, { recursive: true, force: true });
		}
	});
});
