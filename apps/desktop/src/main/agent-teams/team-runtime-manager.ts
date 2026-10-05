import {
	type AgentTeamDocument,
	buildTeamMemberOperatingContext,
	buildTeamRosterSnapshot,
	buildTeamSharedOperatingContext,
	filterTeamMemberActiveToolNames,
	resolveMemberProfile,
	stableTeamEventId,
	type TeamMember,
	type TeamSessionDocument,
	teamMemberAssignmentFingerprint,
	teamRosterFingerprint,
} from "@vetta/agent-team";
import type {
	CodingAgentPinnedModelContextBinder,
	CodingAgentRuntimeToolRegistration,
} from "@vetta/coding-agent/runtime";
import type { RuntimeHost, SessionExecutionMode } from "@vetta/runtime-core";
import { resolveDesktopSessionConfig } from "../conversations/resolve-session-config.js";
import { getAppLogger } from "../logger.js";
import { toAgentConfigurationOverrides } from "./agent-ability-overrides.js";
import { pinnedAbilityContext, resolveAgentBlueprint } from "./agent-blueprint-registry.js";
import type { TeamCollaborationStore } from "./team-collaboration-store.js";
import { restoreTeamMemberPinnedContext } from "./team-member-context.js";
import { reconfigureTeamMemberRuntime } from "./team-member-runtime-reconfiguration.js";
import { restoreTeamMemberRuntimes } from "./team-runtime-restorer.js";
import type { TeamSessionStateRepository } from "./team-session-state-repository.js";

const log = getAppLogger("agent-team-runtime-manager");

export interface TeamMemberPromptContext {
	readonly systemPromptCachePrefixAddon: string;
	readonly systemPromptVolatileAddon: string;
	readonly bindPinnedModelContext: CodingAgentPinnedModelContextBinder;
	readonly promptCacheKey: string;
}

export interface TeamRuntimeManagerOptions {
	readonly runtime: () => RuntimeHost;
	readonly createTeamToolRegistrations: (teamSessionId: string) => readonly CodingAgentRuntimeToolRegistration[];
	readonly sessionState: TeamSessionStateRepository;
	readonly collaborationStore: TeamCollaborationStore;
}

/** Owns Team Runtime creation, restoration, configuration, policy, and disposal boundaries. */
export class TeamRuntimeManager {
	private readonly options: TeamRuntimeManagerOptions;
	private readonly pendingCoordinationBindings = new Map<
		string,
		NonNullable<TeamSessionDocument["coordinationRuntime"]>
	>();

	constructor(options: TeamRuntimeManagerOptions) {
		this.options = options;
	}

	applyDefaultTeamToolPolicy(runtimeSessionId: string): void {
		const runtime = this.options.runtime();
		if (
			typeof runtime.readSessionActiveToolNames !== "function" ||
			typeof runtime.setSessionActiveToolNames !== "function"
		) {
			return;
		}
		const current = runtime.readSessionActiveToolNames(runtimeSessionId);
		const filtered = filterTeamMemberActiveToolNames(current);
		if (filtered.length !== current.length) runtime.setSessionActiveToolNames(runtimeSessionId, filtered);
	}

	async createMemberRuntime(
		teamSessionId: string,
		member: AgentTeamDocument["teams"][number]["members"][number],
		team: AgentTeamDocument["teams"][number],
		document: AgentTeamDocument,
		cwd: string,
		executionMode: SessionExecutionMode,
	): Promise<TeamSessionDocument["memberRuntime"][string]> {
		const profile = resolveMemberProfile(document, member);
		const blueprint = resolveAgentBlueprint(profile.blueprintId);
		const systemPrompt = profile.systemPrompt ?? blueprint?.systemPrompt;
		if (!systemPrompt) throw new Error(`Agent profile has no system prompt: ${profile.id}`);
		const roster = buildTeamRosterSnapshot(document, team);
		const promptContext = this.createMemberPromptContext(
			teamSessionId,
			member.id,
			roster,
			systemPrompt,
			member.assignment?.instructions,
		);
		const resolved = await resolveDesktopSessionConfig(
			{
				cwd,
				executionMode,
				automaticRetry: false,
				...promptContext,
				agentConfiguration: {
					template: null,
					overrides: toAgentConfigurationOverrides(profile.abilities, pinnedAbilityContext(blueprint)),
				},
				sessionRuntimeTools: this.options.createTeamToolRegistrations(teamSessionId),
			},
			"other",
			"interactive",
		);
		const runtime = this.options.runtime();
		const created = await runtime.createSession(resolved.config);
		try {
			this.applyDefaultTeamToolPolicy(created.sessionId);
			const sessionPath = runtime.getSessionPath(created.sessionId);
			if (!sessionPath) throw new Error("Runtime did not expose team member session path");
			return {
				sessionId: created.sessionId,
				sessionPath,
				agentProfileId: profile.id,
				agentProfileRevision: profile.revision,
				assignmentFingerprint: teamMemberAssignmentFingerprint(member.assignment),
				rosterFingerprint: teamRosterFingerprint(roster),
				deliveredEventIds: [],
			};
		} catch (error) {
			if (!resolved.config.sessionPath?.trim()) await this.releaseUncommittedRuntime(runtime, created.sessionId);
			throw error;
		}
	}

	async createCoordinationRuntime(
		cwd: string,
		sessionPath?: string,
		sessionId?: string,
		executionMode: SessionExecutionMode = "full-access",
	): Promise<NonNullable<TeamSessionDocument["coordinationRuntime"]>> {
		const resolved = await resolveDesktopSessionConfig(
			{
				cwd,
				executionMode,
				...(sessionPath ? { sessionPath } : {}),
				...(sessionId ? { sessionId } : {}),
			},
			"other",
			"interactive",
		);
		const runtime = this.options.runtime();
		const created = await runtime.createSession(resolved.config);
		try {
			if (sessionId && created.sessionId !== sessionId) {
				throw new Error("Restored team coordination session identity changed");
			}
			const resolvedPath = runtime.getSessionPath(created.sessionId);
			if (!resolvedPath) throw new Error("Runtime did not expose team coordination session path");
			if (sessionPath && resolvedPath !== sessionPath) {
				throw new Error("Restored team coordination session path changed");
			}
			return { sessionId: created.sessionId, sessionPath: resolvedPath };
		} catch (error) {
			if (!resolved.config.sessionPath?.trim()) {
				await this.releaseUncommittedRuntime(runtime, created.sessionId);
			}
			throw error;
		}
	}

	async ensureCoordinationRuntime(session: TeamSessionDocument): Promise<TeamSessionDocument> {
		const current = session.coordinationRuntime;
		if (current) {
			const activePath = this.options.runtime().getSessionPath(current.sessionId);
			if (activePath) {
				if (activePath !== current.sessionPath) {
					throw new Error(`Runtime session id is already bound to another path: ${current.sessionId}`);
				}
				this.pendingCoordinationBindings.delete(session.id);
				return session;
			}
		}
		const retryBinding = current ?? this.pendingCoordinationBindings.get(session.id);
		const coordinationRuntime = await this.createCoordinationRuntime(
			session.cwd,
			retryBinding?.sessionPath,
			retryBinding?.sessionId ?? session.id,
			session.executionMode ?? "full-access",
		);
		// Retain the path acquired by this manager when the first metadata write
		// fails. This is a retry reference, never evidence of disposal ownership.
		if (!current) this.pendingCoordinationBindings.set(session.id, coordinationRuntime);
		const next: TeamSessionDocument = {
			...session,
			revision: session.revision + 1,
			updatedAt: Date.now(),
			coordinationRuntime,
		};
		// Persistence may expose the new path before a later step fails. Once this
		// operation yields, another caller can borrow it; only the host may retire it.
		await this.options.sessionState.persist(next);
		if (this.pendingCoordinationBindings.get(session.id) === coordinationRuntime) {
			this.pendingCoordinationBindings.delete(session.id);
		}
		return next;
	}

	private async releaseUncommittedRuntime(runtime: RuntimeHost, sessionId: string): Promise<void> {
		try {
			await runtime.disposeSession(sessionId);
		} catch (error) {
			log.warn("failed to release uncommitted team runtime", {
				runtimeSessionId: sessionId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async restoreMembers(session: TeamSessionDocument, document: AgentTeamDocument): Promise<TeamSessionDocument> {
		return restoreTeamMemberRuntimes({
			session,
			runtime: this.options.runtime(),
			createRuntimeTools: () => this.options.createTeamToolRegistrations(session.id),
			prepareRuntime: (sessionId) => this.applyDefaultTeamToolPolicy(sessionId),
			resolveConfig: async ({ memberId, sessionPath, runtimeTools }) => {
				const profile = this.resolveMemberProfile(session, document, memberId);
				return {
					config: await this.resolveMemberSessionConfig(
						session,
						document,
						memberId,
						sessionPath,
						runtimeTools,
						session.executionMode ?? "full-access",
					),
					agentProfileId: profile.id,
					agentProfileRevision: profile.revision,
					assignmentFingerprint: teamMemberAssignmentFingerprint(
						this.resolveMember(session, document, memberId).assignment,
					),
					rosterFingerprint: teamRosterFingerprint(this.resolveRoster(session, document)),
				};
			},
			persist: (next) => this.options.sessionState.persist(next),
			logger: log,
		});
	}

	async ensureMemberConfiguration(
		session: TeamSessionDocument,
		document: AgentTeamDocument,
		memberId: string,
	): Promise<TeamSessionDocument> {
		const profile = this.resolveMemberProfile(session, document, memberId);
		const configured = await reconfigureTeamMemberRuntime({
			session,
			memberId,
			agentProfileId: profile.id,
			agentProfileRevision: profile.revision,
			assignmentFingerprint: teamMemberAssignmentFingerprint(
				this.resolveMember(session, document, memberId).assignment,
			),
			rosterFingerprint: teamRosterFingerprint(this.resolveRoster(session, document)),
			runtime: this.options.runtime(),
			resolveConfig: (sessionPath) =>
				this.resolveMemberSessionConfig(
					session,
					document,
					memberId,
					sessionPath,
					this.options.createTeamToolRegistrations(session.id),
					session.executionMode ?? "full-access",
				),
			persist: async (next) => {
				const runtimeState = next.memberRuntime[memberId];
				if (runtimeState) this.applyDefaultTeamToolPolicy(runtimeState.sessionId);
				await this.options.sessionState.persist(next);
			},
			logger: log,
		});
		const runtimeState = configured.memberRuntime[memberId];
		if (configured === session && runtimeState) this.applyDefaultTeamToolPolicy(runtimeState.sessionId);
		return configured;
	}

	private resolveMemberProfile(session: TeamSessionDocument, document: AgentTeamDocument, memberId: string) {
		return resolveMemberProfile(document, this.resolveMember(session, document, memberId));
	}

	private resolveRoster(session: TeamSessionDocument, document: AgentTeamDocument) {
		const team = document.teams.find((candidate) => candidate.id === session.teamId);
		if (!team) throw new Error(`Agent team not found: ${session.teamId}`);
		return buildTeamRosterSnapshot(document, team);
	}

	private resolveMember(session: TeamSessionDocument, document: AgentTeamDocument, memberId: string): TeamMember {
		const team = document.teams.find((candidate) => candidate.id === session.teamId);
		if (!team) throw new Error(`Agent team not found: ${session.teamId}`);
		const member = team.members.find((candidate) => candidate.id === memberId);
		if (!member) throw new Error(`Agent team member not found: ${memberId}`);
		return member;
	}

	private async resolveMemberSessionConfig(
		session: TeamSessionDocument,
		document: AgentTeamDocument,
		memberId: string,
		sessionPath: string,
		runtimeTools: readonly CodingAgentRuntimeToolRegistration[],
		executionMode: SessionExecutionMode,
	) {
		const profile = this.resolveMemberProfile(session, document, memberId);
		const team = document.teams.find((candidate) => candidate.id === session.teamId);
		if (!team) throw new Error(`Agent team not found: ${session.teamId}`);
		const member = team.members.find((candidate) => candidate.id === memberId);
		const blueprint = resolveAgentBlueprint(profile.blueprintId);
		const systemPrompt = profile.systemPrompt ?? blueprint?.systemPrompt;
		if (!systemPrompt) throw new Error(`Agent profile has no system prompt: ${profile.id}`);
		return (
			await resolveDesktopSessionConfig(
				{
					cwd: session.cwd,
					executionMode,
					sessionPath,
					automaticRetry: false,
					...this.createMemberPromptContext(
						session.id,
						memberId,
						buildTeamRosterSnapshot(document, team),
						systemPrompt,
						member?.assignment?.instructions,
					),
					agentConfiguration: {
						template: null,
						overrides: toAgentConfigurationOverrides(profile.abilities, pinnedAbilityContext(blueprint)),
					},
					sessionRuntimeTools: runtimeTools,
				},
				"other",
				"interactive",
			)
		).config;
	}

	private createMemberPromptContext(
		teamSessionId: string,
		memberId: string,
		roster: ReturnType<typeof buildTeamRosterSnapshot>,
		roleInstructions: string,
		assignmentInstructions?: string,
	): TeamMemberPromptContext {
		return {
			systemPromptCachePrefixAddon: buildTeamSharedOperatingContext(roster),
			systemPromptVolatileAddon: buildTeamMemberOperatingContext(
				roster,
				memberId,
				roleInstructions,
				assignmentInstructions,
			),
			promptCacheKey: stableTeamEventId(["team-prompt-cache", teamSessionId]),
			bindPinnedModelContext: (context) => {
				context.signal.throwIfAborted();
				const session = this.options.sessionState.get(teamSessionId);
				const member = session?.memberRuntime[memberId];
				if (!session || !member?.sharedCheckpointId) return undefined;
				if (!session.coordinationRuntime) throw new Error("Team coordination conversation is unavailable");
				return restoreTeamMemberPinnedContext({
					memberId,
					participantConversationId: member.sessionId,
					checkpointId: member.sharedCheckpointId,
					coordinationConversationId: session.coordinationRuntime.sessionId,
					state: this.options.collaborationStore.read(session),
					memberDocument: this.options.runtime().readSessionDocument(member.sessionId),
				});
			},
		};
	}
}
