import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	RUNTIME_CANARY_MCP_PROMPT,
	RUNTIME_CANARY_MCP_RESULT,
	RUNTIME_CANARY_QUESTION_PROMPT,
	RUNTIME_CANARY_RESTART_PROMPT,
	RUNTIME_CANARY_SCHEDULER_PROMPT,
	RUNTIME_CANARY_SKILL_MARKER,
} from "./contracts.js";
import { type RuntimeCanaryProvider, startRuntimeCanaryProvider } from "./provider.js";

describe("Runtime Canary Provider", () => {
	let provider: RuntimeCanaryProvider | undefined;
	let rootDir: string | undefined;

	afterEach(async () => {
		await provider?.close();
		if (rootDir) await rm(rootDir, { recursive: true, force: true });
	});

	it("seeds isolated Desktop state and serves text and question responses", async () => {
		rootDir = await mkdtemp(join(tmpdir(), "vetta-runtime-canary-provider-"));
		provider = await startRuntimeCanaryProvider(rootDir);

		expect(existsSync(join(provider.fixture.agentDir, "models.json"))).toBe(true);
		expect(existsSync(join(provider.fixture.agentDir, "auth.json"))).toBe(true);
		expect(existsSync(join(provider.fixture.agentDir, "mcp.json"))).toBe(true);
		expect(await readFile(join(provider.fixture.agentDir, "skills", "runtime-canary", "SKILL.md"), "utf8")).toContain(
			RUNTIME_CANARY_SKILL_MARKER,
		);
		expect(
			provider.fixture.batchSourceDirectories.every((directory) => existsSync(join(directory, "input.txt"))),
		).toBe(true);
		const desktopConfig = JSON.parse(
			await readFile(join(provider.fixture.vettaHome, "desktop-config.json"), "utf8"),
		) as { projects: Array<{ path: string }> };
		expect(desktopConfig.projects).toEqual([{ path: provider.fixture.workspace, name: "Runtime Canary" }]);

		const textResponse = await requestProvider(provider.fixture.providerBaseUrl, "first turn");
		expect(textResponse).toContain("Desktop Process Canary");

		const questionResponse = await requestProvider(provider.fixture.providerBaseUrl, RUNTIME_CANARY_QUESTION_PROMPT);
		expect(questionResponse).toContain('"name":"ask_user_question"');
		expect(questionResponse).toContain("Should the Desktop process canary continue?");
		const mcpResponse = await requestProvider(provider.fixture.providerBaseUrl, RUNTIME_CANARY_MCP_PROMPT);
		expect(mcpResponse).toContain('"name":"mcp_runtime_canary_echo"');
		const questionAfterMcpResponse = await requestProvider(
			provider.fixture.providerBaseUrl,
			`${RUNTIME_CANARY_MCP_PROMPT}\n${RUNTIME_CANARY_QUESTION_PROMPT}`,
		);
		expect(questionAfterMcpResponse).toContain('"name":"ask_user_question"');
		const restartedAfterQuestionResponse = await requestProviderInput(provider.fixture.providerBaseUrl, [
			{ role: "user", content: [{ type: "input_text", text: RUNTIME_CANARY_QUESTION_PROMPT }] },
			{ role: "user", content: [{ type: "input_text", text: RUNTIME_CANARY_RESTART_PROMPT }] },
		]);
		expect(restartedAfterQuestionResponse).toContain("DESKTOP_PROCESS_CANARY_RESTARTED");
		expect(restartedAfterQuestionResponse).not.toContain('"name":"ask_user_question"');
		const mcpResultResponse = await requestProviderInput(provider.fixture.providerBaseUrl, [
			{ role: "user", content: [{ type: "input_text", text: RUNTIME_CANARY_MCP_PROMPT }] },
			{ type: "function_call_output", call_id: "call_runtime_canary_mcp", output: RUNTIME_CANARY_MCP_RESULT },
		]);
		expect(mcpResultResponse).toContain("DESKTOP_PROCESS_CANARY_MCP");

		const controller = new AbortController();
		const pendingResponse = await fetch(`${provider.fixture.providerBaseUrl}/responses`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: "runtime-canary-model",
				input: [{ role: "user", content: [{ type: "input_text", text: RUNTIME_CANARY_SCHEDULER_PROMPT }] }],
				stream: true,
			}),
			signal: controller.signal,
		});
		expect(pendingResponse.ok).toBe(true);
		controller.abort();
		await expect(pendingResponse.text()).rejects.toThrow();

		const requestLog = await readFile(provider.fixture.requestLogPath, "utf8");
		expect(requestLog).toContain(RUNTIME_CANARY_QUESTION_PROMPT);
	});
});

async function requestProvider(baseUrl: string, prompt: string): Promise<string> {
	return await requestProviderInput(baseUrl, [{ role: "user", content: [{ type: "input_text", text: prompt }] }]);
}

async function requestProviderInput(baseUrl: string, input: readonly unknown[]): Promise<string> {
	const response = await fetch(`${baseUrl}/responses`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			model: "runtime-canary-model",
			input,
			stream: true,
		}),
	});
	expect(response.ok).toBe(true);
	return await response.text();
}
