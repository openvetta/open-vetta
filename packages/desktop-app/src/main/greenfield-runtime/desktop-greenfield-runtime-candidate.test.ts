import type { GreenfieldRuntimeComposition } from "@vetta/cli-app";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	GreenfieldRuntimeSession,
	RuntimeHostSessionAssemblyCandidate,
} from "../../../../runtime-core/src/index.js";
import { createDesktopGreenfieldRuntimeCandidate } from "./desktop-greenfield-runtime-candidate.js";

const mocks = vi.hoisted(() => ({
	createComposition: vi.fn(),
	resolveSessionId: vi.fn(),
}));

vi.mock("@vetta/cli-app", () => ({
	createGreenfieldRuntimeComposition: mocks.createComposition,
	resolveGreenfieldSessionIdFromPath: mocks.resolveSessionId,
}));

const CORE_CANDIDATE = {
	lifecycle: {},
	historyReader: {},
	historyController: {},
	workspaceView: {},
	modelController: {},
	modelView: {},
	corePorts: {},
} as RuntimeHostSessionAssemblyCandidate;

describe("DesktopGreenfieldRuntimeCandidate", () => {
	beforeEach(() => {
		mocks.createComposition.mockReset();
		mocks.resolveSessionId.mockReset();
	});

	it("uses the real composition boundary without making an incomplete session interactive", async () => {
		const session = createSessionDouble();
		const create = vi.fn(async () => session);
		const dispose = vi.fn(async () => {});
		mocks.createComposition.mockResolvedValue({
			backend: { create, resume: vi.fn() },
			dispose,
		} as unknown as GreenfieldRuntimeComposition);
		const candidate = await createDesktopGreenfieldRuntimeCandidate(createCompositionOptions());

		const result = await candidate.createSession({
			sessionId: "desktop-session",
			cwd: "C:/workspace",
			agentMode: "work",
		});

		expect(mocks.createComposition).toHaveBeenCalledWith(
			expect.objectContaining({ conversationDir: "C:/conversations", scenario: "conversation" }),
		);
		expect(create).toHaveBeenCalledWith({
			sessionId: "desktop-session",
			cwd: "C:/workspace",
			agentMode: "work",
		});
		expect(result.assessment).toEqual({
			ready: false,
			missingPorts: [
				"hostInteraction",
				"executionController",
				"backgroundWorkController",
				"todoController",
				"configurationController",
			],
		});
		await expect(candidate.createSession({ cwd: "C:/other" })).rejects.toThrow(
			"Greenfield candidate session cwd must match its workspace-scoped composition",
		);
		await candidate.dispose();
		expect(dispose).toHaveBeenCalledOnce();
	});

	it("resumes only paths owned by the configured Greenfield conversation root", async () => {
		const session = createSessionDouble();
		const resume = vi.fn(async () => session);
		mocks.createComposition.mockResolvedValue({
			backend: { create: vi.fn(), resume },
			dispose: vi.fn(async () => {}),
		} as unknown as GreenfieldRuntimeComposition);
		mocks.resolveSessionId.mockReturnValueOnce("persisted-session").mockReturnValueOnce(undefined);
		const candidate = await createDesktopGreenfieldRuntimeCandidate(createCompositionOptions());

		await candidate.resumeSession("C:/conversations/persisted.conversation.jsonl", {
			cwd: "C:/workspace",
		});

		expect(mocks.resolveSessionId).toHaveBeenCalledWith(
			"C:/conversations",
			"C:/conversations/persisted.conversation.jsonl",
		);
		expect(resume).toHaveBeenCalledWith({
			sessionId: "persisted-session",
			cwd: "C:/workspace",
		});
		await expect(candidate.resumeSession("C:/other/session.jsonl")).rejects.toThrow(
			"Session path is not a Greenfield conversation in this composition",
		);
	});
});

function createSessionDouble(): GreenfieldRuntimeSession {
	return {
		createRuntimeHostAssemblyCandidate: () => CORE_CANDIDATE,
	} as unknown as GreenfieldRuntimeSession;
}

function createCompositionOptions() {
	return {
		conversationDir: "C:/conversations",
		cwd: "C:/workspace",
		modelRegistry: {},
		initialModel: {},
		initialThinkingLevel: "off",
	} as unknown as Parameters<typeof createDesktopGreenfieldRuntimeCandidate>[0];
}
