import { describe, expect, it } from "vitest";
import { isTeamPublicationOperationRecord, type TeamPublicationOperationRecord } from "../src/collaboration.js";
import { createTeamSharedContextCheckpoint, findTeamPrivateEntriesCoveredByCheckpoint } from "../src/shared-context.js";

const publication: TeamPublicationOperationRecord = {
	customType: "agent-team.publication-operation.v1",
	operationId: "publish:work:attempt",
	workItemId: "work",
	sourceParticipantConversationId: "member-conversation",
	sourceTurnId: "turn",
	sourceMessageEntryId: "final",
	publicMessageEntryId: "public-result",
	state: "completed",
	generation: 1,
};

describe("Team publication source contract", () => {
	it("reads legacy single-source and new ordered aggregate references without migration", () => {
		expect(isTeamPublicationOperationRecord(publication)).toBe(true);
		expect(isTeamPublicationOperationRecord({ ...publication, sourceMessageEntryIds: ["first", "final"] })).toBe(
			true,
		);
	});
	it.each(
		[[], [""], ["final", "first"], ["first", "first", "final"], ["first", 42, "final"], "final"].map(
			(sourceMessageEntryIds) => ({ sourceMessageEntryIds }),
		),
	)("rejects empty, duplicated, malformed, or nonterminal aggregate references (%j)", ({ sourceMessageEntryIds }) => {
		expect(isTeamPublicationOperationRecord({ ...publication, sourceMessageEntryIds })).toBe(false);
	});
	it("omits all covered private text sources only for the participant whose result is in the checkpoint", () => {
		const checkpoint = createTeamSharedContextCheckpoint({
			coordinationConversationId: "coordination",
			throughConversationRevision: 1,
			policyVersion: "public-results-v1",
			records: [],
			memberHandles: {},
		});
		const input = {
			checkpoint: { ...checkpoint, sourceEntryIds: ["public-result"] },
			participantConversationId: "member-conversation",
			publications: [
				{ ...publication, sourceMessageEntryIds: ["first", "final"] },
				{
					...publication,
					sourceParticipantConversationId: "other-member",
					sourceMessageEntryIds: ["foreign", "final"],
				},
				{ ...publication, publicMessageEntryId: "other-result", sourceMessageEntryIds: ["unpublished", "final"] },
			],
		};
		expect(findTeamPrivateEntriesCoveredByCheckpoint(input)).toEqual(["final", "first"]);
		expect(findTeamPrivateEntriesCoveredByCheckpoint({ ...input, publications: [publication] })).toEqual(["final"]);
	});
});
