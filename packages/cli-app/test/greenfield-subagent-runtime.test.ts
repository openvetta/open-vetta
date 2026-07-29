import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	EventStream,
	type Message,
	type Model,
} from "@vetta/ai";
import type { CodingAgentModelRegistrySource } from "@vetta/coding-agent/runtime-host/greenfield";
import { assessRuntimeHostSessionAssembly } from "@vetta/runtime-core";
import { afterEach, describe, expect, it } from "vitest";
import {
	createGreenfieldRuntimeComposition,
	type GreenfieldRuntimeComposition,
} from "../src/greenfield-runtime-composition.js";

describe("Greenfield Subagent Runtime composition", () => {
	const directories: string[] = [];
	const compositions: GreenfieldRuntimeComposition[] = [];

	afterEach(async () => {
		for (const composition of compositions.splice(0).reverse()) {
			await composition.dispose();
		}
		for (const directory of directories.splice(0).reverse()) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("keeps the seven control tools compatible and closes the child notification loop", async () => {
		const conversationDir = await temporaryDirectory("greenfield-subagents-conversations-");
		const workspace = await temporaryDirectory("greenfield-subagents-workspace-");
		const rootToolSurfaces: string[][] = [];
		const childToolSurfaces: string[][] = [];
		const rootInputs: string[][] = [];
		let rootCall = 0;
		const composition = await createGreenfieldRuntimeComposition({
			conversationDir,
			cwd: workspace,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			activation: { mode: "explicit", toolNames: ["read"] },
			streamFn: (_model, context, options) => {
				const toolNames = (context.tools ?? []).map(({ name }) => name);
				const inputTexts = context.messages.map(messageText);
				if (options?.sessionId !== "root-session") {
					childToolSurfaces.push(toolNames);
					return new RecordedAssistantStream(assistantMessage([{ type: "text", text: "child completed" }]));
				}
				rootToolSurfaces.push(toolNames);
				rootInputs.push(inputTexts);
				rootCall += 1;
				if (rootCall === 1) {
					return new RecordedAssistantStream(
						assistantMessage(
							[
								{
									type: "toolCall",
									id: "spawn-1",
									name: "spawn_agent",
									arguments: {
										task_name: "inspect_repo",
										message: "Inspect the repository and report.",
										agent_type: "explorer",
									},
								},
							],
							"toolUse",
						),
					);
				}
				return new RecordedAssistantStream(
					assistantMessage([
						{ type: "text", text: rootCall === 2 ? "root turn complete" : "notification handled" },
					]),
				);
			},
		});
		compositions.push(composition);
		const session = await composition.backend.create({ sessionId: "root-session" });

		await session.prompt({ text: "Delegate repository inspection." });
		await waitUntil(
			() => {
				const assessment = assessRuntimeHostSessionAssembly(session.createRuntimeHostAssemblyCandidate());
				return (
					assessment.ready &&
					assessment.assembly.backgroundWorkController.readSubagents()[0]?.status === "completed" &&
					rootCall >= 3
				);
			},
			() => {
				const assessment = assessRuntimeHostSessionAssembly(session.createRuntimeHostAssemblyCandidate());
				return JSON.stringify({
					rootCall,
					childCalls: childToolSurfaces.length,
					rootInputs,
					assessment,
					subagents: assessment.ready ? assessment.assembly.backgroundWorkController.readSubagents() : [],
				});
			},
		);

		const assessment = assessRuntimeHostSessionAssembly(session.createRuntimeHostAssemblyCandidate());
		expect(assessment.ready).toBe(true);
		if (!assessment.ready) throw new Error("Expected complete Greenfield RuntimeHost assembly");
		const subagent = assessment.assembly.backgroundWorkController.readSubagents()[0];
		expect(subagent).toMatchObject({
			taskName: "inspect_repo",
			status: "completed",
			finalText: "child completed",
		});
		expect(subagent?.sessionFile).toContain(`${join(".subagents", "root-session")}`);
		expect(rootToolSurfaces[0]).toEqual(
			expect.arrayContaining([
				"spawn_agent",
				"dispatch_workflows",
				"wait_agent",
				"list_agents",
				"interrupt_agent",
				"send_message",
				"followup_task",
			]),
		);
		expect(childToolSurfaces[0]).toEqual(expect.arrayContaining(["read", "grep", "glob", "find", "ls", "dir_tree"]));
		expect(childToolSurfaces[0]).not.toEqual(
			expect.arrayContaining(["spawn_agent", "dispatch_workflows", "bash", "write", "edit"]),
		);
		expect(rootInputs.at(-1)?.join("\n")).toContain("<subagent_notification>");

		const rootEntries = await readdir(conversationDir);
		expect(rootEntries.filter((entry) => entry.endsWith(".conversation.jsonl"))).toHaveLength(1);
		expect(rootEntries).toContain(".subagents");
		await session.dispose();
	}, 30_000);

	it("forks parent context and coding tools into workflow children without recursive delegation", async () => {
		const conversationDir = await temporaryDirectory("greenfield-workflow-conversations-");
		const workspace = await temporaryDirectory("greenfield-workflow-workspace-");
		const childInputs: string[][] = [];
		const childToolSurfaces: string[][] = [];
		let rootCall = 0;
		const composition = await createGreenfieldRuntimeComposition({
			conversationDir,
			cwd: workspace,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			streamFn: (_model, context, options) => {
				if (options?.sessionId !== "workflow-root") {
					childInputs.push(context.messages.map(messageText));
					childToolSurfaces.push((context.tools ?? []).map(({ name }) => name));
					return new RecordedAssistantStream(assistantMessage([{ type: "text", text: "workflow completed" }]));
				}
				rootCall += 1;
				if (rootCall === 1) {
					return new RecordedAssistantStream(
						assistantMessage(
							[
								{
									type: "toolCall",
									id: "dispatch-1",
									name: "dispatch_workflows",
									arguments: {
										workflows: [
											{
												task_name: "implement_scope",
												title: "Implement isolated scope",
												message: "Change the assigned files.",
												todos: ["Inspect files", "Implement change"],
											},
										],
									},
								},
							],
							"toolUse",
						),
					);
				}
				return new RecordedAssistantStream(
					assistantMessage([{ type: "text", text: rootCall === 2 ? "dispatched" : "handled" }]),
				);
			},
		});
		compositions.push(composition);
		const session = await composition.backend.create({ sessionId: "workflow-root" });

		await session.prompt({ text: "Implement this feature in parallel." });
		await waitUntil(
			() => rootCall >= 3 && childInputs.length >= 1,
			() => {
				const assessment = assessRuntimeHostSessionAssembly(session.createRuntimeHostAssemblyCandidate());
				return JSON.stringify({
					rootCall,
					childInputs,
					subagents: assessment.ready
						? assessment.assembly.backgroundWorkController.readSubagents()
						: assessment.missingPorts,
				});
			},
		);

		expect(childInputs[0]?.join("\n")).toContain("Implement this feature in parallel.");
		expect(childInputs[0]?.join("\n")).toContain("Change the assigned files.");
		expect(childToolSurfaces[0]).toEqual(expect.arrayContaining(["shell", "read", "edit", "write", "todo"]));
		expect(childToolSurfaces[0]).not.toEqual(
			expect.arrayContaining(["spawn_agent", "dispatch_workflows", "wait_agent"]),
		);
		const assessment = assessRuntimeHostSessionAssembly(session.createRuntimeHostAssemblyCandidate());
		if (!assessment.ready) throw new Error("Expected complete Greenfield RuntimeHost assembly");
		expect(assessment.assembly.backgroundWorkController.readSubagents()[0]).toMatchObject({
			taskName: "implement_scope",
			agentType: "workflow",
			status: "completed",
			todoProgress: { done: 0, total: 2 },
		});
		await session.dispose();
	}, 30_000);

	async function temporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		directories.push(directory);
		return directory;
	}
});

class RecordedAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor(message: AssistantMessage) {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected assistant event");
			},
		);
		queueMicrotask(() => {
			if (message.stopReason === "error" || message.stopReason === "aborted") {
				this.push({ type: "error", reason: message.stopReason, error: message });
				return;
			}
			this.push({ type: "done", reason: message.stopReason, message });
		});
	}
}

function modelRegistry(): CodingAgentModelRegistrySource {
	return {
		refresh() {},
		getAvailable: () => [MODEL],
		find: (provider, modelId) => (provider === MODEL.provider && modelId === MODEL.id ? MODEL : undefined),
		getApiKey: async () => "test-key",
		setServerToken() {},
		loadRemoteModels: async () => undefined,
	};
}

function assistantMessage(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: MODEL.api,
		provider: MODEL.provider,
		model: MODEL.id,
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: Date.now(),
	};
}

function messageText(message: Message): string {
	if (typeof message.content === "string") return message.content;
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
}

async function waitUntil(predicate: () => boolean, describe?: () => string): Promise<void> {
	for (let attempt = 0; attempt < 500; attempt += 1) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`Condition was not reached${describe ? `: ${describe()}` : ""}`);
}

const MODEL: Model<Api> = {
	id: "subagent-model",
	name: "Subagent Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};
