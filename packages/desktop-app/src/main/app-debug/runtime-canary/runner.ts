import { z } from "zod";
import {
	RUNTIME_CANARY_FIRST_PROMPT,
	RUNTIME_CANARY_QUESTION,
	RUNTIME_CANARY_QUESTION_PROMPT,
	RUNTIME_CANARY_SECOND_PROMPT,
} from "./contracts.js";

const completedOperationSchema = z
	.object({
		operationId: z.uuid(),
		sessionId: z.string().min(1),
		sessionPath: z.string().min(1),
		cwd: z.string().min(1),
		status: z.literal("completed"),
		assistantText: z.string(),
		messageCount: z.number().int().nonnegative(),
	})
	.loose();

const inputRequiredOperationSchema = z
	.object({
		operationId: z.uuid(),
		sessionId: z.string().min(1),
		sessionPath: z.string().min(1),
		cwd: z.string().min(1),
		status: z.literal("input_required"),
		interaction: z
			.object({
				id: z.uuid(),
				type: z.literal("ask_user_question"),
				questions: z.array(z.object({ question: z.string() }).loose()).min(1),
			})
			.loose(),
	})
	.loose();

const terminalOperationSchema = z.discriminatedUnion("status", [
	z
		.object({
			operationId: z.uuid(),
			sessionPath: z.string().min(1),
			status: z.literal("aborted"),
		})
		.loose(),
	completedOperationSchema,
]);

const sessionSummarySchema = z.object({ sessionPath: z.string().min(1), cwd: z.string().min(1) }).loose();
const quitResultSchema = z.object({ status: z.literal("scheduled"), delayMs: z.number().int().positive() }).strict();

export type RuntimeCanaryDebugInvoker = (debugId: string, input: unknown) => Promise<unknown>;

export interface RuntimeCanaryConversationResult {
	readonly sessionId: string;
	readonly sessionPath: string;
	readonly questionOperationId: string;
}

export async function runRuntimeCanaryConversation(
	invokeDebug: RuntimeCanaryDebugInvoker,
	options: { readonly cwd: string; readonly modelKey: string },
): Promise<RuntimeCanaryConversationResult> {
	const common = {
		executionMode: "full-access" as const,
		modelKey: options.modelKey,
		timeoutMs: 30_000,
	};
	const created = completedOperationSchema.parse(
		await invokeDebug("conversation.create", {
			cwd: options.cwd,
			prompt: RUNTIME_CANARY_FIRST_PROMPT,
			...common,
		}),
	);
	if (created.assistantText !== "DESKTOP_PROCESS_CANARY_FIRST") {
		throw new Error(`Unexpected first Runtime Canary response: ${created.assistantText}`);
	}

	const continued = completedOperationSchema.parse(
		await invokeDebug("conversation.continue", {
			sessionPath: created.sessionPath,
			prompt: RUNTIME_CANARY_SECOND_PROMPT,
			...common,
		}),
	);
	if (
		continued.sessionId !== created.sessionId ||
		continued.sessionPath !== created.sessionPath ||
		continued.assistantText !== "DESKTOP_PROCESS_CANARY_SECOND"
	) {
		throw new Error("Runtime Canary continuation did not preserve the session identity and response");
	}

	const sessions = z
		.array(sessionSummarySchema)
		.parse(await invokeDebug("conversation.list", { cwd: options.cwd, limit: 20 }));
	if (!sessions.some((session) => session.sessionPath === created.sessionPath && session.cwd === options.cwd)) {
		throw new Error("Runtime Canary session was not returned by conversation.list");
	}

	const question = inputRequiredOperationSchema.parse(
		await invokeDebug("conversation.continue", {
			sessionPath: created.sessionPath,
			prompt: RUNTIME_CANARY_QUESTION_PROMPT,
			...common,
		}),
	);
	if (
		question.sessionPath !== created.sessionPath ||
		!question.interaction.questions.some((item) => item.question === RUNTIME_CANARY_QUESTION)
	) {
		throw new Error("Runtime Canary did not receive the expected ask_user_question interaction");
	}

	const terminal = terminalOperationSchema.parse(
		await invokeDebug("conversation.abort", { operationId: question.operationId }),
	);
	if (terminal.operationId !== question.operationId || terminal.sessionPath !== created.sessionPath) {
		throw new Error("Runtime Canary abort did not preserve the operation and session identity");
	}

	return {
		sessionId: created.sessionId,
		sessionPath: created.sessionPath,
		questionOperationId: question.operationId,
	};
}

export async function scheduleRuntimeCanaryQuit(invokeDebug: RuntimeCanaryDebugInvoker): Promise<number> {
	const result = quitResultSchema.parse(await invokeDebug("lifecycle.quit", {}));
	return result.delayMs;
}
