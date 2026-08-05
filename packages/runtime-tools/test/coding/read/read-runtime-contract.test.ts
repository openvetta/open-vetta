import { describe, expect, it } from "vitest";
import { createReadTool, createReadToolRegistration } from "../../../src/coding/index.js";
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

describe("read runtime boundaries", () => {
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
