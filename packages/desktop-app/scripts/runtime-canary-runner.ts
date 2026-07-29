import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ACTION_RPC_ENDPOINT_FILE_ENV, VETTA_HOME_ENV } from "@vetta/action-rpc";
import {
	RUNTIME_CANARY_FIRST_PROMPT,
	RUNTIME_CANARY_BATCH_PROMPT,
	RUNTIME_CANARY_QUESTION_PROMPT,
	RUNTIME_CANARY_SCHEDULER_PROMPT,
	RUNTIME_CANARY_SECOND_PROMPT,
	runtimeCanaryExitReportSchema,
	runtimeCanaryHostStateSchema,
} from "../src/main/app-debug/runtime-canary/contracts.js";
import {
	runRuntimeCanaryConversation,
	scheduleRuntimeCanaryQuit,
	startRuntimeCanaryConsumers,
	startRuntimeCanaryQuestion,
	type RuntimeCanaryDebugInvoker,
} from "../src/main/app-debug/runtime-canary/runner.js";

const desktopRoot = join(import.meta.dirname, "..");
const repoRoot = join(desktopRoot, "..", "..");
const cliPath = join(repoRoot, "packages", "cli-app", "src", "cli.ts");

try {
	const statePath = readArgument("--state-file");
	const state = runtimeCanaryHostStateSchema.parse(JSON.parse(await readFile(statePath, "utf8")));
	const endpointFilePath = join(state.runtimeCanary.vettaHome, "action-server.json");
	const invokeDebug: RuntimeCanaryDebugInvoker = async (debugId, input) =>
		await runVettaDebug(endpointFilePath, state.runtimeCanary.vettaHome, debugId, input);

	const conversation = await runRuntimeCanaryConversation(invokeDebug, {
		cwd: state.runtimeCanary.workspace,
		modelKey: state.runtimeCanary.modelKey,
	});
	const consumers = await startRuntimeCanaryConsumers(invokeDebug, {
		workspace: state.runtimeCanary.workspace,
		modelKey: state.runtimeCanary.modelKey,
		batchSourceDirectories: state.runtimeCanary.batchSourceDirectories,
	});
	const pendingQuestion = await startRuntimeCanaryQuestion(invokeDebug, {
		sessionPath: conversation.sessionPath,
		modelKey: state.runtimeCanary.modelKey,
	});
	const quitDelayMs = await scheduleRuntimeCanaryQuit(invokeDebug);

	await waitFor(
		() =>
			existsSync(state.runtimeCanary.exitReportPath) &&
			!existsSync(endpointFilePath) &&
			!isProcessAlive(state.hostPid) &&
			!isProcessAlive(state.runtimeCanary.providerPid),
		45_000,
		"Timed out waiting for the Desktop Runtime Canary to shut down",
	);

	const exitReport = runtimeCanaryExitReportSchema.parse(
		JSON.parse(await readFile(state.runtimeCanary.exitReportPath, "utf8")),
	);
	if (exitReport.desktopExitCode !== 0 || !exitReport.endpointRemoved || !exitReport.providerStopped) {
		throw new Error(`Desktop Runtime Canary cleanup failed: ${JSON.stringify(exitReport)}`);
	}
	for (const sessionPath of [
		conversation.sessionPath,
		consumers.schedulerSessionPath,
		consumers.batchSessionPath,
	]) {
		if (existsSync(`${sessionPath}.lock`) || existsSync(`${sessionPath}.owner.lock`)) {
			throw new Error(`Desktop Runtime Canary left a session ownership lock after shutdown: ${sessionPath}`);
		}
	}

	const providerRequests = await readFile(state.runtimeCanary.requestLogPath, "utf8");
	for (const prompt of [
		RUNTIME_CANARY_FIRST_PROMPT,
		RUNTIME_CANARY_SECOND_PROMPT,
		RUNTIME_CANARY_QUESTION_PROMPT,
		RUNTIME_CANARY_SCHEDULER_PROMPT,
		RUNTIME_CANARY_BATCH_PROMPT,
	]) {
		if (!providerRequests.includes(prompt)) {
			throw new Error(`Runtime Canary Provider did not observe prompt: ${prompt}`);
		}
	}
	const batchRequestCount = providerRequests
		.split(/\r?\n/)
		.filter((line) => line.includes(RUNTIME_CANARY_BATCH_PROMPT)).length;
	if (batchRequestCount !== 1) {
		throw new Error(`Runtime Canary started ${batchRequestCount} Batch provider requests; expected exactly one`);
	}

	printJson({
		ok: true,
		result: {
			...conversation,
			...consumers,
			pendingQuestionOperationId: pendingQuestion.operationId,
			quitDelayMs,
			sessionPersisted: existsSync(conversation.sessionPath),
			sessionLocksReleased: true,
			endpointRemoved: true,
			providerStopped: true,
			desktopExitCode: exitReport.desktopExitCode,
		},
	});
} catch (error) {
	printJson({
		ok: false,
		error: {
			message: error instanceof Error ? error.message : String(error),
		},
	});
	process.exitCode = 1;
}

async function runVettaDebug(
	endpointFilePath: string,
	vettaHome: string,
	debugId: string,
	input: unknown,
): Promise<unknown> {
	const result = await runProcess("bun", [cliPath, "debug", "run", debugId, JSON.stringify(input)], {
		...process.env,
		[ACTION_RPC_ENDPOINT_FILE_ENV]: endpointFilePath,
		[VETTA_HOME_ENV]: vettaHome,
	});
	if (result.code !== 0) {
		throw new Error(
			`Vetta CLI failed with code ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
	}
	const parsed = JSON.parse(result.stdout) as { ok?: unknown; result?: unknown };
	if (parsed.ok !== true) throw new Error(`Vetta CLI returned an unsuccessful response: ${result.stdout}`);
	return parsed.result;
}

async function runProcess(
	command: string,
	args: string[],
	env: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
	return await new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: repoRoot,
			env,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`${command} exited with signal ${signal}\nstderr:\n${stderr}`));
				return;
			}
			resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
		});
	});
}

async function waitFor(predicate: () => boolean, timeoutMs: number, message: string): Promise<void> {
	const startedAt = Date.now();
	while (!predicate()) {
		if (Date.now() - startedAt >= timeoutMs) throw new Error(message);
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function readArgument(name: string): string {
	const index = process.argv.indexOf(name);
	const value = index === -1 ? undefined : process.argv[index + 1];
	if (!value) throw new Error(`Missing ${name}`);
	return value;
}

function printJson(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}
