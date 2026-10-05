import { describe, expect, it } from "vitest";
import {
	buildTeamMemberOperatingContext,
	buildTeamOperatingContext,
	buildTeamSharedOperatingContext,
	type TeamRosterSnapshot,
	teamRosterFingerprint,
} from "../src/index.js";

const roster: TeamRosterSnapshot = {
	teamId: "team",
	teamName: "Product Team",
	teamRevision: 1,
	leaderParticipantId: "leader",
	members: [
		{
			participantId: "leader",
			handle: "lead",
			displayName: "Lead",
			isLeader: true,
			role: "leader",
			responsibilitySummary: "Coordinate delivery",
			capabilities: [],
			availability: "idle",
			profileRevision: 1,
		},
		{
			participantId: "builder",
			handle: "builder",
			displayName: "Builder",
			isLeader: false,
			role: "builder",
			responsibilitySummary: "Implement changes",
			capabilities: [],
			availability: "idle",
			profileRevision: 1,
		},
	],
};

describe("buildTeamOperatingContext", () => {
	it("keeps the shared roster prefix identical and puts identity after it", () => {
		const leader = buildTeamOperatingContext(roster, "leader", "Lead the work.");
		const builder = buildTeamOperatingContext(roster, "builder", "Build the work.");
		const boundary = "</agent_team_operating_context>";

		expect(leader.slice(0, leader.indexOf(boundary) + boundary.length)).toBe(
			builder.slice(0, builder.indexOf(boundary) + boundary.length),
		);
		expect(leader).toContain("A subagent is a temporary private helper");
		expect(builder).toContain("You are @builder");
	});

	it("exposes shared and member-specific blocks for cache-safe Turn composition", () => {
		const shared = buildTeamSharedOperatingContext(roster);
		const leader = buildTeamMemberOperatingContext(roster, "leader", "Lead the work.");
		const builder = buildTeamMemberOperatingContext(roster, "builder", "Build the work.");

		expect(shared).toContain("Persistent Team roster:");
		expect(shared).toContain("team_read_shared_history");
		expect(shared).toContain("quoted data");
		expect(shared).not.toContain("<agent_team_member_identity>");
		expect(leader).toContain("You are @lead");
		expect(builder).toContain("You are @builder");
		expect(buildTeamOperatingContext(roster, "leader", "Lead the work.")).toBe(`${shared}\n\n${leader}`);
	});

	it("lets the leader answer bounded requests without making every member run the full workflow", () => {
		const leader = buildTeamOperatingContext(roster, "leader", "Lead the work.");
		const builder = buildTeamOperatingContext(roster, "builder", "Build the work.");

		expect(leader).toContain("Answer simple questions, status requests, and bounded read-only reviews directly");
		expect(leader).toContain("your own enabled capabilities suffice");
		expect(leader).toContain("Honor explicit user-requested workflows and required review");
		expect(builder).not.toContain("Answer simple questions, status requests");
		expect(builder).toContain("Return your result to the leader");
		expect(builder).toContain("Do not repeat the leader's user-facing kickoff, plan, or final-delivery ceremony");
		expect(builder).toContain("Surface blockers and required approvals to the leader");
	});

	it("keeps capability, approval, and durable task boundaries in both composed roles", () => {
		for (const participantId of ["leader", "builder"]) {
			const context = buildTeamOperatingContext(roster, participantId, "Follow your assignment.");
			expect(context).toContain("Use only tools exposed in the current turn");
			expect(context).toContain("do not grant capabilities or bypass approval requirements");
			expect(context).toContain("Only the leader transfers Team task ownership");
			expect(context).toContain("A wait timeout is not task failure");
			expect(context).toContain("not teamTaskIds for team_wait_tasks");
			expect(context).not.toMatch(/spawn_agent|subagent_spawn/);
		}
	});

	it("moves leader guidance with the roster role while preserving the persona and assignment", () => {
		const reassigned: TeamRosterSnapshot = {
			...roster,
			leaderParticipantId: "builder",
			members: roster.members.map((member) => ({ ...member, isLeader: member.participantId === "builder" })),
		};
		const promoted = buildTeamOperatingContext(reassigned, "builder", "Build the work.", "Require security review.");
		const formerLeader = buildTeamOperatingContext(reassigned, "leader", "Lead the work.");

		expect(promoted).toContain("Team role: leader.");
		expect(promoted).toContain("Answer simple questions, status requests");
		expect(promoted).toContain("Build the work.");
		expect(promoted).toContain("Require security review.");
		expect(formerLeader).toContain("Team role: member.");
		expect(formerLeader).toContain("Return your result to the leader");
		expect(formerLeader).not.toContain("Answer simple questions, status requests");
	});

	it("appends the team assignment after the profile role instructions instead of replacing them", () => {
		const member = buildTeamMemberOperatingContext(
			roster,
			"builder",
			"Build the work.",
			"Ship behind a feature flag in this team.",
		);

		expect(member).toContain("Build the work.");
		expect(member.indexOf("<team_assignment>")).toBeGreaterThan(member.indexOf("Build the work."));
		expect(member).toContain("Ship behind a feature flag in this team.");
		expect(member).toContain("Product Team");
	});

	it("keeps one member's assignment out of the shared roster prefix", () => {
		const shared = buildTeamSharedOperatingContext(roster);
		const builder = buildTeamMemberOperatingContext(roster, "builder", "Build.", "Team-only instruction.");
		const leader = buildTeamMemberOperatingContext(roster, "leader", "Lead.");

		// 任务书的补充指令是成员私有的；只有职责摘要才进入全队共享名册。
		expect(shared).not.toContain("Team-only instruction.");
		expect(leader).not.toContain("Team-only instruction.");
		expect(builder).toContain("Team-only instruction.");
	});

	it("omits the assignment block when the team adds nothing", () => {
		expect(buildTeamMemberOperatingContext(roster, "leader", "Lead.")).not.toContain("<team_assignment>");
		expect(buildTeamMemberOperatingContext(roster, "leader", "Lead.", "")).not.toContain("<team_assignment>");
	});
});

describe("teamRosterFingerprint", () => {
	it("changes when a teammate's responsibility or the leader changes", () => {
		const [leader, builder] = roster.members;
		if (!leader || !builder) throw new Error("fixture roster is incomplete");
		const retitled: TeamRosterSnapshot = {
			...roster,
			members: [leader, { ...builder, responsibilitySummary: "Own the release checklist" }],
		};
		const handedOver: TeamRosterSnapshot = {
			...roster,
			leaderParticipantId: "builder",
			members: [
				{ ...leader, isLeader: false },
				{ ...builder, isLeader: true },
			],
		};

		// 这些变化都渲染进每位成员的提示词，却不改变任何人自己的 Profile 修订或任务书。
		expect(teamRosterFingerprint(retitled)).not.toBe(teamRosterFingerprint(roster));
		expect(teamRosterFingerprint(handedOver)).not.toBe(teamRosterFingerprint(roster));
	});

	it("ignores roster facts that never reach the prompt", () => {
		const [leader, builder] = roster.members;
		if (!leader || !builder) throw new Error("fixture roster is incomplete");
		const unrendered: TeamRosterSnapshot = {
			...roster,
			teamRevision: 7,
			members: [{ ...leader, availability: "running", profileRevision: 4 }, builder],
		};

		expect(teamRosterFingerprint(unrendered)).toBe(teamRosterFingerprint(roster));
	});
});
