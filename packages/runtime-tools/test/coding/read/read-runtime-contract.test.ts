import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_SCENARIOS, resolveActiveToolNames } from "../../../../coding-agent/src/core/session/tool-scope.js";
import { createReadTool as createLegacyReadTool } from "../../../../coding-agent/src/core/tools/read/index.js";
import { createReadTool, createReadToolRegistration, selectCodingToolsForScope } from "../../../src/coding/index.js";
import type { ReadBehaviorSubject, ReadBehaviorSubjectOptions } from "./read-behavior-contract.js";
import { defineReadBehaviorContract } from "./read-behavior-contract.js";

function createRuntimeSubject(cwd: string, options?: ReadBehaviorSubjectOptions): ReadBehaviorSubject {
	const registration = createReadToolRegistration(cwd, options);
	return {
		definition: {
			name: registration.tool.name,
			label: registration.tool.label,
			description: registration.tool.description,
			schema: registration.tool.inputSchema,
			scopeUse: registration.scopeUse,
			category: registration.category,
		},
		execute(input, signal = new AbortController().signal) {
			return registration.tool.execute({
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "runtime-read-contract",
				input,
				signal,
			});
		},
	};
}

defineReadBehaviorContract("runtime", createRuntimeSubject);

describe("read legacy differential", () => {
	const temporaryDirectories: string[] = [];

	afterEach(() => {
		for (const directory of temporaryDirectories.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("keeps the complete definition and registration metadata unchanged", () => {
		const legacy = createLegacyReadTool(process.cwd());
		const runtime = createReadToolRegistration(process.cwd());

		expect({
			name: runtime.tool.name,
			label: runtime.tool.label,
			description: runtime.tool.description,
			schema: runtime.tool.inputSchema,
			scopeUse: runtime.scopeUse,
			category: runtime.category,
		}).toEqual({
			name: legacy.name,
			label: legacy.label,
			description: legacy.description,
			schema: legacy.parameters,
			scopeUse: legacy.scope_use,
			category: legacy.category,
		});

		for (const scenario of ALL_SCENARIOS) {
			const legacyNames = resolveActiveToolNames(scenario, [legacy], new Set());
			const runtimeNames = selectCodingToolsForScope([runtime], scenario).map(({ name }) => name);
			expect(runtimeNames).toEqual(legacyNames);
		}
	});

	it("returns byte-for-byte equal anchored text, truncation details, and binary hints", async () => {
		const directory = mkdtempSync(join(tmpdir(), "runtime-tools-read-differential-"));
		temporaryDirectories.push(directory);
		const textPath = join(directory, "content.txt");
		const binaryPath = join(directory, "content.docx");
		writeFileSync(textPath, Array.from({ length: 2001 }, (_, index) => `line ${index + 1}`).join("\n"));
		writeFileSync(binaryPath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]));
		const legacy = createLegacyReadTool(directory);
		const runtime = createReadTool(directory);

		const legacyText = await legacy.execute("legacy-text", { path: textPath });
		const runtimeText = await runtime.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "runtime-text",
			input: { path: textPath },
			signal: new AbortController().signal,
		});
		expect(runtimeText).toEqual(legacyText);

		const legacyBinary = await legacy.execute("legacy-binary", { path: binaryPath });
		const runtimeBinary = await runtime.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "runtime-binary",
			input: { path: binaryPath },
			signal: new AbortController().signal,
		});
		expect(runtimeBinary).toEqual(legacyBinary);
	});

	it("keeps the image processor behind an injectable read boundary", async () => {
		let resizeCount = 0;
		const tool = createReadTool(process.cwd(), {
			operations: {
				async access() {},
				async detectImageMimeType() {
					return "image/png";
				},
				async readFile() {
					return Buffer.from("image");
				},
			},
			imageProcessor: {
				async resize() {
					resizeCount += 1;
					return {
						data: Buffer.from("processed").toString("base64"),
						mimeType: "image/png",
						originalWidth: 10,
						originalHeight: 10,
						width: 10,
						height: 10,
						wasResized: false,
					};
				},
			},
		});

		const result = await tool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "runtime-image",
			input: { path: "remote-image" },
			signal: new AbortController().signal,
		});

		expect(resizeCount).toBe(1);
		expect(result.content.some((item) => item.type === "image")).toBe(true);
	});
});
