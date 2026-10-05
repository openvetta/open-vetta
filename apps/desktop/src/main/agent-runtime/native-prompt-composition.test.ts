import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildTeamMemberOperatingContext,
	buildTeamSharedOperatingContext,
	type TeamRosterSnapshot,
} from "@vetta/agent-team";
import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	EventStream,
	type Message,
	type Model,
} from "@vetta/ai";
import {
	type CodingAgentPromptRuntimeSources,
	createCodingAgentRuntimeSessionSelection,
} from "@vetta/coding-agent/composition";
import type { CodingAgentRuntimeModelSource } from "@vetta/coding-agent/host-services";
import { getPersonaPrompt } from "@vetta/coding-agent/profile";
import { RuntimeHost } from "@vetta/runtime-core";
import { DesktopRuntimeBackendPool } from "@vetta/runtime-desktop";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AgentMode, getModePrompt } from "../agent-modes/index.js";

interface ModelFrame {
	readonly systemPrompt: string;
	readonly toolNames: readonly string[];
	readonly messages: readonly Message[];
}

type Role = "root" | "leader" | "member";
type Persona = "default" | "interactive";
type TeamPreset = "dev-team" | "planning-team";

interface TeamPromptFixture {
	readonly roster: TeamRosterSnapshot;
	readonly profile: string;
	readonly workflow: string;
}

const CASES = (["work", "coding"] as const).flatMap((mode) =>
	(["default", "interactive"] as const).flatMap((persona) =>
		(["root", "leader", "member"] as const).map((role) => ({ mode, persona, role })),
	),
);
const PROJECT_INSTRUCTION = "Project override: explain review findings in priority order; do not change files.";
const USER_INSTRUCTION = "User preference: keep the explanation concise.";
const REVIEW_REQUEST = "Review the design only. Explain the findings without editing or starting implementation.";
const SKILL_NAME = "native-prompt-fixture";

describe("Native Desktop assembled prompt", () => {
	const directories: string[] = [];
	const disposers: Array<() => Promise<void>> = [];
	const network = vi.fn(() => {
		throw new Error("Native prompt tests must never make network requests");
	});

	beforeEach(() => {
		network.mockClear();
		vi.stubGlobal("fetch", network);
	});

	afterEach(async () => {
		try {
			for (const dispose of disposers.splice(0).reverse()) await dispose();
			for (const directory of directories.splice(0).reverse()) {
				await rm(directory, { recursive: true, force: true });
			}
			expect(network).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it.each(CASES)(
		"preserves $mode / $persona / $role scope with no tools, then read-only capabilities",
		async ({ mode, persona, role }) => {
			const { runtime, sessionId, frames, cwd, team } = await createFixture({ mode, persona, role, toolNames: [] });

			await runtime.prompt(sessionId, { text: REVIEW_REQUEST });
			runtime.setSessionActiveToolNames(sessionId, ["read"]);
			await runtime.prompt(sessionId, {
				text: "Continue the same review using the available read-only capability.",
			});

			expect(frames).toHaveLength(2);
			expect(frames[0]?.toolNames).toEqual([]);
			expect(frames[1]?.toolNames).toEqual(["read"]);
			expect(runtime.readSessionActiveToolNames(sessionId)).toEqual(["read"]);
			expect(frames[0]?.messages).toContainEqual(
				expect.objectContaining({
					role: "user",
					content: expect.arrayContaining([{ type: "text", text: REVIEW_REQUEST }]),
				}),
			);

			for (const frame of frames) {
				const prompt = frame.systemPrompt;
				expect(prompt).toContain(getModePrompt(mode));
				expect(prompt).not.toContain(getModePrompt(mode === "work" ? "coding" : "work"));
				if (persona === "interactive") {
					expect(prompt).toContain(getPersonaPrompt(persona));
					expect(prompt).not.toContain("must obtain the user's explicit go-ahead");
				} else {
					expect(prompt).not.toContain(getPersonaPrompt("interactive"));
				}
				expect(prompt).toContain(PROJECT_INSTRUCTION);
				expect(prompt).toContain(USER_INSTRUCTION);
				expect(prompt).toContain("direct user instructions in the chat always override any instruction file");
				expect(prompt).toContain("Answer simple questions directly");
				expect(prompt).toContain("Reviews, explanations, and diagnoses are read-only");
				expect(prompt).toContain("MANDATORY file-link format");
				expect(prompt).toContain("[filename.ext](</abs/path/with spaces/filename.ext>)");
				expect(prompt).toContain(`Current working directory: ${cwd}`);
				expect(prompt).toContain("INSIDE the current working directory");
				expect(prompt).toContain("Deliveries and their explanations may be interleaved");
				expect(prompt).toContain("After the final response that ends the turn");
				expect(prompt).not.toContain("Once you begin the final answer, do not call more tools");
				expect(prompt).not.toContain("Key observations");
				expect(prompt).not.toContain("Fill the tool's `md_intro`");
				// These tools are absent in both actual frames; neither mode nor persona may require them.
				expect(prompt).not.toMatch(/\b(?:progress|ask_user_question|spawn_agent|wait_agent|invoke_skill)\s*\(/);
				expect(prompt).not.toMatch(/`(?:progress|ask_user_question|spawn_agent|wait_agent|invoke_skill)`/);
				expect(prompt).not.toContain("<available_skills>");
				expect(prompt).not.toContain(SKILL_NAME);
				assertRole(prompt, role, team);
			}
		},
	);

	it("keeps the real Business specialist bounded inside a Planning Team member frame", async () => {
		const { runtime, sessionId, frames, team } = await createFixture({
			mode: "work",
			persona: "interactive",
			role: "member",
			teamPreset: "planning-team",
			toolNames: ["read"],
		});
		await runtime.prompt(sessionId, { text: REVIEW_REQUEST });

		expect(frames).toHaveLength(1);
		const frame = frames[0];
		if (!frame) throw new Error("Missing Planning Team model frame");
		expect(frame.toolNames).toEqual(["read"]);
		expect(frame.systemPrompt).toContain(getModePrompt("work"));
		expect(frame.systemPrompt).toContain(getPersonaPrompt("interactive"));
		expect(frame.systemPrompt).toContain(PROJECT_INSTRUCTION);
		assertRole(frame.systemPrompt, "member", team);
	});

	it("updates the skill index together with the callable tool frame on the next turn", async () => {
		const { runtime, sessionId, frames } = await createFixture({
			mode: "work",
			persona: "default",
			role: "root",
			toolNames: ["read", "invoke_skill"],
		});
		await runtime.prompt(sessionId, { text: "Which skill is available?" });
		runtime.setSessionActiveToolNames(sessionId, ["read"]);
		await runtime.prompt(sessionId, { text: "Review only; do not invoke a skill." });
		runtime.setSessionActiveToolNames(sessionId, []);
		await runtime.prompt(sessionId, { text: "Answer directly from our conversation." });

		expect(frames).toHaveLength(3);
		expect(frames[0]?.toolNames).toEqual(["read", "invoke_skill"]);
		expect(frames[0]?.systemPrompt).toContain(SKILL_NAME);
		expect(frames[0]?.systemPrompt).toContain("invoke_skill");
		expect(frames[1]?.toolNames).toEqual(["read"]);
		expect(frames[2]?.toolNames).toEqual([]);
		for (const frame of frames.slice(1)) {
			expect(frame.systemPrompt).not.toContain(SKILL_NAME);
			expect(frame.systemPrompt).not.toContain("<available_skills>");
			expect(frame.systemPrompt).not.toContain("invoke_skill");
			expect(frame.systemPrompt).toContain(getModePrompt("work"));
			expect(frame.systemPrompt).toContain(PROJECT_INSTRUCTION);
		}
	});

	async function createFixture(options: {
		readonly mode: AgentMode;
		readonly persona: Persona;
		readonly role: Role;
		readonly teamPreset?: TeamPreset;
		readonly toolNames: readonly string[];
	}) {
		const cwd = await temporaryDirectory("native-prompt-workspace-");
		const sessionDir = await temporaryDirectory("native-prompt-sessions-");
		const agentDir = await temporaryDirectory("native-prompt-agent-");
		const team = await teamPromptFixture(options.role, options.teamPreset ?? "dev-team");
		const frames: ModelFrame[] = [];
		const pool = new DesktopRuntimeBackendPool({
			compositionDefaults: {
				activation: { mode: "explicit", toolNames: options.toolNames },
				modelRegistry: modelRegistry(),
				initialModel: MODEL,
				initialThinkingLevel: "off",
				hookConfigLayers: [],
				createPromptRuntimeSources: async () => promptSources(cwd, options.persona),
				resolveModePrompt: getModePrompt,
				resolveCompactionSettings: () => ({
					enabled: false,
					reserveTokens: 2_000,
					minFreePercent: 10,
					keepRecentTokens: 1_000,
				}),
				streamFn: (_model, context) => {
					frames.push({
						systemPrompt: context.systemPrompt ?? "",
						toolNames: (context.tools ?? []).map(({ name }) => name),
						messages: structuredClone(context.messages),
					});
					return new RecordedAssistantStream();
				},
			},
		});
		const runtime = new RuntimeHost({ sessionBackend: pool, getDefaultExecutionMode: () => "full-access" });
		disposers.push(async () => {
			try {
				await runtime.disposeAllSessions();
			} finally {
				await pool.dispose();
			}
		});
		const created = await runtime.createSession({
			cwd,
			sessionDir,
			agentDir,
			executionMode: "full-access",
			agent: createCodingAgentRuntimeSessionSelection({
				scenario: "conversation",
				agentMode: options.mode,
				includeAgentSkills: false,
				automaticRetry: false,
				...(!team
					? {}
					: {
							systemPromptCachePrefixAddon: buildTeamSharedOperatingContext(team.roster),
							systemPromptVolatileAddon: buildTeamMemberOperatingContext(
								team.roster,
								options.role,
								team.profile,
								options.role === "leader" ? team.workflow : undefined,
							),
						}),
			}),
		});
		// The host-level mask also covers session extensions such as Skills and subagents.
		runtime.setSessionActiveToolNames(created.sessionId, options.toolNames);
		return { runtime, sessionId: created.sessionId, frames, cwd, team };
	}

	async function temporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		directories.push(directory);
		return directory;
	}
});

function assertRole(prompt: string, role: Role, team: TeamPromptFixture | undefined): void {
	if (role === "root") {
		expect(prompt).not.toContain("<agent_team_operating_context>");
		expect(prompt).not.toContain("<agent_team_member_identity>");
		return;
	}
	if (!team) throw new Error(`Missing preset prompt fixture for ${role}`);
	expect(prompt).toContain(buildTeamSharedOperatingContext(team.roster));
	expect(prompt).toContain(`Team role: ${role}.`);
	expect(prompt).not.toContain(`Team role: ${role === "leader" ? "member" : "leader"}.`);
	expect(prompt).toContain(team.profile);
	expect(prompt).toContain("Only the leader transfers Team task ownership");
	if (role === "leader") {
		expect(prompt).toContain(team.workflow);
		expect(prompt).toContain("Answer simple questions, status requests, and bounded read-only reviews directly");
		expect(prompt).not.toContain("delegate each step");
		expect(prompt).not.toContain("Run this team as a build loop");
	} else {
		expect(prompt).not.toContain(team.workflow);
		expect(prompt).toContain("Return your result to the leader");
		expect(prompt).toContain("Do not repeat the leader's user-facing kickoff, plan, or final-delivery ceremony");
	}
}

async function teamPromptFixture(role: Role, preset: TeamPreset): Promise<TeamPromptFixture | undefined> {
	if (role === "root") return undefined;
	const specialist = preset === "dev-team" ? "developer" : "business";
	const resourceRoot = new URL("../../../../../packages/plugins/presets/preset-agent/agent/", import.meta.url);
	// These are shipped prompt assets, not a plugin runtime or the user's installed configuration.
	const [profile, workflow] = await Promise.all([
		readFile(new URL(`prompts/${role === "leader" ? "master" : specialist}.md`, resourceRoot), "utf8"),
		readFile(new URL(`workflows/${preset}.md`, resourceRoot), "utf8"),
	]);
	return {
		roster: { ...ROSTER, teamName: preset === "dev-team" ? "Dev Team" : "Planning Team" },
		profile: profile.trim(),
		workflow: workflow.trim(),
	};
}

function promptSources(cwd: string, personaId: Persona): CodingAgentPromptRuntimeSources {
	return {
		resourceSource: {
			getAgentsFiles: () => ({ agentsFiles: [{ path: join(cwd, "AGENTS.md"), content: PROJECT_INSTRUCTION }] }),
			getAppendSystemPrompt: () => [],
			getSystemPrompt: () => undefined,
			getSkills: () => ({
				skills: [
					{
						name: SKILL_NAME,
						description: "A test-only design review skill",
						filePath: join(cwd, "skills", "SKILL.md"),
						baseDir: join(cwd, "skills"),
						source: "test",
						type: "skill",
						disableModelInvocation: false,
						content: "Review the supplied design within the user's requested scope.",
						sceneTasks: [],
					},
				],
				diagnostics: [],
			}),
			refreshContextResourcesIfChanged: async () => false,
			refreshSkillsIfChanged: async () => false,
			setRuntimeSkillPaths: async () => {},
		},
		settingsSource: {
			getPersonalization: () => ({ personaId, customPrompt: USER_INSTRUCTION }),
			reloadPersonalizationSettings() {},
		},
	};
}

function modelRegistry(): CodingAgentRuntimeModelSource {
	return {
		refresh() {},
		getAvailable: () => [MODEL],
		find: (provider, id) => (provider === MODEL.provider && id === MODEL.id ? MODEL : undefined),
		getApiKey: async () => "test-key",
		setServerToken() {},
		loadRemoteModels: async () => undefined,
	};
}

class RecordedAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected assistant event");
			},
		);
		queueMicrotask(() => {
			this.push({
				type: "done",
				reason: "stop",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Review complete." }],
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
					stopReason: "stop",
					timestamp: 2,
				},
			});
		});
	}
}

const MODEL: Model<Api> = {
	id: "native-prompt-recorded-model",
	name: "Native Prompt Recorded Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128_000,
	maxTokens: 1_000,
};

const ROSTER: TeamRosterSnapshot = {
	teamId: "native-prompt-team",
	teamName: "Design Review Team",
	teamRevision: 1,
	leaderParticipantId: "leader",
	members: [
		{
			participantId: "leader",
			handle: "lead",
			displayName: "Review Lead",
			isLeader: true,
			role: "leader",
			responsibilitySummary: "Coordinate the user's review",
			capabilities: [],
			availability: "idle",
			profileRevision: 1,
		},
		{
			participantId: "member",
			handle: "reviewer",
			displayName: "Reviewer",
			isLeader: false,
			role: "reviewer",
			responsibilitySummary: "Inspect the assigned design",
			capabilities: [],
			availability: "idle",
			profileRevision: 1,
		},
	],
};
