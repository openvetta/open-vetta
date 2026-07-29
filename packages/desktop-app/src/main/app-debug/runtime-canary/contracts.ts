import { z } from "zod";

export const RUNTIME_CANARY_MODEL_PROVIDER = "runtime-canary";
export const RUNTIME_CANARY_MODEL_ID = "runtime-canary-model";
export const RUNTIME_CANARY_MODEL_KEY = `${RUNTIME_CANARY_MODEL_PROVIDER}/${RUNTIME_CANARY_MODEL_ID}`;
export const RUNTIME_CANARY_FIRST_PROMPT = "Reply with exactly DESKTOP_PROCESS_CANARY_FIRST.";
export const RUNTIME_CANARY_SECOND_PROMPT = "Reply with exactly DESKTOP_PROCESS_CANARY_SECOND.";
export const RUNTIME_CANARY_QUESTION_PROMPT = "Call ask_user_question for the Desktop process canary.";
export const RUNTIME_CANARY_QUESTION = "Should the Desktop process canary continue?";
export const RUNTIME_CANARY_SCHEDULER_PROMPT = "Hold the Desktop process Scheduler runtime canary open.";
export const RUNTIME_CANARY_BATCH_PROMPT = "Hold the Desktop process Batch runtime canary open.";

export const runtimeCanaryConsumersSchema = z
	.object({
		schedulerTaskId: z.string().min(1),
		schedulerSessionId: z.string().min(1),
		schedulerSessionPath: z.string().min(1),
		batchProjectId: z.string().min(1),
		batchActiveTaskId: z.string().min(1),
		batchQueuedTaskId: z.string().min(1),
		batchSessionId: z.string().min(1),
		batchSessionPath: z.string().min(1),
	})
	.strict();

export const runtimeCanaryFixtureSchema = z
	.object({
		mode: z.literal("greenfield"),
		vettaHome: z.string().min(1),
		agentDir: z.string().min(1),
		workspace: z.string().min(1),
		providerBaseUrl: z.url(),
		requestLogPath: z.string().min(1),
		modelKey: z.literal(RUNTIME_CANARY_MODEL_KEY),
		batchSourceDirectories: z.tuple([z.string().min(1), z.string().min(1)]),
	})
	.strict();

export const runtimeCanaryHostStateSchema = z
	.object({
		workspaceId: z.string().min(1),
		hostPid: z.number().int().positive(),
		runtimeCanary: runtimeCanaryFixtureSchema.extend({
			providerPid: z.number().int().positive(),
			exitReportPath: z.string().min(1),
		}),
	})
	.loose();

export const runtimeCanaryExitReportSchema = z
	.object({
		desktopExitCode: z.number().int(),
		endpointRemoved: z.boolean(),
		providerStopped: z.boolean(),
	})
	.strict();

export type RuntimeCanaryFixture = z.infer<typeof runtimeCanaryFixtureSchema>;
export type RuntimeCanaryHostState = z.infer<typeof runtimeCanaryHostStateSchema>;
export type RuntimeCanaryExitReport = z.infer<typeof runtimeCanaryExitReportSchema>;
export type RuntimeCanaryConsumers = z.infer<typeof runtimeCanaryConsumersSchema>;
